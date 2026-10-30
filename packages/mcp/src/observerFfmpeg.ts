// The ffmpeg `Observer` (spec 0016, G8): what a model can use from a build's video, read with the tools the verifier
// already trusts. A frame is decoded with ffmpeg from a seek a few frames before it, so a long video costs nothing, and
// chosen by its number inside that seek, so the frame is exactly the asked one; it is scaled and compressed until it
// fits. Capacity: two observations run at once and a third is refused at once (`ObserveFailed`, "busy"), so waiting
// never piles up; each is cut off after 25 seconds, and a closed Scope kills the process. A failure of ffmpeg is logged
// for the operator and fails with a fixed message: its output can name a path.
import { MediaTools, probeMedia } from "@tsukuri/encode-ffmpeg";
import type { MediaInfo } from "@tsukuri/encode-ffmpeg";
import { ObserveFailed, Observer } from "@tsukuri/lifecycle";
import type {
  AudioBucket,
  AudioStats,
  ChapterFacts,
  MediaFacts,
  StreamFacts,
} from "@tsukuri/lifecycle";
import {
  Array as Arr,
  Duration,
  Effect,
  Layer,
  Option,
  Result,
  Semaphore,
} from "effect";

import { present } from "./optional.ts";

const concurrent = 2;
const deadline = Duration.seconds(25);

/** Frames decoded before the asked one: the seek lands on a keyframe, and the asked frame is `lead` frames after it. */
const maxLead = 8;

/** Widths and JPEG qualities tried, best first (`-q:v`: 2 is best, 31 worst). Six runs at most. */
const attempts: readonly (readonly [number, number])[] = [
  [640, 6],
  [640, 14],
  [480, 18],
  [320, 24],
  [240, 31],
  [160, 31],
];

const bucketMs = 100;
const sampleRate = 16_000;
const silenceDb = -120;
const onsetRiseDb = 12;
const onsetFloorDb = -45;
const maxOnsets = 200;

const word = (high: number | undefined, low: number | undefined): number =>
  (high ?? 0) * 256 + (low ?? 0);

/** Start-of-frame markers (`SOF0` to `SOF15`) except the three that are not frames. */
const isFrameMarker = (marker: number): boolean =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

/** The width and height in a JPEG's start-of-frame marker, or none when the bytes are not a JPEG. */
export const jpegSize = (
  bytes: Uint8Array
): Option.Option<{ readonly height: number; readonly width: number }> => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return Option.none();
  }

  let at = 2;

  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return Option.none();
    }

    if (isFrameMarker(bytes[at + 1] ?? 0)) {
      return Option.some({
        height: word(bytes[at + 5], bytes[at + 6]),
        width: word(bytes[at + 7], bytes[at + 8]),
      });
    }

    at += 2 + word(bytes[at + 2], bytes[at + 3]);
  }

  return Option.none();
};

const toDb = (amplitude: number): number =>
  amplitude <= 0 ? silenceDb : Math.max(silenceDb, 20 * Math.log10(amplitude));

const round1 = (value: number): number => Math.round(value * 10) / 10;

const bucketOf = (
  samples: Float32Array,
  start: number,
  end: number
): Pick<AudioBucket, "peakDb" | "rmsDb"> => {
  let sum = 0;
  let peak = 0;

  for (let index = start; index < end; index += 1) {
    const value = samples[index] ?? 0;

    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }

  return {
    peakDb: round1(toDb(peak)),
    rmsDb: round1(toDb(Math.sqrt(sum / (end - start)))),
  };
};

/** Loudness per 100 ms bucket (RMS and peak, dBFS) and the buckets where it rises sharply from quiet. */
export const audioStats = (
  samples: Float32Array,
  fromMs: number
): AudioStats => {
  const per = (sampleRate * bucketMs) / 1000;
  const buckets: AudioBucket[] = [];

  for (let start = 0; start < samples.length; start += per) {
    buckets.push({
      fromMs: fromMs + (start / per) * bucketMs,
      ...bucketOf(samples, start, Math.min(start + per, samples.length)),
    });
  }

  const onsets = Arr.filterMap(buckets, (bucket, index) => {
    // The first bucket has nothing before it inside the window, so it cannot rise from anything.
    const before = buckets[index - 1]?.rmsDb;

    return before !== undefined &&
      bucket.rmsDb > onsetFloorDb &&
      bucket.rmsDb - before >= onsetRiseDb
      ? Result.succeed(bucket.fromMs)
      : Result.failVoid;
  });

  return { buckets, onsetsMs: Arr.take(onsets, maxOnsets) };
};

const failed = (message: string) => new ObserveFailed({ message });

const toMs = (seconds: number): number => Math.round(seconds * 1000);

const optionalMs = (seconds: number | undefined): number | undefined =>
  seconds === undefined ? undefined : toMs(seconds);

type ProbedStream = MediaInfo["streams"][number];

const streamFacts = (stream: ProbedStream): StreamFacts => ({
  ...present("channels", stream.channels),
  codec: stream.codec_name,
  ...present("durationMs", optionalMs(stream.duration)),
  ...present("fps", stream.r_frame_rate),
  ...present("frames", stream.nb_frames),
  ...present("height", stream.height),
  ...present("sampleRate", stream.sample_rate),
  type: stream.codec_type,
  ...present("width", stream.width),
});

const chapterFacts = (
  chapter: MediaInfo["chapters"][number]
): ChapterFacts => ({
  endMs: toMs(chapter.end_time),
  startMs: toMs(chapter.start_time),
  ...present("title", chapter.tags?.title),
});

const mediaFacts = (info: MediaInfo): MediaFacts => ({
  chapters: Arr.map(info.chapters, chapterFacts),
  ...present("durationMs", optionalMs(info.format.duration)),
  streams: Arr.map(info.streams, streamFacts),
});

/** The ffmpeg arguments that print one JPEG of the `lead`th frame after `startSeconds`, `width` wide. */
const frameArgs = (
  file: string,
  startSeconds: number,
  lead: number,
  [width, quality]: readonly [number, number]
): readonly string[] => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-ss",
  startSeconds.toFixed(6),
  "-i",
  file,
  "-vf",
  `select=eq(n\\,${lead}),scale=${width}:-2`,
  "-frames:v",
  "1",
  "-fps_mode",
  "passthrough",
  "-q:v",
  String(quality),
  "-f",
  "image2pipe",
  "-c:v",
  "mjpeg",
  "pipe:1",
];

const audioArgs = (
  file: string,
  window: { readonly fromMs: number; readonly toMs: number }
): readonly string[] => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-ss",
  (window.fromMs / 1000).toFixed(3),
  "-t",
  ((window.toMs - window.fromMs) / 1000).toFixed(3),
  "-i",
  file,
  "-map",
  "0:a:0",
  "-ac",
  "1",
  "-ar",
  String(sampleRate),
  "-f",
  "f32le",
  "pipe:1",
];

export const ffmpegObserver: Layer.Layer<Observer, never, MediaTools> =
  Layer.effect(
    Observer,
    Effect.gen(function* observerLayer() {
      const tools = yield* MediaTools;
      const gate = yield* Semaphore.make(concurrent);

      /** Runs `work` if a place is free, else refuses at once; cuts it off after the deadline. */
      const admitted = <A>(
        what: string,
        work: Effect.Effect<A, ObserveFailed>
      ) =>
        gate
          .withPermitsIfAvailable(1)(
            work.pipe(
              Effect.timeoutOrElse({
                duration: deadline,
                orElse: () =>
                  Effect.fail(failed(`${what} took longer than 25 seconds`)),
              })
            )
          )
          .pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    failed(
                      `busy: ${concurrent} observations are already running; retry in a moment`
                    )
                  ),
                onSome: Effect.succeed,
              })
            )
          );

      /** Runs a tool; its failure is logged for the operator and the agent is told only `what` failed. */
      const run = (
        tool: "ffmpeg" | "ffprobe",
        args: readonly string[],
        what: string
      ) =>
        tools.run(tool, args).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning(`${tool} failed: ${what}`, cause)
          ),
          Effect.mapError(() => failed(`${tool} could not ${what}`))
        );

      const frameWith = Effect.fnUntraced(function* frameWith(
        file: string,
        request: {
          readonly frame: number;
          readonly frameSeconds: number;
          readonly maxBytes: number;
          readonly seconds: number;
        }
      ) {
        const lead = Math.min(request.frame, maxLead);

        const start = Math.max(
          0,
          request.seconds - (lead + 0.5) * request.frameSeconds
        );

        for (const attempt of attempts) {
          const bytes = yield* run(
            "ffmpeg",
            frameArgs(file, start, lead, attempt),
            "read a frame"
          );

          if (bytes.byteLength === 0) {
            return yield* failed(
              `frame ${request.frame} is past the end of the video`
            );
          }

          const size = jpegSize(bytes);

          if (bytes.byteLength <= request.maxBytes && Option.isSome(size)) {
            return {
              bytes,
              height: size.value.height,
              mimeType: "image/jpeg" as const,
              width: size.value.width,
            };
          }
        }

        return yield* failed(
          `no image of frame ${request.frame} fits in ${request.maxBytes} bytes`
        );
      });

      return Observer.of({
        audio: (files, window) =>
          admitted(
            "the audio window",
            Effect.map(
              run("ffmpeg", audioArgs(files.mp4, window), "read the audio"),
              (bytes) =>
                audioStats(
                  new Float32Array(
                    bytes.buffer.slice(
                      bytes.byteOffset,
                      bytes.byteOffset + bytes.byteLength
                    )
                  ),
                  window.fromMs
                )
            )
          ),
        frame: (files, request) =>
          admitted("the frame", frameWith(files.mp4, request)),
        media: (files) =>
          admitted(
            "the probe",
            probeMedia(files.mp4).pipe(
              Effect.provideService(MediaTools, tools),
              Effect.tapError((cause) =>
                Effect.logWarning("ffprobe failed", cause)
              ),
              Effect.mapError(() => failed("ffprobe could not read the video")),
              Effect.map(mediaFacts)
            )
          ),
      });
    })
  );
