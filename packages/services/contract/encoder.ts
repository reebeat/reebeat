// The contract of Encoder: what every encoder (ffmpeg) promises: lossless audio, and a mux that keeps every frame,
// track, subtitle cue and chapter. The mux clauses read the written file back through the adapter's own `probe`.
import { assert } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path, Stream } from "effect";
import type { Layer, PlatformError } from "effect";
import { Base64 } from "effect/encoding";
import type { EncodingError } from "effect/encoding";

import { Encoder } from "../src/encoder.ts";
import type { MuxRequest } from "../src/encoder.ts";
import type { CaptureFailure, EncodeError } from "../src/errors.ts";
import type { AudioClip } from "../src/types.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import { assertInfoDeclared, sameBytes } from "./support.ts";

/** What a probe reads back from a media file written by `mux`. */
export interface MuxProbe {
  /** The decoded audio stream: the mix of every track. */
  readonly audio: AudioClip;
  readonly chapters: readonly {
    readonly endMs: number;
    readonly startMs: number;
    readonly title: string;
  }[];
  /** The number of video frames. */
  readonly frames: number;
  readonly height: number;
  readonly metadata: { readonly comment: string; readonly title: string };
  /** The text of each subtitle cue, in order, without timing. */
  readonly subtitles: readonly string[];
  readonly width: number;
}

export interface EncoderOptions {
  /** Reads a file written by `mux` back, independently of the encoder (ffprobe and ffmpeg for ffmpeg). */
  readonly probe: (
    path: string
  ) => Effect.Effect<
    MuxProbe,
    PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path
  >;
}

type Services = Encoder | FileSystem.FileSystem | Path.Path;

type Failure =
  | CaptureFailure
  | EncodeError
  | EncodingError.EncodingError
  | PlatformError.PlatformError;

const sampleRate = 24_000;

const tone = (hertz: number, ms: number): AudioClip => ({
  sampleRate,
  samples: Float32Array.from(
    { length: (sampleRate * ms) / 1000 },
    (_, index) => 0.5 * Math.sin((2 * Math.PI * hertz * index) / sampleRate)
  ),
});

/** Two solid 64 x 64 PNGs, alternated as the frames of the mux fixture. */
const pngs = [
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEty/aMYywi+hcEKLNO+FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywLKp0DxvxLbjwAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsEty/aMYywi+hcEKLO28FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBywKJbEDxSPiIxAAAAABJRU5ErkJggg==",
];

const fixtureFrames = 12;

const first = tone(440, 300);
const second = tone(880, 300);

const firstCue = "First cue";

const secondCue = "Second cue";

const cues = [firstCue, secondCue];

const vtt = Arr.join(
  [
    "WEBVTT",
    "",
    "00:00:00.100 --> 00:00:00.700",
    firstCue,
    "",
    "00:00:00.700 --> 00:00:01.100",
    secondCue,
    "",
  ],
  "\n"
);

const chapters = [
  { endMs: 600, startMs: 0, title: "Part one" },
  { endMs: 1200, startMs: 600, title: "Part two" },
];

const metadata = { comment: "contract fixture", title: "Contract" };

/** The mean square of `clip` between `fromMs` and `toMs`. */
const energy = (clip: AudioClip, fromMs: number, toMs: number): number => {
  const window = clip.samples.slice(
    Math.round((fromMs * clip.sampleRate) / 1000),
    Math.round((toMs * clip.sampleRate) / 1000)
  );

  return (
    Arr.reduce([...window], 0, (sum, sample) => sum + sample * sample) /
    Math.max(window.length, 1)
  );
};

/** The mux request of the fixture: twelve frames at ten per second, two tracks, two cues, two chapters. */
const muxRequest = (outPath: string) =>
  Effect.map(
    Effect.forEach(pngs, (text) => Effect.fromResult(Base64.decode(text))),
    (decoded): MuxRequest => ({
      chapters,
      fps: 10,
      frames: Stream.fromIterable(
        Arr.makeBy(
          fixtureFrames,
          (index) => decoded[index % decoded.length] ?? new Uint8Array()
        )
      ),
      height: 64,
      metadata,
      ntsc: false,
      outPath,
      totalMs: 1200,
      tracks: [
        { clip: first, startMs: 100 },
        { clip: second, startMs: 700 },
      ],
      vtt,
      width: 64,
    })
  );

/** Muxes the fixture into a temporary directory the caller's scope owns, and returns where and what it reported. */
const muxFixture = Effect.gen(function* mux() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "reebeat-contract-",
  });

  const outPath = path.join(directory, "out.mp4");
  const request = yield* muxRequest(outPath);
  const result = yield* (yield* Encoder).mux(request);

  return { outPath, result };
});

const probeOf = (options: EncoderOptions) =>
  Effect.scoped(
    Effect.gen(function* run() {
      const { outPath, result } = yield* muxFixture;

      return { probe: yield* options.probe(outPath), result };
    })
  );

/** The clauses of the contract, as data (a test runs them against broken adapters). */
export const encoderClauses = (
  options: EncoderOptions
): readonly Clause<Failure, Services>[] => [
  {
    id: "C1",
    means:
      "audio round trip: decode(encode(clip)) is the clip within one s16 step",
    run: Effect.gen(function* clause() {
      const encoder = yield* Encoder;
      const clip = tone(440, 500);

      const back = yield* Effect.flatMap(
        encoder.encodeAudio(clip),
        encoder.decodeAudio
      );

      const lsb = 1 / 32_767;

      assert.strictEqual(back.sampleRate, clip.sampleRate);
      assert.strictEqual(back.samples.length, clip.samples.length);
      assert.isAtMost(
        Arr.reduce([...clip.samples], 0, (worst, sample, index) =>
          Math.max(
            worst,
            Math.abs(sample - (back.samples[index] ?? Number.NaN))
          )
        ),
        lsb
      );
    }),
  },
  {
    id: "C2",
    means: "equal clips encode to equal bytes",
    run: Effect.gen(function* clause() {
      const encoder = yield* Encoder;
      const left = yield* encoder.encodeAudio(tone(440, 200));
      const right = yield* encoder.encodeAudio(tone(440, 200));

      assert.isTrue(sameBytes(left, right));
    }),
  },
  {
    id: "C3",
    means:
      "mux writes a file with the declared frame count and size, and reports it",
    run: Effect.gen(function* clause() {
      const { probe, result } = yield* probeOf(options);

      assert.strictEqual(result.frames, fixtureFrames);
      assert.isAbove(result.bytes, 0);
      assert.strictEqual(probe.frames, fixtureFrames);
      assert.deepStrictEqual([probe.width, probe.height], [64, 64]);
    }),
  },
  {
    id: "C4",
    means:
      "every track is in the audio, each at its start and silent elsewhere",
    run: Effect.gen(function* clause() {
      const { probe } = yield* probeOf(options);
      const audible = 0.01;

      assert.isAbove(energy(probe.audio, 100, 400), audible, "track one");
      assert.isAbove(energy(probe.audio, 700, 1000), audible, "track two");
      assert.isBelow(
        energy(probe.audio, 450, 650),
        audible / 100,
        "the gap between the tracks"
      );
    }),
  },
  {
    id: "C5",
    means: "subtitle cues are carried verbatim, in order",
    run: Effect.gen(function* clause() {
      const { probe } = yield* probeOf(options);

      assert.deepStrictEqual(probe.subtitles, cues);
    }),
  },
  {
    id: "C6",
    means: "chapters are carried: title and times to the millisecond",
    run: Effect.gen(function* clause() {
      const { probe } = yield* probeOf(options);

      assert.deepStrictEqual(probe.chapters, chapters);
    }),
  },
  {
    id: "C7",
    means: "title and comment metadata are carried",
    run: Effect.gen(function* clause() {
      const { probe } = yield* probeOf(options);

      assert.deepStrictEqual(probe.metadata, metadata);
    }),
  },
  {
    id: "C8",
    means:
      "info declares its id, its egress (local sends nothing) and non-secret settings",
    run: Effect.gen(function* clause() {
      assertInfoDeclared((yield* Encoder).info);
    }),
  },
];

/** Registers the Encoder contract; `layer` provides the encoder and the platform file services. */
export const encoderContract = <LE>(
  label: string,
  layer: Layer.Layer<Services, LE>,
  options: EncoderOptions
): void => {
  registerClauses(label, layer, encoderClauses(options));
};
