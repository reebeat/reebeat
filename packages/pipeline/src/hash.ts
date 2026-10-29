// SHA-256 as lower-case hex through Effect's `Digest` service: the one digest of the build program (the cache key,
// the narration audio, the source file and every file of the manifest).
import { Digest } from "effect/crypto";

/** The SHA-256 of `bytes`, 64 lower-case hex digits. `Digest` cannot fail on bytes. */
export const sha256Hex = (bytes: Uint8Array) =>
  Digest.Digest.use((digest) => digest.digestHex(Digest.sha256, bytes));
