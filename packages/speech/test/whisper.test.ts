// The edges of the child-process and model boundaries that need no model: whisper's JSON, and the Config names.
import { assert, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";

import { kokoroConfig } from "../src/kokoro.ts";
import { heardWords, whisperConfig } from "../src/whisper.ts";
import { platform } from "./support.ts";

const whisperJson = `{"transcription":[
  {"offsets":{"from":0,"to":130},"text":""},
  {"offsets":{"from":130,"to":310},"text":" A"},
  {"offsets":{"from":310,"to":520},"text":" box."},
  {"offsets":{"from":520,"to":560},"text":"   "}
]}`;

const withEnv = (env: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)));

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
  ])("fails with SpeechToolFailed on output that is $label", ({ text }) =>
    Effect.gen(function* malformed() {
      const failure = yield* Effect.flip(heardWords(text));

      assert.strictEqual(failure._tag, "SpeechToolFailed");
      assert.strictEqual(failure.tool, "whisper");
    })
  );
});

layer(platform)("configuration", (it) => {
  it.effect("reads the model locations and defaults the whisper binary", () =>
    Effect.gen(function* read() {
      assert.deepStrictEqual(
        yield* whisperConfig.pipe(
          withEnv({ REEBEAT_WHISPER_MODEL: "/models/base.bin" })
        ),
        { bin: "whisper-cli", model: "/models/base.bin" }
      );
      assert.deepStrictEqual(
        yield* whisperConfig.pipe(
          withEnv({
            REEBEAT_WHISPER_BIN: "/opt/whisper",
            REEBEAT_WHISPER_MODEL: "/models/base.bin",
          })
        ),
        { bin: "/opt/whisper", model: "/models/base.bin" }
      );
      assert.strictEqual(
        yield* kokoroConfig.pipe(withEnv({ REEBEAT_KOKORO_CACHE: "/hf" })),
        "/hf"
      );
    })
  );

  it.effect("fails when a model location is missing", () =>
    Effect.gen(function* missing() {
      assert.isTrue(
        Exit.isFailure(yield* Effect.exit(whisperConfig.pipe(withEnv({}))))
      );
      assert.isTrue(
        Exit.isFailure(yield* Effect.exit(kokoroConfig.pipe(withEnv({}))))
      );
    })
  );
});
