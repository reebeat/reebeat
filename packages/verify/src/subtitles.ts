// F2, subtitles equal narration: the `.vtt` file and the `mov_text` stream of the mp4 each hold one cue per Line,
// the cue text is the narration text of the source, and its start and end lie within one frame of the Line's frames
// in the Timeline.
import { MediaTools } from "@reebeat/encode-ffmpeg";
import { parseVtt } from "@reebeat/subtitles";
import type { VttCue } from "@reebeat/subtitles";
import { Array as Arr, Effect, Result } from "effect";

import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import { expectedLines } from "./truth.ts";
import type { ExpectedLine } from "./truth.ts";
import { msToFrames, signedFrames, withinOneFrame } from "./units.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";

interface Comparison {
  readonly maxEndFrames: number;
  readonly maxStartFrames: number;
  readonly problems: readonly string[];
}

const compareCue = (
  source: string,
  want: ExpectedLine,
  have: VttCue,
  fps: number
): readonly string[] => {
  const start = msToFrames(have.startMs, fps) - want.startFrame;
  const end = msToFrames(have.endMs, fps) - want.endFrame;

  return [
    ...(have.text === want.text
      ? []
      : [
          `${source}, Line ${want.lineId}: the subtitle is "${have.text}", the narration is "${want.text}"`,
        ]),
    ...(withinOneFrame(start)
      ? []
      : [
          `${source}, Line ${want.lineId}: the subtitle starts ${signedFrames(start)} frames from the Line`,
        ]),
    ...(withinOneFrame(end)
      ? []
      : [
          `${source}, Line ${want.lineId}: the subtitle ends ${signedFrames(end)} frames from the Line`,
        ]),
  ];
};

const maxDeviation = (values: readonly number[]): number =>
  Arr.reduce(values, 0, (most, value) => Math.max(most, Math.abs(value)));

/** One cue per Line, in order, each equal in text and within a frame in time. */
const compare = (
  source: string,
  expected: readonly ExpectedLine[],
  cues: readonly VttCue[],
  fps: number
): Comparison => {
  const pairs = Arr.zip(expected, cues);

  return {
    maxEndFrames: maxDeviation(
      Arr.map(
        pairs,
        ([want, have]) => msToFrames(have.endMs, fps) - want.endFrame
      )
    ),
    maxStartFrames: maxDeviation(
      Arr.map(
        pairs,
        ([want, have]) => msToFrames(have.startMs, fps) - want.startFrame
      )
    ),
    problems: [
      ...(expected.length === cues.length
        ? []
        : [
            `${source} holds ${cues.length} cues, the source has ${expected.length} Lines`,
          ]),
      ...Arr.flatMap(pairs, ([want, have]) =>
        compareCue(source, want, have, fps)
      ),
    ],
  };
};

const measuredOf = (
  source: string,
  comparison: Comparison,
  cues: number
): Measured => [
  [`${source} cues`, cues],
  [
    `${source} max start deviation (frames)`,
    Math.round(comparison.maxStartFrames * 100) / 100,
  ],
  [
    `${source} max end deviation (frames)`,
    Math.round(comparison.maxEndFrames * 100) / 100,
  ],
];

const embeddedCues = Effect.fnUntraced(function* embedded(mp4: string) {
  const tools = yield* MediaTools;

  const bytes = yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    mp4,
    "-map",
    "0:s:0",
    "-f",
    "webvtt",
    "pipe:1",
  ]);

  return parseVtt(new TextDecoder().decode(bytes));
});

/** F2 on the `.vtt` file and the `mov_text` stream. */
export const subtitles = (build: Build) =>
  guarded(
    "F2",
    Effect.gen(function* observe() {
      const expected = expectedLines(build);

      if (Result.isFailure(expected)) {
        return fail("F2", expected.failure);
      }

      const { fps } = build.plan.settings;
      const file = parseVtt(build.vtt);
      const stream = yield* embeddedCues(build.mp4);
      const fileResult = compare(".vtt file", expected.success, file, fps);

      const streamResult = compare(
        "mov_text stream",
        expected.success,
        stream,
        fps
      );

      return verdictOf(
        "F2",
        `the .vtt file and the mov_text stream hold one cue per Line (${expected.success.length}), each equal to its narration and within one frame of it`,
        [...fileResult.problems, ...streamResult.problems],
        [
          ...measuredOf(".vtt file", fileResult, file.length),
          ...measuredOf("mov_text stream", streamResult, stream.length),
        ]
      );
    })
  );
