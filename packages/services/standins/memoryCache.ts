// The in-memory stand-in for AssetCache: the content-addressed store of one process. Offline; its id ends
// `-standin`. It writes the files first and the metadata last, and a reader looks at the metadata first, so a
// `put` that stops half way is invisible. `memoryCacheWith` lets a test stop it there.
import {
  Array as Arr,
  Crypto,
  Effect,
  Layer,
  Option,
  Order,
  Record,
  Ref,
} from "effect";

import { AssetCache } from "../src/assetCache.ts";
import { assetKey, rejectSecretSettings } from "../src/cacheKey.ts";
import type { CacheFailed } from "../src/errors.ts";
import { localEgress } from "../src/types.ts";
import type { Asset, Provenance } from "../src/types.ts";

export interface MemoryCacheOptions {
  /** Runs after the files are stored and before the metadata is: a failure here is a write that stops half way. */
  readonly beforeMetadata?: Effect.Effect<void, CacheFailed>;
}

type Files = Asset["files"];

const copy = (files: Files): Files =>
  Arr.map(files, ({ bytes, name }) => ({
    bytes: Uint8Array.from(bytes),
    name,
  }));

/** An AssetCache that keeps its assets in memory; it needs the platform `Crypto` service for the key. */
export const memoryCacheWith = (options: MemoryCacheOptions = {}) =>
  Layer.effect(
    AssetCache,
    Effect.gen(function* build() {
      const crypto = yield* Crypto.Crypto;
      const files = yield* Ref.make<Readonly<Record<string, Files>>>({});

      const metadata = yield* Ref.make<Readonly<Record<string, Provenance>>>(
        {}
      );

      const get = Effect.fnUntraced(function* get(key: string) {
        const provenance = Record.get(yield* Ref.get(metadata), key);
        const stored = Record.get(yield* Ref.get(files), key);

        return Option.zipWith(provenance, stored, (found, bytes) => ({
          files: copy(bytes),
          provenance: found,
        }));
      });

      const put = Effect.fnUntraced(function* put(key: string, asset: Asset) {
        yield* rejectSecretSettings(
          asset.provenance.adapter,
          asset.provenance.settings
        );
        yield* Ref.update(files, Record.set(key, copy(asset.files)));
        yield* options.beforeMetadata ?? Effect.void;
        yield* Ref.update(metadata, Record.set(key, asset.provenance));
      });

      return AssetCache.of({
        get,
        info: { egress: localEgress, id: "memory@1-standin", settings: {} },
        key: (request) =>
          Effect.provideService(assetKey(request), Crypto.Crypto, crypto),
        list: Effect.map(Ref.get(metadata), (stored) =>
          Arr.sort(
            Record.values(stored),
            Order.mapInput(
              Order.String,
              (provenance: Provenance) => provenance.keyParts.key
            )
          )
        ),
        put,
      });
    })
  );

/** The in-memory stand-in. */
export const memoryCache = memoryCacheWith();
