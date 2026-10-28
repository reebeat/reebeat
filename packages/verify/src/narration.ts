// F8, narration is where the Timeline says: each Line's audio, decoded from its file in the speech cache, is found in
// the decoded mixed track of the mp4 within one frame of the Line's start frame. The offset of each Line is reported,
// positive when the narration is late.
import { audioOffsetMs, decodeMonoPcm } from "@reebeat/video";
import { Array as Arr, Effect, Path } from "effect";

import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import { timedLines } from "./planParts.ts";
import {
  frameStartMs,
  msToFrames,
  signedFrames,
  withinOneFrame,
} from "./units.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";
import { narrationMatchFloor, onsetIndex } from "./wav.ts";

/** How far from its start frame, in milliseconds, a Line is looked for. */
const windowMs = 150;

/** Where speech starts in a clip: its first sample above this magnitude. */
const speechThreshold = 0.005;

const sampleRate = 48_000;

/** F8 on the narration of the written video. */
export const narration = (build: Build) =>
  guarded(
    "F8",
    Effect.gen(function* observe() {
      const path = yield* Path.Path;
      const { fps } = build.plan.settings;

      const lines = timedLines(build.plan.timeline);

      if (lines.length === 0) {
        return fail("F8", "the Timeline has no Line to observe");
      }

      const track = yield* decodeMonoPcm(build.mp4);

      const matches = yield* Effect.forEach(lines, (line) =>
        Effect.map(
          decodeMonoPcm(path.join(build.cacheDir, line.audio.file)),
          (reference) => {
            const skipped = onsetIndex(reference, speechThreshold);

            const { offsetMs, score } = audioOffsetMs(
              track,
              reference.subarray(skipped),
              frameStartMs(line.startFrame, fps) +
                (skipped * 1000) / sampleRate,
              windowMs
            );

            return { frames: msToFrames(offsetMs, fps), score };
          }
        )
      );

      const rows = Arr.zip(lines, matches);

      const problems = Arr.flatMap(rows, ([line, match]) => {
        if (match.score < narrationMatchFloor) {
          return [
            `Line ${line.lineId}: its audio is not found within ${windowMs} ms of its scheduled frame ${line.startFrame} (best match ${match.score.toFixed(2)}, at least ${narrationMatchFloor} needed)`,
          ];
        }

        return withinOneFrame(match.frames)
          ? []
          : [
              `Line ${line.lineId} starts ${signedFrames(match.frames)} frames from its scheduled frame ${line.startFrame}`,
            ];
      });

      const measured: Measured = [
        ["Lines checked", lines.length],
        ...Arr.flatMap(rows, ([line, match]): Measured => [
          [`${line.lineId} offset (frames)`, signedFrames(match.frames)],
          [`${line.lineId} match score`, match.score.toFixed(3)],
        ]),
      ];

      return verdictOf(
        "F8",
        `all ${lines.length} Lines start within one frame of their scheduled frame`,
        problems,
        measured
      );
    })
  );
