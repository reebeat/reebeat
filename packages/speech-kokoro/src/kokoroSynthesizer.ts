// SpeechSynthesizer on kokoro-js: the one module that imports the model. Foreign ABI: Promise-returning kokoro-js
// 1.2.1 and @huggingface/transformers 3.8.1 (onnxruntime-node). Both are imported when the first request needs
// speech, so building the layer loads no model and no native library; a missing model directory or model is
// `AdapterUnavailable`, raised on that first use, never at construction and never as a fallback. Interruption
// stops the waiting fiber, not an ONNX run already started (kokoro-js has no cancellation).
// Retirement: an Effect-native TTS client.
import {
  AdapterUnavailable,
  EmptyText,
  SpeechSynthesizer,
  SynthesisFailed,
  localEgress,
} from "@tsukuri/services";
import type { SynthesizeRequest } from "@tsukuri/services";
import {
  Array as Arr,
  Config,
  Effect,
  Layer,
  Option,
  Record,
  String as Str,
} from "effect";

const kokoroJs = "1.2.1";
const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
const dtype = "fp32";
const sampleRate = 24_000;

const adapter = `kokoro@${kokoroJs}`;

/** Where Hugging Face models are kept: `TSUKURI_KOKORO_CACHE`, a directory outside the repository. */
const cacheDirectory = Config.String("TSUKURI_KOKORO_CACHE");

/** What a loaded model gives for one request: mono float samples and their rate. */
export interface RawSpeech {
  readonly audio: Float32Array;
  readonly sampling_rate: number;
}

/** The part of a loaded model the adapter uses: one request to raw speech. */
export interface KokoroModel {
  readonly generate: (
    request: SynthesizeRequest
  ) => Effect.Effect<RawSpeech, SynthesisFailed>;
}

const unavailable = (requirement: string, message: string) =>
  new AdapterUnavailable({
    adapter,
    message,
    requirement,
    service: "SpeechSynthesizer",
  });

const failed = (message: string) => (cause: unknown) =>
  new SynthesisFailed({ adapter, cause, message });

/** Loads the model from `TSUKURI_KOKORO_CACHE`. Every foreign Promise is wrapped here, once. */
const loadModel: Effect.Effect<KokoroModel, AdapterUnavailable> = Effect.gen(
  function* loadKokoro() {
    const directory = yield* Effect.mapError(cacheDirectory, () =>
      unavailable(
        "env TSUKURI_KOKORO_CACHE",
        "TSUKURI_KOKORO_CACHE names the directory of the Kokoro model and is not set"
      )
    );

    const transformers = yield* Effect.tryPromise({
      catch: () =>
        unavailable(
          "library @huggingface/transformers",
          "cannot load @huggingface/transformers"
        ),
      // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
      try: () => import("@huggingface/transformers"),
    });

    const kokoro = yield* Effect.tryPromise({
      catch: () => unavailable("library kokoro-js", "cannot load kokoro-js"),
      // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
      try: () => import("kokoro-js"),
    });

    yield* Effect.sync(() => {
      transformers.env.cacheDir = directory;
    });

    const tts = yield* Effect.tryPromise({
      catch: () =>
        unavailable(
          `model ${modelId}`,
          `cannot load ${modelId} (${dtype}) from the model directory`
        ),
      // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
      try: () =>
        kokoro.KokoroTTS.from_pretrained(modelId, { device: "cpu", dtype }),
    });

    return {
      generate: Effect.fn("kokoro.generate")(function* generate(request) {
        const voice = Arr.findFirst(
          Record.keys(tts.voices),
          (name) => name === request.voice
        );

        if (Option.isNone(voice)) {
          return yield* failed(`Kokoro has no voice ${request.voice}`)(
            request.voice
          );
        }

        return yield* Effect.tryPromise({
          catch: failed("kokoro-js failed to synthesise the text"),
          // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
          try: () =>
            tts.generate(request.text, {
              speed: request.speed,
              voice: voice.value,
            }),
        });
      }),
    } satisfies KokoroModel;
  }
);

/**
 * `SpeechSynthesizer` over a model that loads on the first `synthesize`. `kokoroSynthesizer` is this with the real
 * model; tests pass a fake. Equal requests give equal audio (Kokoro is deterministic on one machine).
 */
export const synthesizerOver = (
  load: Effect.Effect<KokoroModel, AdapterUnavailable>
) =>
  Layer.effect(
    SpeechSynthesizer,
    Effect.gen(function* synthesizerLayer() {
      const model = yield* Effect.cached(load);

      const synthesize = Effect.fn("SpeechSynthesizer.synthesize")(
        function* synthesize(request: SynthesizeRequest) {
          if (Str.trim(request.text) === "") {
            return yield* new EmptyText({
              message: "the text has no words to speak",
            });
          }

          const speech = yield* (yield* model).generate(request);

          if (speech.sampling_rate !== sampleRate) {
            return yield* failed(
              `kokoro-js produced ${speech.sampling_rate} Hz audio, the adapter declares ${sampleRate} Hz`
            )(speech.sampling_rate);
          }

          return {
            clip: { sampleRate, samples: speech.audio },
          };
        }
      );

      return SpeechSynthesizer.of({
        info: {
          egress: localEgress,
          id: adapter,
          settings: { dtype, model: modelId, sampleRate },
        },
        synthesize,
      });
    })
  );

/** `SpeechSynthesizer` through Kokoro-82M (fp32); the model loads on the first `synthesize`. */
export const kokoroSynthesizer = synthesizerOver(loadModel);
