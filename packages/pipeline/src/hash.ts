// SHA-256 as lower-case hex through Effect's `Crypto` service: the one digest of the build program (the cache key,
// the narration audio, the source file and every file of the manifest).
import { Crypto, Effect } from "effect";
import { Hex } from "effect/encoding";

/** The SHA-256 of `bytes`, 64 lower-case hex digits. A digest failure is a defect: `Crypto` cannot fail on bytes. */
export const sha256Hex = (bytes: Uint8Array) =>
  Effect.gen(function* digest() {
    const crypto = yield* Crypto.Crypto;

    return Hex.encode(yield* Effect.orDie(crypto.digest("SHA-256", bytes)));
  });
