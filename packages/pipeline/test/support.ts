// Shared by the pipeline tests: the platform (for the cache's digest), a two-Line Plan, a tiny fake Encoder and
// spies that count what the speech services were asked.
import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { buildPlan } from "@reebeat/core";
import {
  Encoder,
  SpeechSynthesizer,
  WordAligner,
  localEgress,
} from "@reebeat/services";
import type { AudioClip } from "@reebeat/services";
import { Array as Arr, Effect, Layer, Ref, String as Str } from "effect";

export const platform = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest);

const source = Arr.join(
  [
    "Title: Speech",
    "",
    "# Part",
    "",
    "INT. ONE #sc1#",
    "",
    "Box {id=a cell=mc class=box}",
    "",
    "NARRATOR",
    "Hello there, friend.",
    "",
    "NARRATOR",
    "(slowly)",
    "Second line here.",
    "",
  ],
  "\n"
);

/** The Plan of `source`: two Lines, the second one slowly. */
export const fixturePlan = buildPlan(source, Str.repeat(8)("5ca1ab1e"));

const headerBytes = 4;

/** An Encoder that "encodes" a clip as its rate and its float samples: lossless, deterministic, no ffmpeg. */
export const fakeEncoder = Layer.succeed(
  Encoder,
  Encoder.of({
    decodeAudio: (bytes) =>
      Effect.sync((): AudioClip => ({
        sampleRate: new DataView(bytes.buffer, bytes.byteOffset).getUint32(0),
        samples: new Float32Array(
          bytes.buffer.slice(
            bytes.byteOffset + headerBytes,
            bytes.byteOffset + bytes.byteLength
          )
        ),
      })),
    encodeAudio: (clip) =>
      Effect.sync(() => {
        const bytes = new Uint8Array(headerBytes + clip.samples.byteLength);

        new DataView(bytes.buffer).setUint32(0, clip.sampleRate);
        bytes.set(
          new Uint8Array(
            clip.samples.buffer,
            clip.samples.byteOffset,
            clip.samples.byteLength
          ),
          headerBytes
        );

        return bytes;
      }),
    info: { egress: localEgress, id: "fake-encoder@1-standin", settings: {} },
    mux: () => Effect.die("the speech stage never muxes"),
  })
);

/** `inner` with every call counted in `calls`. */
export const countingSynthesizer = (
  calls: Ref.Ref<number>,
  inner: Layer.Layer<SpeechSynthesizer>
) =>
  Layer.effect(
    SpeechSynthesizer,
    Effect.gen(function* counting() {
      const wrapped = yield* SpeechSynthesizer;

      return SpeechSynthesizer.of({
        info: wrapped.info,
        synthesize: (request) =>
          Effect.tap(wrapped.synthesize(request), () =>
            Ref.update(calls, (count) => count + 1)
          ),
      });
    })
  ).pipe(Layer.provide(inner));

/** `inner` with every request recorded in `requests` and the match replaced by `match` when given. */
export const recordingAligner = (
  requests: Ref.Ref<readonly unknown[]>,
  inner: Layer.Layer<WordAligner>,
  match?: number
) =>
  Layer.effect(
    WordAligner,
    Effect.gen(function* recording() {
      const wrapped = yield* WordAligner;

      return WordAligner.of({
        align: (request) =>
          Effect.flatMap(
            Ref.update(requests, (all) => [...all, request]),
            () =>
              Effect.map(wrapped.align(request), (alignment) => ({
                ...alignment,
                match: match ?? alignment.match,
              }))
          ),
        info: wrapped.info,
      });
    })
  ).pipe(Layer.provide(inner));

/** `inner` with `settings` added to its `info`: the same aligner configured differently. */
export const withSettings = (
  inner: Layer.Layer<WordAligner>,
  settings: Readonly<Record<string, string | number | boolean>>
) =>
  Layer.effect(
    WordAligner,
    Effect.gen(function* retuned() {
      const wrapped = yield* WordAligner;

      return WordAligner.of({
        align: wrapped.align,
        info: {
          ...wrapped.info,
          settings: { ...wrapped.info.settings, ...settings },
        },
      });
    })
  ).pipe(Layer.provide(inner));
