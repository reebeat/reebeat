// The edges of the aligner that need no model: whisper's JSON, the command lines, the s16 samples, the Config
// names, and the typed errors of a missing requirement (raised on the first align, not when the layer is built).
import { assert, layer } from "@effect/vitest";
import { WordAligner } from "@tsukuri/services";
import type { AlignError } from "@tsukuri/services";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Path,
  Predicate,
} from "effect";

import {
  heardWords,
  resampleCommand,
  s16Bytes,
  whisperAligner,
  whisperCommand,
  whisperConfig,
} from "../src/whisperAligner.ts";
import { platform } from "./support.ts";

const whisperJson = `{"transcription":[
  {"offsets":{"from":0,"to":130},"text":""},
  {"offsets":{"from":130,"to":310},"text":" A"},
  {"offsets":{"from":310,"to":520},"text":" box."},
  {"offsets":{"from":520,"to":560},"text":"   "}
]}`;

const withEnv = (env: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)));

const requirementOf = (failure: AlignError): string =>
  Predicate.isTagged(failure, "AdapterUnavailable")
    ? failure.requirement
    : "not AdapterUnavailable";

const clip = { sampleRate: 24_000, samples: new Float32Array(2400) };

const alignOnce = Effect.gen(function* alignOnce() {
  return yield* (yield* WordAligner).align({ clip, words: ["a", "box"] });
});

/** The failure of one align with the aligner built over `env`; the layer itself must build. */
const alignFailure = (env: Record<string, string>) =>
  Effect.flip(
    Effect.provide(
      alignOnce,
      Layer.provide(
        whisperAligner,
        Layer.merge(
          platform,
          ConfigProvider.layer(ConfigProvider.fromUnknown(env))
        )
      )
    )
  );

layer(platform)("whisper output", (it) => {
  it.effect(
    "keeps the words with their times and drops the empty segments",
    () =>
      Effect.gen(function* words() {
        assert.deepStrictEqual(yield* heardWords(whisperJson), [
          { endMs: 310, startMs: 130, w: "A" },
          { endMs: 520, startMs: 310, w: "box." },
        ]);
      })
  );

  it.effect.each([
    { label: "not JSON", text: "{" },
    {
      label: "JSON of another layout",
      text: '{"transcription":[{"text":"x"}]}',
    },
  ])("fails with AlignmentFailed on output that is $label", ({ text }) =>
    Effect.gen(function* malformed() {
      const failure = yield* Effect.flip(heardWords(text));

      assert.strictEqual(failure._tag, "AlignmentFailed");
    })
  );
});

layer(platform)("commands", (it) => {
  it.effect("resample to 16 kHz mono s16 from the clip's own rate", () =>
    Effect.sync(() => {
      assert.deepStrictEqual(resampleCommand("in.s16", 24_000, "in.wav"), [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-f",
        "s16le",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-i",
        "in.s16",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        "in.wav",
      ]);
      assert.deepStrictEqual(whisperCommand("m.bin", "in.wav", "out/words"), [
        "-m",
        "m.bin",
        "-f",
        "in.wav",
        "-ml",
        "1",
        "-sow",
        "-oj",
        "-np",
        "-t",
        "4",
        "-of",
        "out/words",
      ]);
    })
  );

  it.effect("the samples are s16 little endian, rounded and clamped", () =>
    Effect.sync(() => {
      const bytes = s16Bytes(
        Float32Array.from([0, 0.5, -0.5, 1, -1, 2, 1 / 32_768])
      );

      assert.deepStrictEqual(
        [...new Int16Array(bytes.buffer, bytes.byteOffset, 7)],
        [0, 16_384, -16_384, 32_767, -32_768, 32_767, 1]
      );
    })
  );
});

layer(platform)("configuration", (it) => {
  it.effect("reads the model location and defaults the whisper binary", () =>
    Effect.gen(function* read() {
      assert.deepStrictEqual(
        yield* whisperConfig.pipe(
          withEnv({ TSUKURI_WHISPER_MODEL: "/models/base.bin" })
        ),
        { bin: "whisper-cli", model: "/models/base.bin" }
      );
      assert.deepStrictEqual(
        yield* whisperConfig.pipe(
          withEnv({
            TSUKURI_WHISPER_BIN: "/opt/whisper",
            TSUKURI_WHISPER_MODEL: "/models/base.bin",
          })
        ),
        { bin: "/opt/whisper", model: "/models/base.bin" }
      );
    })
  );
});

layer(platform)("a missing requirement", (it) => {
  it.effect(
    "builds the layer and raises on the first align: no model variable",
    () =>
      Effect.gen(function* noModel() {
        assert.strictEqual(
          requirementOf(yield* alignFailure({})),
          "env TSUKURI_WHISPER_MODEL"
        );
      })
  );

  it.effect("names the binary when it cannot start", () =>
    Effect.gen(function* noBinary() {
      assert.strictEqual(
        requirementOf(
          yield* alignFailure({
            TSUKURI_WHISPER_BIN: "/nonexistent/whisper-cli",
            TSUKURI_WHISPER_MODEL: "/nonexistent/model.bin",
          })
        ),
        "binary whisper-cli"
      );
    })
  );

  it.effect("names the model when its file is not the pinned one", () =>
    Effect.gen(function* wrongModel() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "tsukuri-model-",
      });

      const model = path.join(directory, "ggml-base.en.bin");

      yield* fs.writeFileString(model, "not a model");

      assert.match(
        requirementOf(yield* alignFailure({ TSUKURI_WHISPER_MODEL: model })),
        /^model ggml-base\.en\.bin with SHA-256 [0-9a-f]{64}$/u
      );
    })
  );
});
