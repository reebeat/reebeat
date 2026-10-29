// Test-only adapters for the three services that have no stand-in (Renderer, FrameCapturer, Encoder). They are small
// but real: they pass the contract suites, so the suites themselves are exercised here, and each takes a flaw that
// breaks exactly one clause, so the suites are seen to fail (the negative controls).
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Schema,
  Stream,
} from "effect";
import type { PlatformError } from "effect";

import { contractLifecycle } from "../contract/index.ts";
import type { MuxProbe } from "../contract/index.ts";
import { Encoder } from "../src/encoder.ts";
import type { MuxRequest } from "../src/encoder.ts";
import { FrameCapturer } from "../src/frameCapturer.ts";
import { Renderer } from "../src/renderer.ts";
import { localEgress } from "../src/types.ts";
import type { AudioClip } from "../src/types.ts";

const info = (name: string) => ({
  egress: localEgress,
  id: `${name}@1-fake`,
  settings: {},
});

/**
 * A renderer that writes every Element id into `index.html`; `dropIds` shows none of them, `noShowTime` declares that a
 * shown Element appears in no time.
 */
export const fakeRenderer = (
  flaw: { readonly dropIds?: boolean; readonly noShowTime?: boolean } = {}
) =>
  Layer.succeed(
    Renderer,
    Renderer.of({
      info: {
        ...info("fake-render"),
        lifecycle:
          flaw.noShowTime === true
            ? { ...contractLifecycle, showMs: 0 }
            : contractLifecycle,
      },
      render: (plan) =>
        Effect.succeed({
          entry: "index.html",
          files: [
            {
              content:
                flaw.dropIds === true
                  ? "<html></html>"
                  : Arr.join(
                      Arr.flatMap(plan.scenes, (scene) =>
                        Arr.map(
                          scene.elements,
                          ({ id }) => `<div data-id="${id}"></div>`
                        )
                      ),
                      "\n"
                    ),
              path: "index.html",
            },
          ],
        }),
    })
  );

/** A PNG header and nothing else the contract reads: the signature and an IHDR chunk with the size. */
const fakePng = (width: number, height: number, index: number): Uint8Array => {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);

  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  view.setUint32(29, index);

  return bytes;
};

export interface CapturerFlaw {
  /** Emits this many frames fewer than `frames(plan)` says. */
  readonly missingFrames?: number;
  /** Emits frames of this width instead of the Plan's. */
  readonly width?: number;
}

/** A capturer that emits `timeline.totalFrames` header-only PNGs of the Plan's canvas size. */
export const fakeCapturer = (flaw: CapturerFlaw = {}) =>
  Layer.succeed(
    FrameCapturer,
    FrameCapturer.of({
      capture: ({ plan }) =>
        Stream.fromIterable(
          Arr.makeBy(
            (plan.timeline?.totalFrames ?? 0) - (flaw.missingFrames ?? 0),
            (index) =>
              fakePng(
                flaw.width ?? plan.settings.width,
                plan.settings.height,
                index
              )
          )
        ),
      frames: (plan) => plan.timeline?.totalFrames ?? 0,
      info: info("fake-capture"),
    })
  );

const ProbeFile = Schema.fromJsonString(
  Schema.Struct({
    audio: Schema.Struct({
      sampleRate: Schema.Finite,
      samples: Schema.Array(Schema.Finite),
    }),
    chapters: Schema.Array(
      Schema.Struct({
        endMs: Schema.Finite,
        startMs: Schema.Finite,
        title: Schema.String,
      })
    ),
    frames: Schema.Int,
    height: Schema.Int,
    metadata: Schema.Struct({ comment: Schema.String, title: Schema.String }),
    subtitles: Schema.Array(Schema.String),
    width: Schema.Int,
  })
);

const encodeProbeFile = Schema.encodeEffect(ProbeFile);

const decodeProbeFile = Schema.decodeUnknownEffect(ProbeFile);

const s16 = 32_767;

export interface EncoderFlaw {
  /** The mix leaves out this track (by position). */
  readonly dropTrack?: number;
  /** The file carries no subtitle cues. */
  readonly dropSubtitles?: boolean;
}

/** The cue texts of a WebVTT text: the lines that are neither the header, a timing line nor blank. */
const cueTexts = (vtt: string): readonly string[] =>
  Arr.filter(
    vtt.split("\n"),
    (line) => line !== "" && line !== "WEBVTT" && !line.includes("-->")
  );

const mix = (request: MuxRequest, flaw: EncoderFlaw): AudioClip => {
  const rate = request.tracks[0]?.clip.sampleRate ?? 24_000;
  const samples = new Float32Array(Math.round((rate * request.totalMs) / 1000));

  for (const [index, track] of request.tracks.entries()) {
    if (index !== flaw.dropTrack) {
      const offset = Math.round((rate * track.startMs) / 1000);

      for (const [at, sample] of track.clip.samples.entries()) {
        samples[offset + at] = (samples[offset + at] ?? 0) + sample;
      }
    }
  }

  return { sampleRate: rate, samples };
};

/** The probe of the fake encoder's files; also a Layer-free function the contract takes as `probe`. */
export const fakeProbe = (
  path: string
): Effect.Effect<
  MuxProbe,
  PlatformError.PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* probe() {
    const fs = yield* FileSystem.FileSystem;

    const file = yield* Effect.orDie(
      decodeProbeFile(yield* fs.readFileString(path))
    );

    return {
      ...file,
      audio: {
        sampleRate: file.audio.sampleRate,
        samples: Float32Array.from(file.audio.samples),
      },
    };
  });

/** An encoder that stores s16 audio and writes the mux as one JSON file its probe reads back. */
export const fakeEncoder = (flaw: EncoderFlaw = {}) =>
  Layer.effect(
    Encoder,
    Effect.gen(function* build() {
      const fs = yield* FileSystem.FileSystem;

      return Encoder.of({
        decodeAudio: (bytes) => {
          const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
          );

          return Effect.succeed({
            sampleRate: view.getUint32(0),
            samples: Float32Array.from(
              { length: (bytes.length - 4) / 2 },
              (_, index) => view.getInt16(4 + 2 * index) / s16
            ),
          });
        },
        encodeAudio: (clip) => {
          const bytes = new Uint8Array(4 + 2 * clip.samples.length);
          const view = new DataView(bytes.buffer);

          view.setUint32(0, clip.sampleRate);

          for (const [index, sample] of clip.samples.entries()) {
            view.setInt16(4 + 2 * index, Math.round(sample * s16));
          }

          return Effect.succeed(bytes);
        },
        info: info("fake-encode"),
        mux: (request) =>
          Effect.scoped(
            Effect.gen(function* mux() {
              const frames = yield* Stream.runCount(request.frames);
              const audio = mix(request, flaw);

              const text = yield* Effect.orDie(
                encodeProbeFile({
                  audio: {
                    sampleRate: audio.sampleRate,
                    samples: [...audio.samples],
                  },
                  chapters: request.chapters,
                  frames,
                  height: request.height,
                  metadata: request.metadata,
                  subtitles:
                    flaw.dropSubtitles === true ? [] : cueTexts(request.vtt),
                  width: request.width,
                })
              );

              yield* Effect.orDie(fs.writeFileString(request.outPath, text));

              return { bytes: text.length, frames, path: request.outPath };
            })
          ),
      });
    })
  );
