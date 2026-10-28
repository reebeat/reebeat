// `bun run journey`: the whole road on one story (spec 0001, "Journey"). Build it, check the build, build it a
// second time and compare the two builds (F6). The first failure stops the journey.
import { Console, Effect, Path } from "effect";

import { buildStory, renderSummary } from "./build.ts";
import { checkBuild, reportVerdicts } from "./check.ts";
import { storyName } from "./source.ts";
import { Verifier } from "./verifier.ts";

export interface JourneyOptions {
  readonly cacheDir: string;
  /** The directory that receives `<name>` and `<name>-2`. */
  readonly outRoot: string;
  readonly story: string;
}

export const journey = Effect.fn("journey")(function* journey(
  options: JourneyOptions
) {
  const path = yield* Path.Path;
  const verifier = yield* Verifier;
  const name = yield* storyName(options.story);
  const first = path.join(options.outRoot, name);
  const second = path.join(options.outRoot, `${name}-2`);

  const build = (out: string) =>
    buildStory({ cacheDir: options.cacheDir, name, out, story: options.story });

  yield* Console.log(renderSummary(yield* build(first)));
  yield* checkBuild({ dir: first, source: options.story });
  yield* Console.log(renderSummary(yield* build(second)));

  return yield* reportVerdicts([yield* verifier.compare(first, second)]);
});
