// Tts on kokoro-js: the one module that imports the model. Foreign ABI: Promise-returning kokoro-js 1.2.1 and
// @huggingface/transformers 3.8.1 (onnxruntime-node). Both are imported when the first Line needs speech, so a
// cache hit, `speechCacheOnly` and every test load no model and no native library. Interruption stops the
// waiting fiber, not an ONNX run already started (kokoro-js has no cancellation).
// Retirement: an Effect-native TTS client.
import { Config, Effect, Layer } from "effect";

import { SpeechToolFailed } from "./errors.ts";
import { pipeline } from "./pipeline.ts";
import { Tts } from "./services.ts";
import { toolFailure } from "./tool.ts";

/** Where Hugging Face models are kept: `REEBEAT_KOKORO_CACHE`, a directory outside the repository. */
export const kokoroConfig = Config.String("REEBEAT_KOKORO_CACHE");

const load = (cacheDir: string) =>
  Effect.gen(function* loadKokoro() {
    const transformers = yield* Effect.tryPromise({
      catch: toolFailure("kokoro", "cannot load @huggingface/transformers"),
      // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
      try: () => import("@huggingface/transformers"),
    });

    const kokoro = yield* Effect.tryPromise({
      catch: toolFailure("kokoro", "cannot load kokoro-js"),
      // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
      try: () => import("kokoro-js"),
    });

    yield* Effect.sync(() => {
      transformers.env.cacheDir = cacheDir;
    });

    return yield* Effect.tryPromise({
      catch: toolFailure("kokoro", `cannot load ${pipeline.ttsModel}`),
      // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
      try: () =>
        kokoro.KokoroTTS.from_pretrained(pipeline.ttsModel, {
          device: "cpu",
          dtype: pipeline.dtype,
        }),
    });
  });

/** `Tts` through Kokoro-82M (fp32, voice `af_heart`); the model loads on the first `synthesize`. */
export const ttsKokoro = Layer.effect(
  Tts,
  Effect.gen(function* ttsKokoroLayer() {
    const model = yield* Effect.cached(load(yield* kokoroConfig));

    const synthesize = Effect.fn("Tts.synthesize")(
      function* synthesize(request: {
        readonly speed: number;
        readonly text: string;
      }) {
        const tts = yield* model;

        const audio = yield* Effect.tryPromise({
          catch: toolFailure("kokoro", "kokoro-js failed to synthesise a Line"),
          // oxlint-disable-next-line typescript/promise-function-async -- EX-0001: kokoro-js and dynamic import return Promises
          try: () =>
            tts.generate(request.text, {
              speed: request.speed,
              voice: pipeline.voice,
            }),
        });

        if (audio.sampling_rate !== pipeline.ttsSampleRate) {
          return yield* new SpeechToolFailed({
            cause: audio.sampling_rate,
            message: `kokoro-js produced ${audio.sampling_rate} Hz audio, the cache expects ${pipeline.ttsSampleRate} Hz`,
            tool: "kokoro",
          });
        }

        return audio.audio;
      }
    );

    return Tts.of({ synthesize });
  })
);
