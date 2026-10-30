// `tsukuri journey`: the whole road on one story (spec 0001, "Journey"). Build it, check the build, build it a
// second time and compare the two builds (F6). The first failure stops the journey. Both builds run on the same
// selection, and so does the check.
import type { Selection } from "@tsukuri/services";
import { Console, Duration, Effect, Path } from "effect";

import { buildStory, renderSummary } from "./build.ts";
import { checkBuild, reportVerdicts } from "./check.ts";
import { storyName } from "./source.ts";
import { Verifier } from "./verifier.ts";

export interface JourneyOptions {
  readonly cacheDir: string;
  /** The directory that receives `<name>` and `<name>-2`. */
  readonly outRoot: string;
  readonly refreshSpeech: boolean;
  readonly selection: Selection;
  readonly story: string;
}

/** Runs a phase of the journey and prints how long it took. */
const phase = <A, E, R>(name: string, run: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.timed(run), ([elapsed, result]) =>
    Effect.as(
      Console.log(`${name}: ${Duration.toSeconds(elapsed).toFixed(1)} s`),
      result
    )
  );

export const journey = Effect.fn("journey")(function* journey(
  options: JourneyOptions
) {
  const path = yield* Path.Path;
  const verifier = yield* Verifier;
  const name = yield* storyName(options.story);
  const first = path.join(options.outRoot, name);
  const second = path.join(options.outRoot, `${name}-2`);

  const build = (out: string) =>
    buildStory({
      cacheDir: options.cacheDir,
      name,
      out,
      refreshSpeech: options.refreshSpeech,
      selection: options.selection,
      story: options.story,
    });

  yield* Console.log(renderSummary(yield* build(first)));
  yield* phase(
    "check",
    checkBuild({
      cacheDir: options.cacheDir,
      dir: first,
      source: options.story,
    })
  );
  yield* Console.log(renderSummary(yield* build(second)));

  return yield* phase(
    "compare",
    Effect.flatMap(verifier.compare(first, second), (verdict) =>
      reportVerdicts([verdict])
    )
  );
});
