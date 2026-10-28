// F1, cue timing: every Cue of the Timeline has an observed step in the written video within one frame of its
// fire frame. A `next` or `focus` step is the first frame in a window of three frames either side of the fire frame
// whose pixels differ from the frame before it, inside the grid cell of the Element the Cue acts on (`cueRegion`); an
// `sfx` is the start of the catalogue sound found in the decoded audio track near the fire frame. The offset of each
// Cue is reported, positive when the step is late.
import { audioOffsetMs, decodeMonoPcm } from "@reebeat/encode-ffmpeg";
import type { Box } from "@reebeat/encode-ffmpeg";
import { sfxNames, synthClip } from "@reebeat/sounds-synth";
import { Array as Arr, Effect, Option } from "effect";

import { cueRegion } from "./cueRegion.ts";
import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import { planCues, timedLines } from "./planParts.ts";
import { stepOffset } from "./steps.ts";
import {
  frameStartMs,
  msToFrames,
  signedFrames,
  withinOneFrame,
} from "./units.ts";
import { fail, notApplicable, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";
import { soundMatchFloor, withSilentLead } from "./wav.ts";

/** How far from the fire frame, in milliseconds, the catalogue sound is looked for. */
const soundWindowMs = 150;

/**
 * The sound is correlated with a silent lead of this many milliseconds before it. A tonal sound (`ding`) matches
 * itself at every period of its tone, and only the silence before its first sample tells the true start from them.
 */
const soundLeadMs = 10;

interface CueFact {
  readonly arg: string | null;
  readonly cueId: string;
  readonly fireFrame: number;
  readonly kind: "focus" | "next" | "sfx";
  /** Where a step of the picture shows (the target Element's cell); none: the whole frame. */
  readonly region: Box | undefined;
}

/** The Cues of the Timeline with their kind and argument from the Plan, in timeline order. */
const cueFacts = (build: Build): readonly CueFact[] => {
  const planned = planCues(build.plan);

  return Arr.flatMap(timedLines(build.plan.timeline), (line) =>
    Arr.flatMap(line.cues, (timed) =>
      Arr.map(
        Arr.filter(planned, (cue) => cue.id === timed.cueId),
        (cue): CueFact => ({
          arg: cue.arg,
          cueId: cue.id,
          fireFrame: timed.fireFrame,
          kind: cue.kind,
          region: Option.getOrUndefined(cueRegion(build.plan, cue.id)),
        })
      )
    )
  );
};

/** An observed offset in frames, or why none was observed. */
type Observation =
  | {
      readonly frames: number;
      /** The best match of a sound; undefined for a step of the picture. */
      readonly score: number | undefined;
      readonly tag: "found";
    }
  | { readonly reason: string; readonly tag: "missing" };

const found = (frames: number, score?: number): Observation => ({
  frames,
  score,
  tag: "found",
});

const missing = (reason: string): Observation => ({ reason, tag: "missing" });

/** Where the catalogue sound `name` starts in the mixed track, as an offset from the fire frame. */
const observeSound = (
  track: Float32Array,
  name: string | null,
  fireFrame: number,
  fps: number
): Observation => {
  const known = Arr.findFirst(sfxNames, (candidate) => candidate === name);

  if (Option.isNone(known)) {
    return missing(`the sound ${name ?? "(none)"} is not in the catalogue`);
  }

  const reference = withSilentLead(synthClip(known.value).samples, soundLeadMs);

  const { offsetMs, score } = audioOffsetMs(
    track,
    reference,
    frameStartMs(fireFrame, fps) - soundLeadMs,
    soundWindowMs
  );

  return score < soundMatchFloor
    ? missing(
        `the sound is not found within ${soundWindowMs} ms (best match ${score.toFixed(2)}, at least ${soundMatchFloor} needed)`
      )
    : found(msToFrames(offsetMs, fps), score);
};

const hasSound = (facts: readonly CueFact[]): boolean =>
  Arr.some(facts, (cue) => cue.kind === "sfx");

/** The window of frames either side of the fire frame in which a step is looked for. */
const cueWindowFrames = 3;

const observeCueStep = (
  mp4: string,
  fireFrame: number,
  region: Box | undefined
) =>
  Effect.map(stepOffset(mp4, fireFrame, cueWindowFrames, region), (offset) =>
    offset === undefined
      ? missing(
          `no frame within ${cueWindowFrames} frames of frame ${fireFrame} differs from the one before it`
        )
      : found(offset)
  );

const label = (cue: CueFact): string =>
  `${cue.cueId} ${cue.kind}${cue.arg === null ? "" : `: ${cue.arg}`} at frame ${cue.fireFrame}`;

/** F1 on the written video. */
export const cueTiming = (build: Build) =>
  guarded(
    "F1",
    Effect.gen(function* observe() {
      const all = cueFacts(build);
      const silent = Option.isSome(build.silentNarrator);

      const skipped = silent
        ? Arr.filter(all, (cue) => cue.kind === "sfx")
        : [];

      const facts = silent ? Arr.filter(all, (cue) => cue.kind !== "sfx") : all;
      const { fps } = build.plan.settings;

      const track = hasSound(facts)
        ? yield* decodeMonoPcm(build.mp4)
        : new Float32Array(0);

      const observations = yield* Effect.forEach(facts, (cue) =>
        cue.kind === "sfx"
          ? Effect.succeed(observeSound(track, cue.arg, cue.fireFrame, fps))
          : observeCueStep(build.mp4, cue.fireFrame, cue.region)
      );

      const rows = Arr.zip(facts, observations);

      const problems = Arr.flatMap(rows, ([cue, seen]) => {
        if (seen.tag === "missing") {
          return [`${label(cue)}: ${seen.reason}`];
        }

        return withinOneFrame(seen.frames)
          ? []
          : [
              `${label(cue)}: the step is observed ${signedFrames(seen.frames)} frames from its fire frame`,
            ];
      });

      const measured: Measured = [
        ["cues checked", facts.length],
        ...(skipped.length === 0
          ? []
          : ([
              [
                "sfx cues",
                `N/A (silent stand-in): ${skipped.length} not observed`,
              ],
            ] as const)),
        ...Arr.flatMap(rows, ([cue, seen]): Measured => [
          [
            `${cue.cueId} ${cue.kind} offset (frames)`,
            seen.tag === "found" ? signedFrames(seen.frames) : "not observed",
          ],
          ...(seen.tag === "found" && seen.score !== undefined
            ? ([
                [`${cue.cueId} ${cue.kind} match score`, seen.score.toFixed(3)],
              ] as const)
            : []),
        ]),
      ];

      if (facts.length === 0) {
        return skipped.length === 0
          ? fail("F1", "the Timeline has no Cue to observe", measured)
          : notApplicable(
              "F1",
              "N/A (silent stand-in): the only Cues are sfx and the narrator's track is silent by construction",
              measured
            );
      }

      return verdictOf(
        "F1",
        `all ${facts.length} Cues are observed within one frame of their fire frame${skipped.length === 0 ? "" : `; the ${skipped.length} sfx Cues are N/A (silent stand-in)`}`,
        problems,
        measured
      );
    })
  );
