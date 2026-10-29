// assetKey: SHA-256 of the canonical JSON of { adapter id, settings, input, extra }, through the Digest service,
// and a guard that keeps secrets out of keys.
import { assert, describe, it, layer } from "@effect/vitest";
import { Effect } from "effect";
import { Digest } from "effect/crypto";

import { assetKey, secretLikeNames } from "../src/cacheKey.ts";
import type { AdapterInfo } from "../src/types.ts";
import { platform } from "./support.ts";

const adapter: AdapterInfo = {
  egress: { kind: "local", sends: [] },
  id: "kokoro@1.2.1",
  settings: { speed: 1, voice: "af_heart" },
};

const sha256Of = (text: string) =>
  Digest.Digest.use((digest) =>
    digest.digestHex(Digest.sha256, new TextEncoder().encode(text))
  );

layer(platform)("assetKey", (suite) => {
  suite.effect(
    "is the SHA-256 of the canonical JSON: keys sorted, no spaces, extra null when absent",
    () =>
      Effect.gen(function* canonical() {
        assert.strictEqual(
          yield* assetKey({ adapter, input: "Names are cheap." }),
          yield* sha256Of(
            '{"adapter":"kokoro@1.2.1","extra":null,"input":"Names are cheap.","settings":{"speed":1,"voice":"af_heart"}}'
          )
        );
      })
  );

  suite.effect(
    "is byte-identical to the SHA-256 that coreutils gives the canonical JSON, so an Effect upgrade cannot orphan the committed speech cache",
    () =>
      Effect.gen(function* pinned() {
        assert.strictEqual(
          yield* assetKey({ adapter, input: "Names are cheap." }),
          "73e0ea22fb39f1f0b9fce86250d366915f000a966cf5912112db2c1f85dc5cc4"
        );
      })
  );

  suite.effect(
    "sorts the keys of the extra JSON at every depth, and keeps array order",
    () =>
      Effect.gen(function* nested() {
        assert.strictEqual(
          yield* assetKey({
            adapter,
            extra: { a: null, b: [{ a: 2, z: 1 }, 3] },
            input: "x",
          }),
          yield* sha256Of(
            '{"adapter":"kokoro@1.2.1","extra":{"a":null,"b":[{"a":2,"z":1},3]},"input":"x","settings":{"speed":1,"voice":"af_heart"}}'
          )
        );
      })
  );

  suite.effect(
    "rejects every name that looks like a secret, naming it and never the value",
    () =>
      Effect.gen(function* secrets() {
        for (const name of [
          "apiKey",
          "access_token",
          "Secret",
          "PASSWORD",
          "credential_id",
        ]) {
          const failure = yield* Effect.flip(
            assetKey({
              adapter: { ...adapter, settings: { [name]: "hunter2" } },
              input: "x",
            })
          );

          assert.strictEqual(failure._tag, "SecretLikeSetting");
          assert.strictEqual(failure.setting, name);
          assert.strictEqual(failure.adapter, "kokoro@1.2.1");
          assert.isFalse(failure.message.includes("hunter2"));
        }
      })
  );
});

describe("secretLikeNames", () => {
  it("lists the secret-looking names of a settings record, sorted", () => {
    assert.deepStrictEqual(
      secretLikeNames({ apiKey: "x", model: "m", token: "y" }),
      ["apiKey", "token"]
    );
  });
});
