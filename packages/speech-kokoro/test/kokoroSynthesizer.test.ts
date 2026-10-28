// The Kokoro adapter without the model: what it passes to the model, how it maps failures, and that building the
// layer loads nothing. The contract against the real model is `live/kokoro.live.test.ts`.
import { assert, describe, it } from "@effect/vitest";
import {
  AdapterUnavailable,
  SpeechSynthesizer,
  SynthesisFailed,
} from "@reebeat/services";
import { speechSynthesizerContract } from "@reebeat/services/contract";
import { ConfigProvider, Effect, Layer, Predicate, Ref } from "effect";

import {
  kokoroSynthesizer,
  synthesizerOver,
} from "../src/kokoroSynthesizer.ts";
import type { KokoroModel } from "../src/kokoroSynthesizer.ts";

const request = { speed: 1.1, text: "Names are cheap.", voice: "af_heart" };

/** A model that records what it was asked and answers with `rate`-Hz samples. */
const recordingModel = (asked: Ref.Ref<readonly unknown[]>, rate = 24_000) =>
  Effect.succeed<KokoroModel>({
    generate: (given) =>
      Effect.as(
        Ref.update(asked, (all) => [...all, given]),
        { audio: new Float32Array([0.25, -0.25]), sampling_rate: rate }
      ),
  });

const withLoad = <A, E, R>(
  load: Effect.Effect<KokoroModel, AdapterUnavailable>,
  use: (service: SpeechSynthesizer["Service"]) => Effect.Effect<A, E, R>
) =>
  Effect.provide(
    Effect.gen(function* run() {
      return yield* use(yield* SpeechSynthesizer);
    }),
    synthesizerOver(load)
  );

describe("kokoro adapter, model faked", () => {
  it.effect("passes the request through and returns the clip at 24 kHz", () =>
    Effect.gen(function* passes() {
      const asked = yield* Ref.make<readonly unknown[]>([]);

      const { clip } = yield* withLoad(recordingModel(asked), (service) =>
        service.synthesize(request)
      );

      assert.deepStrictEqual(yield* Ref.get(asked), [request]);
      assert.strictEqual(clip.sampleRate, 24_000);
      assert.deepStrictEqual([...clip.samples], [0.25, -0.25]);
    })
  );

  it.effect("declares its model, dtype and rate, and sends nothing out", () =>
    Effect.gen(function* declares() {
      const asked = yield* Ref.make<readonly unknown[]>([]);

      const { info } = yield* withLoad(recordingModel(asked), (service) =>
        Effect.succeed(service)
      );

      assert.deepStrictEqual(info, {
        egress: { kind: "local", sends: [] },
        id: "kokoro@1.2.1",
        settings: {
          dtype: "fp32",
          model: "onnx-community/Kokoro-82M-v1.0-ONNX",
          sampleRate: 24_000,
        },
      });
    })
  );

  it.effect("fails EmptyText for no words and never loads the model", () =>
    Effect.gen(function* empty() {
      const loads = yield* Ref.make(0);
      const asked = yield* Ref.make<readonly unknown[]>([]);

      const load = Effect.flatMap(
        Ref.update(loads, (count) => count + 1),
        () => recordingModel(asked)
      );

      const failure = yield* Effect.flip(
        withLoad(load, (service) =>
          service.synthesize({ ...request, text: " \n " })
        )
      );

      assert.strictEqual(failure._tag, "EmptyText");
      assert.strictEqual(yield* Ref.get(loads), 0);
    })
  );

  it.effect(
    "loads on the first use, once, and not when the layer is built",
    () =>
      Effect.gen(function* lazily() {
        const loads = yield* Ref.make(0);
        const asked = yield* Ref.make<readonly unknown[]>([]);

        const load = Effect.flatMap(
          Ref.update(loads, (count) => count + 1),
          () => recordingModel(asked)
        );

        yield* withLoad(load, () => Effect.void);
        assert.strictEqual(yield* Ref.get(loads), 0);

        yield* withLoad(load, (service) =>
          Effect.andThen(
            service.synthesize(request),
            service.synthesize(request)
          )
        );
        assert.strictEqual(yield* Ref.get(loads), 1);
      })
  );

  it.effect(
    "raises AdapterUnavailable from the first synthesize, not from the layer",
    () =>
      Effect.gen(function* missing() {
        const model = new AdapterUnavailable({
          adapter: "kokoro@1.2.1",
          message: "no model",
          requirement: "model m",
          service: "SpeechSynthesizer",
        });

        const failure = yield* Effect.flip(
          withLoad(Effect.fail(model), (service) => service.synthesize(request))
        );

        assert.deepStrictEqual(failure, model);
      })
  );

  it.effect(
    "fails SynthesisFailed when the model answers at another rate",
    () =>
      Effect.gen(function* rate() {
        const asked = yield* Ref.make<readonly unknown[]>([]);

        const failure = yield* Effect.flip(
          withLoad(recordingModel(asked, 16_000), (service) =>
            service.synthesize(request)
          )
        );

        assert.strictEqual(failure._tag, "SynthesisFailed");
      })
  );

  it.effect("keeps the model's own SynthesisFailed", () =>
    Effect.gen(function* failing() {
      const broken = new SynthesisFailed({
        adapter: "kokoro@1.2.1",
        cause: "boom",
        message: "boom",
      });

      const failure = yield* Effect.flip(
        withLoad(
          Effect.succeed<KokoroModel>({ generate: () => Effect.fail(broken) }),
          (service) => service.synthesize(request)
        )
      );

      assert.deepStrictEqual(failure, broken);
    })
  );
});

describe("kokoroSynthesizer, real layer without a model directory", () => {
  it.effect(
    "raises AdapterUnavailable naming the environment variable, and no output",
    () =>
      Effect.gen(function* noDirectory() {
        const failure = yield* Effect.flip(
          Effect.provide(
            Effect.gen(function* run() {
              return yield* (yield* SpeechSynthesizer).synthesize(request);
            }),
            Layer.provide(
              kokoroSynthesizer,
              ConfigProvider.layer(ConfigProvider.fromUnknown({}))
            )
          )
        );

        assert.isTrue(Predicate.isTagged(failure, "AdapterUnavailable"));
        assert.strictEqual(
          Predicate.isTagged(failure, "AdapterUnavailable")
            ? failure.requirement
            : "",
          "env REEBEAT_KOKORO_CACHE"
        );
      })
  );
});

/** A deterministic model: a tone as long as the text, shorter when faster. */
const toneModel = Effect.succeed<KokoroModel>({
  generate: ({ speed, text }) =>
    Effect.succeed({
      audio: Float32Array.from(
        { length: Math.round((text.length * 480) / speed) },
        (_, index) => Math.sin(index / 20)
      ),
      sampling_rate: 24_000,
    }),
});

speechSynthesizerContract(
  "kokoro adapter over a fake model",
  synthesizerOver(toneModel),
  { voice: "af_heart" }
);
