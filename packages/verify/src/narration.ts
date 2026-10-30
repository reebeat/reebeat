// F8, narration is where the Timeline says: each Line's audio, decoded from its file in the speech cache, is found in
// the decoded mixed track of the mp4 within one frame of the Line's start frame. The offset of each Line is reported,
// positive when the narration is late.
import { timedLines } from "@tsukuri/core";
import type { PlacedTimedLine } from "@tsukuri/core";
import { audioOffsetMs, decodeMonoPcm } from "@tsukuri/encode-ffmpeg";
import { Array as Arr, Effect, FileSystem, Option, Path } from "effect";

import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import {
  frameStartMs,
  msToFrames,
  signedFrames,
  withinOneFrame,
} from "./units.ts";
import { fail, notApplicable, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";
import { narrationMatchFloor, onsetIndex } from "./wav.ts";

/** How far from its start frame, in milliseconds, a Line is looked for. */
const windowMs = 150;

/** Where speech starts in a clip: its first sample above this magnitude. */
const speechThreshold = 0.005;

const sampleRate = 48_000;

/**
 * The verdict when the speech cache the check was pointed at lacks the audio of a Line, else none. F8 compares each Line's
 * narration with the file the build read from its speech cache, so a cache that is not there is a different failure
 * from a file ffmpeg cannot decode: it names the directory looked in and the flag that points the check elsewhere.
 */
const missingCache = Effect.fn("missingCache")(function* missingCache(
  build: Build,
  lines: readonly PlacedTimedLine[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const absent = yield* Effect.filter(lines, ({ timed }) =>
    Effect.map(
      fs.exists(path.join(build.cacheDir, timed.audio.file)),
      (exists) => !exists
    )
  );

  return Option.map(Arr.head(absent), ({ id, timed }) =>
    fail(
      "F8",
      `the speech cache has no audio for ${absent.length} of ${lines.length} Lines (first: Line ${id}, file ${timed.audio.file}); the check looked in ${build.cacheDir}: pass the directory the build used as --cache-dir (the default is speech-cache beside the source)`,
      [["Lines without audio in the speech cache", absent.length]]
    )
  );
});

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

      if (Option.isSome(build.silentNarrator)) {
        return notApplicable(
          "F8",
          `N/A (silent stand-in): build.json lists the narrator ${build.silentNarrator.value}, whose narration is silent by construction (its sounds are audible and F1 checks them), so no Line has an onset to find`,
          [["Lines not observed", lines.length]]
        );
      }

      const missing = yield* missingCache(build, lines);

      if (Option.isSome(missing)) {
        return missing.value;
      }

      const track = yield* decodeMonoPcm(build.mp4);

      const matches = yield* Effect.forEach(lines, ({ timed: line }) =>
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

      const problems = Arr.flatMap(rows, ([{ id, timed }, match]) => {
        if (match.score < narrationMatchFloor) {
          return [
            `Line ${id}: its audio is not found within ${windowMs} ms of its scheduled frame ${timed.startFrame} (best match ${match.score.toFixed(2)}, at least ${narrationMatchFloor} needed)`,
          ];
        }

        return withinOneFrame(match.frames)
          ? []
          : [
              `Line ${id} starts ${signedFrames(match.frames)} frames from its scheduled frame ${timed.startFrame}`,
            ];
      });

      const measured: Measured = [
        ["Lines checked", lines.length],
        ...Arr.flatMap(rows, ([{ id }, match]): Measured => [
          [`${id} offset (frames)`, signedFrames(match.frames)],
          [`${id} match score`, match.score.toFixed(3)],
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
