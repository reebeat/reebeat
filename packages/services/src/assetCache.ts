// The AssetCache service (spec 0001, design R3): a content-addressed store. The key is the SHA-256 of the adapter
// id, its settings, the input text and any extra JSON (`assetKey`), so a re-render reuses paid or slow outputs and
// stays deterministic. The manifest lists the provenance of every asset.
import { Context } from "effect";
import type { Effect, Option, Schema } from "effect";

import type { CacheError, KeyError } from "./errors.ts";
import type { AdapterInfo, Asset, Provenance } from "./types.ts";

export interface KeyRequest {
  readonly adapter: AdapterInfo;
  readonly extra?: Schema.Json;
  readonly input: string;
}

/**
 * Contract: `key` is `assetKey` and rejects a secret-looking setting; `put` is atomic (a reader sees the whole
 * asset or none: files first, metadata last) and rejects a secret-looking setting in the provenance; `list`
 * returns the provenance of every asset in the store.
 */
export class AssetCache extends Context.Service<
  AssetCache,
  {
    readonly get: (
      key: string
    ) => Effect.Effect<Option.Option<Asset>, CacheError>;
    readonly info: AdapterInfo;
    readonly key: (request: KeyRequest) => Effect.Effect<string, KeyError>;
    readonly list: Effect.Effect<readonly Provenance[], CacheError>;
    readonly put: (
      key: string,
      asset: Asset
    ) => Effect.Effect<void, CacheError>;
  }
>()("@tsukuri/services/AssetCache") {}
