// The commands of `tsukuri` and what runs them. A handler turns its flags into the options of one program
// (`plan.ts`, `build.ts`, `check.ts`, `journey.ts`) and chooses the adapters: `tsukuri.config.json` beside the story
// and the `--speech`, `--aligner`, `--sounds`, `--renderer`, `--capturer`, `--encoder` and `--cache` flags select them
// (`selection.ts`), and `Composition` turns the selection into Layers (`adapters.ts`). Every expected failure is
// printed once, by `run`.
import { choices, defaults, requireOutputName } from "@tsukuri/services";
import type { Selection, SelectionKey } from "@tsukuri/services";
import { Array as Arr, Console, Effect, Option, Record, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { Composition } from "./adapters.ts";
import type { RunOptions } from "./adapters.ts";
import { buildStory, renderSummary } from "./build.ts";
import { checkBuild } from "./check.ts";
import { journey } from "./journey.ts";
import { lintStory } from "./lint.ts";
import { planText, timedPlanText } from "./plan.ts";
import { refreshSpeechFlag, reportFailure } from "./report.ts";
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

const refreshSpeech = Flag.Boolean(refreshSpeechFlag).pipe(
  Flag.withDescription(
    "Fill missing speech cache entries with the selected speech adapter (a stand-in narrator always does)"
  ),
  Flag.withDefault(false)
);

const Seconds = Schema.Finite.check(Schema.isGreaterThan(0));

/** One optional flag per key of the selection, named after the key: `--speech kokoro`, `--aligner even`, ... */
const selectionFlags = Record.map(choices, (options, key) =>
  Flag.String(key).pipe(
    Flag.withDescription(
      `The ${key} adapter: ${Arr.join(options, " | ")} (default ${defaults[key]}); beats tsukuri.config.json`
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
      Flag.withDescription(
        "Add the resolved frames of every effect (each instance) and derived event, from the speech cache (read-only)"
      ),
      Flag.withDefault(false)
    ),
  },
  Effect.fn("tsukuri.plan")(function* handlePlan(input) {
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
    "Print the Plan of a story for review: scenes, elements, effects and derived events, and the identity diff. With --timing each effect (every instance) and derived event shows its intent and its resolved frames, and what ended each duration"
  ),
  Command.withExamples([
    {
      command: "tsukuri plan stories/same-id/story.fountain",
      description: "The review text",
    },
    {
      command: "tsukuri plan stories/same-id/story.fountain --timing",
      description:
        "The review text with intent and resolved frames, from the speech cache",
    },
  ])
);

const lint = Command.make(
  "lint",
  {
    ...selectionFlags,
    cacheDir,
    story,
  },
  Effect.fn("tsukuri.lint")(function* handleLint(input) {
    const { run, selection } = yield* settingsFor(
      input.story,
      flagsOf(input),
      input.cacheDir
    );

    yield* lintStory(input.story, { run, selection });
  })
).pipe(
  Command.withDescription(
    "List every problem of a story with its line and the fix (the Fountain importer's errors, then the lint rules: an unused derived event, an until that is its own fire), and every absolute time with its reason. An effect that falls outside its Scene needs the speech timing: lint checks it only when the story's speech cache exists (the selection flags and --cache-dir say which), otherwise `plan --timing` or `build` finds it, not lint"
  ),
  Command.withExamples([
    {
      command: "tsukuri lint stories/same-id/story.fountain",
      description: "Exits non-zero when the story has an error",
    },
    {
      command:
        "tsukuri lint stories/same-id/story.fountain --speech silent --aligner even --cache-dir /tmp/standin",
      description:
        "Also schedules the Plan against the speech cache that the named adapters filled",
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
    refreshSpeech,
    story,
  },
  Effect.fn("tsukuri.build")(function* handleBuild(input) {
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
        "tsukuri build stories/same-id/story.fountain --out build/same-id",
      description: "Compile, narrate from the cache, capture and mux",
    },
    {
      command:
        "tsukuri build stories/same-id/story.fountain --speech silent --aligner even --cache-dir /tmp/standin --out build/offline",
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
      Argument.withDescription("A build directory made by `tsukuri build`")
    ),
    source: Flag.String("source").pipe(
      Flag.withDescription("The .fountain file the build was made from")
    ),
  },
  Effect.fn("tsukuri.check")(function* handleCheck(input) {
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
        "tsukuri check build/same-id --source stories/same-id/story.fountain",
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
    refreshSpeech,
    story,
  },
  Effect.fn("tsukuri.journey")(function* handleJourney(input) {
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
      command: "tsukuri journey stories/same-id/story.fountain",
      description: "Builds build/same-id and build/same-id-2",
    },
  ])
);

const tsukuri = Command.make("tsukuri").pipe(
  Command.withDescription(
    "Explainer decks and videos from a Fountain screenplay"
  ),
  Command.withSubcommands([plan, build, check, journeyCommand, lint])
);

/**
 * Runs `tsukuri` with `args`. A usage error prints the help; any other expected failure prints one line (its tag,
 * its source line if it has one, its message); either way the program fails, which the entry point turns into a
 * non-zero exit code.
 */
export const run = (args: readonly string[]) =>
  Command.runWith(tsukuri, { version })(args).pipe(
    Effect.tapError(reportFailure)
  );
