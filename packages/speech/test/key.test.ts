// speechKey: SHA-256 over the canonical JSON of the parameters; every input must change the key.
import { assert, describe, layer } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  Record,
  Schema,
} from "effect";

import { sha256Hex, speechKey, speechParams } from "../src/key.ts";
import type { SpeechParams } from "../src/key.ts";
import { ffmpegFlags, pipeline } from "../src/pipeline.ts";
import { platform } from "./support.ts";

const base = speechParams({ speed: 1, text: "Names are cheap." });

const changed: Readonly<Record<keyof SpeechParams, SpeechParams>> = {
  dtype: { ...base, dtype: "q8" },
  ffmpegFlags: { ...base, ffmpegFlags: `${base.ffmpegFlags} -af loudnorm` },
  kokoroJs: { ...base, kokoroJs: "1.2.2" },
  pipelineVersion: { ...base, pipelineVersion: base.pipelineVersion + 1 },
  speed: { ...base, speed: 0.9 },
  text: { ...base, text: "Names are cheap!" },
  ttsModel: { ...base, ttsModel: "onnx-community/Kokoro-82M-v1.1-zh-ONNX" },
  voice: { ...base, voice: "af_bella" },
  whisperCpp: { ...base, whisperCpp: "1.9.6" },
  whisperModelSha256: { ...base, whisperModelSha256: "0".repeat(64) },
};

const RootManifest = Schema.fromJsonString(
  Schema.Struct({ catalog: Schema.Record(Schema.String, Schema.String) })
);

layer(platform)("speechKey", (it) => {
  it.effect(
    "is the SHA-256 of the canonical JSON: keys alphabetical, no spaces",
    () =>
      Effect.gen(function* canonical() {
        const params = speechParams({ speed: 0.9, text: "Hello there." });

        const text = `{"dtype":"fp32","ffmpegFlags":"${ffmpegFlags}","kokoroJs":"1.2.1","pipelineVersion":1,"speed":0.9,"text":"Hello there.","ttsModel":"onnx-community/Kokoro-82M-v1.0-ONNX","voice":"af_heart","whisperCpp":"1.9.5-dev","whisperModelSha256":"a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"}`;

        assert.strictEqual(
          yield* speechKey(params),
          yield* sha256Hex(new TextEncoder().encode(text))
        );
      })
  );

  it.effect("does not depend on the order the parameters were written in", () =>
    Effect.gen(function* order() {
      const reversed: SpeechParams = {
        dtype: base.dtype,
        ffmpegFlags: base.ffmpegFlags,
        kokoroJs: base.kokoroJs,
        pipelineVersion: base.pipelineVersion,
        speed: base.speed,
        text: base.text,
        ttsModel: base.ttsModel,
        voice: base.voice,
        whisperCpp: base.whisperCpp,
        whisperModelSha256: base.whisperModelSha256,
      };

      assert.strictEqual(yield* speechKey(reversed), yield* speechKey(base));
      assert.match(yield* speechKey(base), /^[0-9a-f]{64}$/u);
    })
  );

  it.effect.each(Record.toEntries(changed))(
    "changes when %s changes",
    ([name, other]) =>
      Effect.gen(function* sensitivity() {
        assert.notStrictEqual(
          yield* speechKey(other),
          yield* speechKey(base),
          `${name} is part of the key`
        );
      })
  );

  it.effect(
    "names every parameter field in the key (each one is tested above)",
    () =>
      Effect.sync(() => {
        assert.deepStrictEqual(
          Arr.sort(Record.keys(changed), Order.String),
          Arr.sort(Record.keys(base), Order.String)
        );
      })
  );

  it.effect("names the pipeline facts of the fixed pipeline", () =>
    Effect.sync(() => {
      assert.strictEqual(base.voice, "af_heart");
      assert.strictEqual(base.dtype, "fp32");
      assert.strictEqual(base.whisperModelSha256, pipeline.whisperModelSha256);
      assert.include(base.ffmpegFlags, "-compression_level 8");
      assert.include(base.ffmpegFlags, "-ar 16000 -ac 1");
    })
  );

  it.effect("names the kokoro-js version of the root catalog", () =>
    Effect.gen(function* catalog() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const manifest = yield* Schema.decodeEffect(RootManifest)(
        yield* fs.readFileString(
          yield* path.fromFileUrl(
            new URL("../../../package.json", import.meta.url)
          )
        )
      );

      assert.strictEqual(manifest.catalog["kokoro-js"], pipeline.kokoroJs);
    })
  );
});

describe("the fixed flags", () => {
  layer(platform)("are one source", (it) => {
    it.effect(
      "the key's ffmpegFlags is built from the arrays the runs use",
      () =>
        Effect.sync(() => {
          for (const arg of [...pipeline.flacArgs, ...pipeline.resampleArgs]) {
            assert.include(ffmpegFlags, arg);
          }
        })
    );
  });
});
