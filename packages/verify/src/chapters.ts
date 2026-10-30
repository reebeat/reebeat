// F9, chapters and streams: `ffprobe` shows one chapter per Section of the source, titled with the Section text and
// starting within one frame of the slide frame of the Section's first Scene; the mp4 holds an h264 video, an aac audio,
// a mov_text subtitle and one data stream (the chapter track), and as many video frames as the Timeline.
import type { Chapter } from "@tsukuri/core";
import { probeMedia } from "@tsukuri/encode-ffmpeg";
import type { MediaInfo } from "@tsukuri/encode-ffmpeg";
import { Array as Arr, Effect, Option, Result } from "effect";

import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import { rebuiltPlan } from "./truth.ts";
import { msToFrames, signedFrames, withinOneFrame } from "./units.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";

type FoundChapter = MediaInfo["chapters"][number];

const streamProblems = (
  media: MediaInfo,
  totalFrames: number
): readonly string[] => {
  const has = (type: string, codec: string): boolean =>
    Arr.some(
      media.streams,
      (stream) => stream.codec_type === type && stream.codec_name === codec
    );

  const dataStreams = Arr.filter(
    media.streams,
    (stream) => stream.codec_type === "data"
  );

  const video = Arr.findFirst(
    media.streams,
    (stream) => stream.codec_type === "video"
  );

  const frames = Option.flatMapNullishOr(video, (stream) => stream.nb_frames);

  return [
    ...(has("video", "h264") ? [] : ["the mp4 has no h264 video stream"]),
    ...(has("audio", "aac") ? [] : ["the mp4 has no aac audio stream"]),
    ...(has("subtitle", "mov_text")
      ? []
      : ["the mp4 has no mov_text subtitle stream"]),
    ...(dataStreams.length === 1
      ? []
      : [`the mp4 has ${dataStreams.length} data streams, one is expected`]),
    ...(Option.isSome(frames) && frames.value !== totalFrames
      ? [
          `the video has ${frames.value} frames, the Timeline has ${totalFrames}`,
        ]
      : []),
  ];
};

/** One Section with the slide frame of its first Scene and the chapter found at its position. */
interface Pairing {
  readonly chapter: Chapter;
  readonly found: FoundChapter | undefined;
  readonly slideFrame: number | undefined;
}

/** The start of the found chapter, in frames, minus the slide frame; undefined when either is missing. */
const startOffset = (pairing: Pairing, fps: number): number | undefined =>
  pairing.found === undefined || pairing.slideFrame === undefined
    ? undefined
    : msToFrames(pairing.found.start_time * 1000, fps) - pairing.slideFrame;

const pairingProblems = (pairing: Pairing, fps: number): readonly string[] => {
  const offset = startOffset(pairing, fps);
  const title = pairing.found?.tags?.title;

  return [
    ...(pairing.found === undefined || title === pairing.chapter.title
      ? []
      : [
          `chapter ${pairing.chapter.id}: the title is "${title ?? ""}", the Section is "${pairing.chapter.title}"`,
        ]),
    ...(offset === undefined || withinOneFrame(offset)
      ? []
      : [
          `chapter ${pairing.chapter.id}: starts ${signedFrames(offset)} frames from the slide frame of its first Scene`,
        ]),
  ];
};

/** F9 on the container of the written video. */
export const chapters = (build: Build) =>
  guarded(
    "F9",
    Effect.gen(function* observe() {
      const plan = rebuiltPlan(build);

      if (Result.isFailure(plan)) {
        return fail("F9", plan.failure);
      }

      const media = yield* probeMedia(build.mp4);
      const { fps } = build.plan.settings;

      const slideFrames = new Map(
        Arr.map(build.plan.timeline.scenes, (scene): [string, number] => [
          scene.sceneId,
          scene.slideFrame,
        ])
      );

      const pairings = Arr.map(
        plan.success.chapters,
        (chapter, index): Pairing => ({
          chapter,
          found: media.chapters[index],
          slideFrame: slideFrames.get(chapter.sceneIds[0] ?? ""),
        })
      );

      const problems = [
        ...(media.chapters.length === pairings.length
          ? []
          : [
              `the mp4 has ${media.chapters.length} chapters, the source has ${pairings.length} Sections`,
            ]),
        ...Arr.flatMap(pairings, (pairing) => pairingProblems(pairing, fps)),
        ...streamProblems(media, build.plan.timeline.totalFrames),
      ];

      const measured: Measured = [
        ["chapters", media.chapters.length],
        [
          "streams",
          Arr.join(
            Arr.map(
              media.streams,
              (stream) => `${stream.codec_type}:${stream.codec_name}`
            ),
            " "
          ),
        ],
        ...Arr.map(pairings, (pairing): readonly [string, string] => {
          const offset = startOffset(pairing, fps);

          return [
            `${pairing.chapter.id} start offset (frames)`,
            offset === undefined ? "not found" : signedFrames(offset),
          ];
        }),
      ];

      return verdictOf(
        "F9",
        `${media.chapters.length} chapters match the Sections in title and start frame, and the mp4 holds h264, aac, mov_text and one data stream`,
        problems,
        measured
      );
    })
  );
