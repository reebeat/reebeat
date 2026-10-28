// What the written files show: the decoded frames, the decoded audio, and the container's streams and chapters. The
// verify slice reads these to check the falsifiers F1 and F6 to F9 on the mp4; the tests here use them too.
import { Array as Arr, Effect, Schema } from "effect";

import { MediaToolFailed } from "./errors.ts";
import { MediaTools } from "./mediaTools.ts";
import { outputSampleRate as defaultSampleRate } from "./settings.ts";

/** A rectangle of pixels, in the frame's own coordinates. */
export interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/** Consecutive decoded frames, 8 bits of gray per pixel, row by row. `firstFrame` is the number of `frames[0]`. */
export interface GrayClip {
  readonly firstFrame: number;
  readonly frames: readonly Uint8Array[];
  readonly height: number;
  readonly width: number;
}

export interface FrameSize {
  readonly height: number;
  readonly width: number;
}

export interface ChangeOptions {
  /** Pixels that differ by at most this much do not count as changed. Default 0: any difference counts. */
  readonly tolerance?: number;
  /** The frame counts as changed when at least this many pixels changed. Default 1. */
  readonly minPixels?: number;
}

/** The number of pixels of `box` (the whole frame when absent) at which two frames differ by more than `tolerance`. */
export const changedPixels = (
  previous: Uint8Array,
  next: Uint8Array,
  width: number,
  box?: Box,
  tolerance = 0
): number => {
  const height = previous.length / width;
  const area = box ?? { height, width, x: 0, y: 0 };
  let changed = 0;

  for (let row = area.y; row < area.y + area.height; row += 1) {
    for (let column = area.x; column < area.x + area.width; column += 1) {
      const index = row * width + column;

      if (Math.abs((previous[index] ?? 0) - (next[index] ?? 0)) > tolerance) {
        changed += 1;
      }
    }
  }

  return changed;
};

/**
 * The number of the first frame of the clip that differs from the frame before it inside `box` (the whole frame
 * when absent), or undefined when no frame does. Frame `firstFrame` has no frame before it and is never returned.
 */
export const firstChangedFrame = (
  clip: GrayClip,
  box?: Box,
  options: ChangeOptions = {}
): number | undefined => {
  const { minPixels = 1, tolerance = 0 } = options;

  for (let index = 1; index < clip.frames.length; index += 1) {
    const previous = clip.frames[index - 1];
    const next = clip.frames[index];

    if (
      previous !== undefined &&
      next !== undefined &&
      changedPixels(previous, next, clip.width, box, tolerance) >= minPixels
    ) {
      return clip.firstFrame + index;
    }
  }

  return undefined;
};

/** The frames `fromFrame` to `toFrame` (inclusive, frame numbers of the original clip) of a clip. */
export const sliceClip = (
  clip: GrayClip,
  fromFrame: number,
  toFrame: number
): GrayClip => ({
  ...clip,
  firstFrame: fromFrame,
  frames: clip.frames.slice(
    fromFrame - clip.firstFrame,
    toFrame - clip.firstFrame + 1
  ),
});

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const defaultFrameSize: FrameSize = { height: 720, width: 1280 };

/** Frames `fromFrame` to `toFrame` (inclusive, counted from 0) of the video stream of `file`, as gray pixels. */
export const decodeGrayFrames = Effect.fn("decodeGrayFrames")(function* decode(
  file: string,
  fromFrame: number,
  toFrame: number,
  size: FrameSize = defaultFrameSize
) {
  const tools = yield* MediaTools;

  const bytes = yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    file,
    "-map",
    "0:v:0",
    "-vf",
    `select='between(n,${fromFrame},${toFrame})'`,
    "-fps_mode",
    "passthrough",
    "-frames:v",
    String(toFrame - fromFrame + 1),
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);

  const frameBytes = size.width * size.height;

  const frames = Array.from(
    { length: Math.floor(bytes.byteLength / frameBytes) },
    (_, index) => bytes.subarray(index * frameBytes, (index + 1) * frameBytes)
  );

  return { firstFrame: fromFrame, frames, ...size } satisfies GrayClip;
});

/** The MD5 of every decoded video frame of `file`, in order (`ffmpeg -f framemd5`). */
export const frameHashes = Effect.fn("frameHashes")(function* hashes(
  file: string
) {
  const tools = yield* MediaTools;

  const output = yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    file,
    "-map",
    "0:v:0",
    "-f",
    "framemd5",
    "pipe:1",
  ]);

  const rows = Arr.filter(
    text(output).split("\n"),
    (line) => line !== "" && !line.startsWith("#")
  );

  return Arr.map(rows, (line) => (line.split(",").at(-1) ?? "").trim());
});

/** The decoded audio of `file` as mono 32-bit float samples at `sampleRate`. */
export const decodeMonoPcm = Effect.fn("decodeMonoPcm")(function* decode(
  file: string,
  sampleRate = defaultSampleRate
) {
  const tools = yield* MediaTools;

  const bytes = yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
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
  ]);

  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
});

const correlationLength = 9600;

const normalisedScore = (
  track: Float32Array,
  reference: Float32Array,
  lag: number,
  length: number
): number => {
  let dot = 0;
  let trackEnergy = 0;
  let referenceEnergy = 0;

  for (let index = 0; index < length; index += 1) {
    const heard = track[lag + index] ?? 0;
    const known = reference[index] ?? 0;

    dot += heard * known;
    trackEnergy += heard * heard;
    referenceEnergy += known * known;
  }

  return trackEnergy === 0 || referenceEnergy === 0
    ? 0
    : dot / Math.sqrt(trackEnergy * referenceEnergy);
};

/** Where a known clip lies in a track, and how well it matches there. */
export interface AudioMatch {
  /** `found start - expectedMs` in milliseconds: positive when the clip is late, negative when it is early. */
  readonly offsetMs: number;
  /**
   * The normalised cross-correlation (`dot / sqrt(trackEnergy * referenceEnergy)`, in [-1, 1]) at the chosen lag:
   * about 1 for a clip that is there, near 0 for the best match of noise. A check uses it to tell the two apart.
   */
  readonly score: number;
}

/**
 * Where a known clip lies in a mixed track, relative to where it should lie: the normalised cross-correlation of
 * the first 200 ms of `reference` with `track` at every sample offset within `windowMs` of `expectedMs`.
 */
export const audioOffsetMs = (
  track: Float32Array,
  reference: Float32Array,
  expectedMs: number,
  windowMs: number,
  sampleRate = defaultSampleRate
): AudioMatch => {
  const length = Math.min(reference.length, correlationLength);
  const center = Math.round((expectedMs * sampleRate) / 1000);
  const reach = Math.round((windowMs * sampleRate) / 1000);
  let bestLag = center;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let lag = Math.max(0, center - reach); lag <= center + reach; lag += 1) {
    const score = normalisedScore(track, reference, lag, length);

    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return {
    offsetMs: ((bestLag - center) * 1000) / sampleRate,
    score: Number.isFinite(bestScore) ? bestScore : 0,
  };
};

const Tags = Schema.Struct({
  comment: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
});

/** The parts of `ffprobe -show_streams -show_chapters -show_format` that the checks read. */
export const MediaInfoSchema = Schema.Struct({
  chapters: Schema.Array(
    Schema.Struct({
      end_time: Schema.FiniteFromString,
      start_time: Schema.FiniteFromString,
      tags: Schema.optionalKey(Tags),
    })
  ),
  format: Schema.Struct({
    duration: Schema.optionalKey(Schema.FiniteFromString),
    tags: Schema.optionalKey(Tags),
  }),
  streams: Schema.Array(
    Schema.Struct({
      channels: Schema.optionalKey(Schema.Int),
      codec_name: Schema.String,
      codec_type: Schema.String,
      duration: Schema.optionalKey(Schema.FiniteFromString),
      height: Schema.optionalKey(Schema.Int),
      nb_frames: Schema.optionalKey(Schema.FiniteFromString),
      r_frame_rate: Schema.optionalKey(Schema.String),
      sample_rate: Schema.optionalKey(Schema.FiniteFromString),
      width: Schema.optionalKey(Schema.Int),
    })
  ),
});

export type MediaInfo = typeof MediaInfoSchema.Type;

const decodeMediaInfo = Schema.decodeUnknownEffect(
  Schema.fromJsonString(MediaInfoSchema)
);

/** The streams, chapters and tags of `file`, from ffprobe. */
export const probeMedia = Effect.fn("probeMedia")(function* probe(
  file: string
) {
  const tools = yield* MediaTools;

  const json = yield* tools.run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_chapters",
    "-show_format",
    "-of",
    "json",
    file,
  ]);

  return yield* decodeMediaInfo(text(json)).pipe(
    Effect.mapError(
      (cause) =>
        new MediaToolFailed({
          cause,
          message: `ffprobe output of ${file} is not the expected JSON`,
          stderr: "",
          tool: "ffprobe",
        })
    )
  );
});
