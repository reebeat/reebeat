// SHA-256 as lower-case hex, through the platform `Crypto` service.
import { Crypto, Effect } from "effect";
import { Hex } from "effect/encoding";

export const sha256Hex = (bytes: Uint8Array) =>
  Effect.flatMap(Crypto.Crypto, (crypto) =>
    Effect.map(crypto.digest("SHA-256", bytes), Hex.encode)
  );
