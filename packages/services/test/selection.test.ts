// The selection registry: defaults are the local adapters; an unknown key or value fails naming key, value and the
// choices; extra keys are rejected; nothing falls back silently.
import { assert, describe, it } from "@effect/vitest";
import { Effect, Record } from "effect";

import { choices, decodeSelection, defaults } from "../src/selection.ts";

describe("decodeSelection", () => {
  it.effect("an empty selection is the local adapters", () =>
    Effect.gen(function* defaulted() {
      assert.deepStrictEqual(yield* decodeSelection({}), defaults);
      assert.deepStrictEqual(defaults, {
        aligner: "whisper",
        cache: "fs",
        capturer: "chromium",
        encoder: "ffmpeg",
        renderer: "reveal",
        sounds: "synth",
        speech: "kokoro",
      });
    })
  );

  it.effect("keeps what is chosen and defaults the rest", () =>
    Effect.gen(function* partial() {
      assert.deepStrictEqual(
        yield* decodeSelection({ aligner: "even", speech: "silent" }),
        {
          ...defaults,
          aligner: "even",
          speech: "silent",
        }
      );
    })
  );

  it("the registry names the choices of every key", () => {
    assert.deepStrictEqual(choices, {
      aligner: ["whisper", "even"],
      cache: ["fs"],
      capturer: ["chromium"],
      encoder: ["ffmpeg"],
      renderer: ["reveal"],
      sounds: ["synth"],
      speech: ["kokoro", "silent"],
    });
  });

  it.effect(
    "an unknown value fails UnknownSelection naming the key, the value and its choices",
    () =>
      Effect.gen(function* unknownValue() {
        const failure = yield* Effect.flip(
          decodeSelection({ speech: "elevenlabs" })
        );

        assert.strictEqual(failure._tag, "UnknownSelection");
        assert.strictEqual(failure.key, "speech");
        assert.strictEqual(failure.value, "elevenlabs");
        assert.deepStrictEqual(failure.choices, ["kokoro", "silent"]);
      })
  );

  it.effect(
    "an unknown key fails UnknownSelection naming the key and the keys",
    () =>
      Effect.gen(function* unknownKey() {
        const failure = yield* Effect.flip(
          decodeSelection({ voice: "af_heart" })
        );

        assert.strictEqual(failure._tag, "UnknownSelection");
        assert.strictEqual(failure.key, "voice");
        assert.strictEqual(failure.value, "af_heart");
        assert.deepStrictEqual(failure.choices, Record.keys(choices));
      })
  );

  it.effect("extra keys are rejected even beside valid ones", () =>
    Effect.gen(function* extra() {
      const failure = yield* Effect.flip(
        decodeSelection({ extra: true, speech: "silent" })
      );

      assert.strictEqual(failure.key, "extra");
    })
  );

  it.effect(
    "a value that is not a name is an unknown value, shown without leaking structure",
    () =>
      Effect.gen(function* notAName() {
        const failure = yield* Effect.flip(
          decodeSelection({ cache: { path: "/x" } })
        );

        assert.strictEqual(failure.key, "cache");
        assert.strictEqual(failure.value, "<object>");
        assert.deepStrictEqual(failure.choices, ["fs"]);
      })
  );

  it.effect(
    "something that is not an object fails naming the selection itself",
    () =>
      Effect.gen(function* notAnObject() {
        const failure = yield* Effect.flip(decodeSelection("kokoro"));

        assert.strictEqual(failure.key, "selection");
        assert.deepStrictEqual(failure.choices, Record.keys(choices));
      })
  );
});
