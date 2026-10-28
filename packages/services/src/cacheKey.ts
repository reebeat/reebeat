// The one cache key (spec 0001, design R3): SHA-256, as lower-case hex, of the canonical JSON of
// `{ adapter id, settings, input, extra }`, hashed through Effect's `Crypto` service. Canonical means every object
// key sorted, so equal requests written in any order give one key. A secret cannot enter: `settings` is by contract
// non-secret, and a setting whose name looks like a credential is rejected here and in `AssetCache.put`.
import { Array as Arr, Crypto, Effect, Order, Record, Schema } from "effect";
import { Hex } from "effect/encoding";

import type { KeyRequest } from "./assetCache.ts";
import { SecretLikeSetting } from "./errors.ts";
import { isJsonArray, isJsonObject } from "./json.ts";
import type { Settings } from "./types.ts";

/** The names a setting must not have: they say the value is a secret. */
const secretName = /key|token|secret|password|credential/iu;

/** The setting names of `settings` that look like a secret, in sorted order. */
export const secretLikeNames = (settings: Settings): readonly string[] =>
  Arr.sort(
    Arr.filter(Record.keys(settings), (name) => secretName.test(name)),
    Order.String
  );

/** Fails `SecretLikeSetting` naming the first secret-looking setting of `adapter`; never the value. */
export const rejectSecretSettings = (
  adapter: string,
  settings: Settings
): Effect.Effect<void, SecretLikeSetting> => {
  const [setting] = secretLikeNames(settings);

  return setting === undefined
    ? Effect.void
    : Effect.fail(
        new SecretLikeSetting({
          adapter,
          message: `setting "${setting}" of ${adapter} looks like a secret; secrets come from the environment and never enter a cache key, a cache entry or a manifest`,
          setting,
        })
      );
};

const sortKeys = (value: Schema.Json): Schema.Json => {
  if (isJsonArray(value)) {
    return Arr.map(value, sortKeys);
  }

  if (isJsonObject(value)) {
    return Record.map(
      Record.fromEntries(
        Arr.sort(
          Record.toEntries(value),
          Order.mapInput(
            Order.String,
            ([name]: readonly [string, Schema.Json]) => name
          )
        )
      ),
      sortKeys
    );
  }

  return value;
};

const canonicalText = Schema.encodeEffect(Schema.fromJsonString(Schema.Json));

/**
 * The cache key of `request`: 64 lower-case hex digits. Pure in its inputs; the digest comes from `Crypto`, whose
 * failure is a defect.
 */
export const assetKey = Effect.fnUntraced(function* assetKey(
  request: KeyRequest
): Effect.fn.Return<string, SecretLikeSetting, Crypto.Crypto> {
  yield* rejectSecretSettings(request.adapter.id, request.adapter.settings);

  const crypto = yield* Crypto.Crypto;

  const text = yield* Effect.orDie(
    canonicalText(
      sortKeys({
        adapter: request.adapter.id,
        extra: request.extra ?? null,
        input: request.input,
        settings: request.adapter.settings,
      })
    )
  );

  return Hex.encode(
    yield* Effect.orDie(
      crypto.digest("SHA-256", new TextEncoder().encode(text))
    )
  );
});
