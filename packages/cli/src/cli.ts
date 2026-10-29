// The commands of `reebeat` and what runs them. A handler turns its flags into the options of one program
// (`plan.ts`, `build.ts`, `check.ts`, `journey.ts`) and chooses the adapters: `reebeat.config.json` beside the story
// and the `--speech`, `--aligner`, `--sounds`, `--renderer`, `--capturer`, `--encoder` and `--cache` flags select them
// (`selection.ts`), and `Composition` turns the selection into Layers (`adapters.ts`). Every expected failure is
// printed once, by `run`.
import { choices, defaults, requireOutputName } from "@reebeat/services";
import type { Selection, SelectionKey } from "@reebeat/services";
import { Array as Arr, Console, Effect, Option, Record, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { Composition } from "./adapters.ts";
import type { RunOptions } from "./adapters.ts";
import { buildStory, renderSummary } from "./build.ts";
import { checkBuild } from "./check.ts";
import { journey } from "./journey.ts";
import { planText, timedPlanText } from "./plan.ts";
import { reportFailure } from "./report.ts";
import { readSelection } from "./selection.ts";
import type { SelectionFlags } from "./selection.ts";
import { defaultCache, storyName } from "./source.ts";
import { version } from "./version.ts";

const story = Argument.String("story").pipe(
  Argument.withDescription("The .fountain screenplay")
);

const cacheDir = Flag.String("cache-dir").pipe(
  Flag.withDescription(
    "The directory of the fs cache (default: speech-cache beside the story)"
  ),
  Flag.optional
);

const Seconds = Schema.Finite.check(Schema.isGreaterThan(0));

/** One optional flag per key of the selection, named after the key: `--speech kokoro`, `--aligner even`, ... */
const selectionFlags = Record.map(choices, (options, key) =>
  Flag.String(key).pipe(
    Flag.withDescription(
      `The ${key} adapter: ${Arr.join(options, " | ")} (default ${defaults[key]}); beats reebeat.config.json`
    ),
    Flag.optional
  )
);

/** The selection flags of a handler's input, key by key. */
const flagsOf = (input: SelectionFlags): SelectionFlags =>
  Record.map(choices, (_, key: SelectionKey) => input[key]);

/** The selection of a story's config file and flags, and where its cache is. */
const settingsFor = Effect.fnUntraced(function* settingsFor(
  storyFile: string,
  flags: SelectionFlags,
  cacheFlag: Option.Option<string>,
  captureTimeoutSeconds?: number
) {
  const selection: Selection = yield* readSelection(storyFile, flags);

  const run: RunOptions = {
    cacheDir: Option.isSome(cacheFlag)
      ? cacheFlag.value
      : yield* defaultCache(storyFile),
    captureTimeoutSeconds,
  };

  return { run, selection };
});

const plan = Command.make(
  "plan",
  {
    ...selectionFlags,
    cacheDir,
    json: Flag.Boolean("json").pipe(
      Flag.withDescription("Print plan.json instead of the review text"),
      Flag.withDefault(false)
    ),
    story,
    timing: Flag.Boolean("timing").pipe(
      Flag.withDescription("Add frames from the speech cache (read-only)"),
      Flag.withDefault(false)
    ),
  },
  Effect.fn("reebeat.plan")(function* handlePlan(input) {
    const options = { json: input.json, story: input.story };

    if (!input.timing) {
      yield* Console.log(yield* planText(options));

      return;
    }

    const { run, selection } = yield* settingsFor(
      input.story,
      flagsOf(input),
      input.cacheDir
    );

    yield* Console.log(yield* timedPlanText({ ...options, run, selection }));
  })
).pipe(
  Command.withDescription(
    "Print the Plan of a story for review: scenes, elements, cues and the identity diff"
  ),
  Command.withExamples([
    {
      command: "reebeat plan stories/same-id/story.fountain",
      description: "The review text",
    },
    {
      command: "reebeat plan stories/same-id/story.fountain --timing",
      description: "The review text with frames, from the speech cache",
    },
  ])
);

const build = Command.make(
  "build",
  {
    ...selectionFlags,
    cacheDir,
    captureTimeout: Flag.Finite("capture-timeout").pipe(
      Flag.withDescription(
        "Seconds the capture may take before it fails (default: 120 plus 0.2 per frame)"
      ),
      Flag.withSchema(Seconds),
      Flag.optional
    ),
    name: Flag.String("name").pipe(
      Flag.withDescription(
        "Base name of the .mp4 and .vtt (default: the story's directory name)"
      ),
      Flag.optional
    ),
    out: Flag.String("out").pipe(
      Flag.withDescription(
        "The build directory; an earlier build there is replaced"
      )
    ),
    refreshSpeech: Flag.Boolean("refresh-speech").pipe(
      Flag.withDescription(
        "Fill missing speech cache entries with the selected speech adapter (a stand-in narrator always does)"
      ),
      Flag.withDefault(false)
    ),
    story,
  },
  Effect.fn("reebeat.build")(function* handleBuild(input) {
    // The name first: nothing is read or written for a name that is not a plain stem (`--name ../../escaped`).
    const name = yield* requireOutputName(
      Option.isSome(input.name)
        ? input.name.value
        : yield* storyName(input.story)
    );

    const { run, selection } = yield* settingsFor(
      input.story,
      flagsOf(input),
      input.cacheDir,
      Option.getOrUndefined(input.captureTimeout)
    );

    const summary = yield* buildStory({
      ...run,
      name,
      out: input.out,
      refreshSpeech: input.refreshSpeech,
      selection,
      story: input.story,
    });

    yield* Console.log(renderSummary(summary));
  })
).pipe(
  Command.withDescription(
    "Build the deck, the video and the subtitles of a story on the selected adapters"
  ),
  Command.withExamples([
    {
      command:
        "reebeat build stories/same-id/story.fountain --out build/same-id",
      description: "Compile, narrate from the cache, capture and mux",
    },
    {
      command:
        "reebeat build stories/same-id/story.fountain --speech silent --aligner even --cache-dir /tmp/standin --out build/offline",
      description: "The whole build with no model: the stand-in narrator",
    },
  ])
);

const check = Command.make(
  "check",
  {
    ...selectionFlags,
    cacheDir,
    dir: Argument.String("dir").pipe(
      Argument.withDescription("A build directory made by `reebeat build`")
    ),
    source: Flag.String("source").pipe(
      Flag.withDescription("The .fountain file the build was made from")
    ),
  },
  Effect.fn("reebeat.check")(function* handleCheck(input) {
    const { run, selection } = yield* settingsFor(
      input.source,
      flagsOf(input),
      input.cacheDir
    );

    const parts = (yield* Composition)(selection, run);

    yield* Effect.provide(
      checkBuild({
        cacheDir: run.cacheDir,
        dir: input.dir,
        source: input.source,
      }),
      parts.verifier
    );
  })
).pipe(
  Command.withDescription(
    "Check a build against its source: one verdict per falsifier"
  ),
  Command.withExamples([
    {
      command:
        "reebeat check build/same-id --source stories/same-id/story.fountain",
      description: "Exits non-zero when any verdict fails",
    },
  ])
);

const journeyCommand = Command.make(
  "journey",
  {
    ...selectionFlags,
    cacheDir,
    outRoot: Flag.String("out-root").pipe(
      Flag.withDescription(
        "The directory that receives <name> and <name>-2 (default: build)"
      ),
      Flag.withDefault("build")
    ),
    refreshSpeech: Flag.Boolean("refresh-speech").pipe(
      Flag.withDescription(
        "Fill missing speech cache entries with the selected speech adapter (a stand-in narrator always does)"
      ),
      Flag.withDefault(false)
    ),
    story,
  },
  Effect.fn("reebeat.journey")(function* handleJourney(input) {
    const { run, selection } = yield* settingsFor(
      input.story,
      flagsOf(input),
      input.cacheDir
    );

    const parts = (yield* Composition)(selection, run);

    yield* Effect.provide(
      journey({
        cacheDir: run.cacheDir,
        outRoot: input.outRoot,
        refreshSpeech: input.refreshSpeech,
        selection,
        story: input.story,
      }),
      parts.verifier
    );
  })
).pipe(
  Command.withDescription(
    "Build a story, check the build, build it again and compare the two (F6)"
  ),
  Command.withExamples([
    {
      command: "reebeat journey stories/same-id/story.fountain",
      description: "Builds build/same-id and build/same-id-2",
    },
  ])
);

const reebeat = Command.make("reebeat").pipe(
  Command.withDescription(
    "Explainer decks and videos from a Fountain screenplay"
  ),
  Command.withSubcommands([plan, build, check, journeyCommand])
);

/**
 * Runs `reebeat` with `args`. A usage error prints the help; any other expected failure prints one line (its tag,
 * its source line if it has one, its message); either way the program fails, which the entry point turns into a
 * non-zero exit code.
 */
export const run = (args: readonly string[]) =>
  Command.runWith(reebeat, { version })(args).pipe(
    Effect.tapError(reportFailure)
  );
