// `runChecks`: every output-side falsifier on one build directory (spec 0001, F1 to F5 and F7 to F9). Each check
// reads the written files and the source, never the pipeline that wrote them. F6 compares two directories and is
// `compareBuilds`.
import { Effect } from "effect";

import { chapters } from "./chapters.ts";
import { deckVerdicts } from "./deckChecks.ts";
import { effectTiming } from "./effects.ts";
import type { BuildInvalid } from "./errors.ts";
import type { CheckServices } from "./guard.ts";
import { loadBuild } from "./load.ts";
import type { CheckOptions } from "./load.ts";
import { narration } from "./narration.ts";
import { oneSource } from "./sources.ts";
import { subtitles } from "./subtitles.ts";
import { transitions } from "./transitions.ts";
import type { Verdict } from "./verdict.ts";

/**
 * The verdicts of F1 to F5 and F7 to F9 on `buildDir`, in that order. Fails with `BuildInvalid` when the directory
 * has no `build.json`, `plan.json` or media to check; a falsifier that does not hold is a failing Verdict.
 */
export const runChecks = Effect.fn("runChecks")(function* run(
  options: CheckOptions
): Effect.fn.Return<readonly Verdict[], BuildInvalid, CheckServices> {
  const build = yield* loadBuild(options);
  const effects = yield* effectTiming(build);
  const subtitle = yield* subtitles(build);
  const [notes, fragments] = yield* deckVerdicts(build);
  const source = yield* oneSource(build);
  const transition = yield* transitions(build);
  const spoken = yield* narration(build);
  const container = yield* chapters(build);

  return [
    effects,
    subtitle,
    notes,
    fragments,
    source,
    transition,
    spoken,
    container,
  ];
});
