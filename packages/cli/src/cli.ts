// The commands of `reebeat` and what runs them. A handler turns its flags into the options of one program
// (`plan.ts`, `build.ts`, `check.ts`); the speech layer is the one thing a flag decides: the cache alone, or the
// local models with `--refresh-speech`. Every expected failure is printed once, by `run`.
import type { Speech } from "@reebeat/speech";
import { speechCacheOnly, speechLive } from "@reebeat/speech";
import { Console, Effect, Option, Schema } from "effect";
import type { Config, Crypto, FileSystem, Layer, Path } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import type { ChildProcessSpawner } from "effect/process";

import { buildStory, renderSummary } from "./build.ts";
import { checkBuild } from "./check.ts";
import { planText, timedPlanText } from "./plan.ts";
import { reportFailure } from "./report.ts";
import { defaultCache, storyName } from "./source.ts";
import { version } from "./version.ts";

const story = Argument.String("story").pipe(
  Argument.withDescription("The .fountain screenplay")
);

const cache = Flag.String("cache").pipe(
  Flag.withDescription(
    "The speech cache directory (default: speech-cache beside the story)"
  ),
  Flag.optional
);

const Seconds = Schema.Finite.check(Schema.isGreaterThan(0));

type SpeechServices =
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path;

/** The narration source: the cache alone, or the cache that the local models fill on a miss. */
const speechLayer = (
  refresh: boolean,
  cacheDir: string
): Layer.Layer<Speech, Config.ConfigError, SpeechServices> =>
  refresh ? speechLive(cacheDir) : speechCacheOnly(cacheDir);

/** The `--cache` directory, or the story's own. */
const cacheOf = (storyFile: string, flag: Option.Option<string>) =>
  Option.match(flag, {
    onNone: () => defaultCache(storyFile),
    onSome: Effect.succeed,
  });

const plan = Command.make(
  "plan",
  {
    cache,
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

    const text = input.timing
      ? yield* Effect.flatMap(cacheOf(input.story, input.cache), (cacheDir) =>
          Effect.provide(timedPlanText(options), speechLayer(false, cacheDir))
        )
      : yield* planText(options);

    yield* Console.log(text);
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
    cache,
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
        "Fill missing speech cache entries with the local models"
      ),
      Flag.withDefault(false)
    ),
    story,
  },
  Effect.fn("reebeat.build")(function* handleBuild(input) {
    const cacheDir = yield* cacheOf(input.story, input.cache);

    const name = Option.isSome(input.name)
      ? input.name.value
      : yield* storyName(input.story);

    const summary = yield* Effect.provide(
      buildStory({
        cacheDir,
        captureTimeoutSeconds: Option.getOrUndefined(input.captureTimeout),
        name,
        out: input.out,
        story: input.story,
      }),
      speechLayer(input.refreshSpeech, cacheDir)
    );

    yield* Console.log(renderSummary(summary));
  })
).pipe(
  Command.withDescription(
    "Build the deck, the video and the subtitles of a story"
  ),
  Command.withExamples([
    {
      command:
        "reebeat build stories/same-id/story.fountain --out build/same-id",
      description: "Compile, narrate from the cache, capture and mux",
    },
  ])
);

const check = Command.make(
  "check",
  {
    dir: Argument.String("dir").pipe(
      Argument.withDescription("A build directory made by `reebeat build`")
    ),
    source: Flag.String("source").pipe(
      Flag.withDescription("The .fountain file the build was made from")
    ),
  },
  Effect.fn("reebeat.check")(function* handleCheck(input) {
    yield* checkBuild({ dir: input.dir, source: input.source });
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

const reebeat = Command.make("reebeat").pipe(
  Command.withDescription(
    "Explainer decks and videos from a Fountain screenplay"
  ),
  Command.withSubcommands([plan, build, check])
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
