// The contract of AssetCache: what every store (memory, filesystem) promises: a content address that reacts to
// everything that changes the output and never to a secret, whole-or-nothing writes and the provenance of every asset.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { Layer } from "effect";

import { AssetCache } from "../src/assetCache.ts";
import type { KeyRequest } from "../src/assetCache.ts";
import type { CacheError, KeyError } from "../src/errors.ts";
import type { AdapterInfo, Asset, Settings } from "../src/types.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import { assertInfoDeclared, failureOf, sameBytes } from "./support.ts";

/** A build of the cache whose `put` fails at one step; `when` names the step, for the name of the test. */
interface FailingWriter {
  readonly layer: Layer.Layer<AssetCache>;
  readonly when: string;
}

export interface AssetCacheOptions {
  /**
   * Builds of the cache whose `put` fails half way, each at a different step (after the files and before the
   * metadata; at the second file; at the metadata itself). The clause reads the failed asset back: a store that
   * wrote its metadata first, or in no safe order, shows it. Clause C3 requires at least one: without any, the
   * contract registers a FAILING test, never a skipped one.
   */
  readonly failingWriters?: readonly FailingWriter[];
}

type Failure = CacheError | KeyError;

const adapter: AdapterInfo = {
  egress: { kind: "local", sends: [] },
  id: "contract@1",
  settings: { model: "m1", speed: 1, voice: "af" },
};

/** The key of the contract adapter with `input`, after `change` to its id or settings. */
const keyWith = (
  input: string,
  change: {
    readonly extra?: KeyRequest["extra"];
    readonly id?: string;
    readonly settings?: Settings;
  } = {}
) =>
  Effect.flatMap(AssetCache, (cache) =>
    cache.key({
      adapter: {
        ...adapter,
        id: change.id ?? adapter.id,
        settings: change.settings ?? adapter.settings,
      },
      extra: change.extra ?? null,
      input,
    })
  );

const asset = (key: string, input: string): Asset => ({
  files: [
    { bytes: new Uint8Array([1, 2, 3]), name: "audio.flac" },
    { bytes: new Uint8Array([4, 5]), name: "words.json" },
  ],
  provenance: {
    adapter: adapter.id,
    createdBy: "contract",
    egress: adapter.egress,
    keyParts: { input, key },
    settings: adapter.settings,
  },
});

const sameFiles = (left: Asset, right: Asset): boolean =>
  left.files.length === right.files.length &&
  Arr.every(
    left.files,
    (file, index) =>
      file.name === right.files[index]?.name &&
      sameBytes(file.bytes, right.files[index]?.bytes ?? new Uint8Array())
  );

const hex64 = /^[0-9a-f]{64}$/u;

const secretNames = [
  "apiKey",
  "TOKEN",
  "client_secret",
  "password",
  "credentials",
];

/** The clauses of the contract, as data (a test runs them against broken adapters). */
export const assetCacheClauses: readonly Clause<Failure, AssetCache>[] = [
  {
    id: "C1",
    means: "put then get returns the same files and provenance",
    run: Effect.gen(function* clause() {
      const cache = yield* AssetCache;
      const key = yield* keyWith("round trip");
      const stored = asset(key, "round trip");

      yield* cache.put(key, stored);

      const found = yield* cache.get(key);

      assert.isTrue(Option.isSome(found));

      if (Option.isSome(found)) {
        assert.isTrue(sameFiles(found.value, stored));
        assert.deepStrictEqual(found.value.provenance, stored.provenance);
      }
    }),
  },
  {
    id: "C2",
    means: "a key that was never put is none",
    run: Effect.gen(function* clause() {
      const cache = yield* AssetCache;

      assert.isTrue(
        Option.isNone(yield* cache.get(yield* keyWith("never stored")))
      );
    }),
  },
  {
    id: "C4",
    means:
      "the key is 64 hex digits, equal for equal parts whatever the order of settings",
    run: Effect.gen(function* clause() {
      const base = yield* keyWith("names");

      const reordered = yield* keyWith("names", {
        settings: { model: "m1", speed: 1, voice: "af" },
      });

      assert.match(base, hex64);
      assert.strictEqual(yield* keyWith("names"), base);
      assert.strictEqual(reordered, base);
    }),
  },
  {
    id: "C5",
    means:
      "the key changes with the adapter id, a setting's value, a new setting, the input and the extra JSON",
    run: Effect.gen(function* clause() {
      const base = yield* keyWith("names");

      const others = yield* Effect.all([
        keyWith("names", { id: "contract@2" }),
        keyWith("names", { settings: { ...adapter.settings, voice: "bf" } }),
        keyWith("names", { settings: { ...adapter.settings, pitch: 2 } }),
        keyWith("names!"),
        keyWith("names", { extra: { page: 1 } }),
      ]);

      assert.strictEqual(
        Arr.dedupe([base, ...others]).length,
        others.length + 1
      );
    }),
  },
  {
    id: "C6",
    means:
      "a secret-looking setting name is rejected with the typed SecretLikeSetting, and the value never appears",
    run: Effect.gen(function* clause() {
      for (const name of secretNames) {
        const failure = yield* failureOf(
          keyWith("names", {
            settings: { ...adapter.settings, [name]: "hunter2" },
          }),
          `a key over setting ${name}`
        );

        assert.strictEqual(failure._tag, "SecretLikeSetting");
        assert.strictEqual(failure.setting, name);
        assert.isFalse(Str.includes("hunter2")(failure.message));
      }
    }),
  },
  {
    id: "C7",
    means: "list returns the provenance of every asset that was put",
    run: Effect.gen(function* clause() {
      const cache = yield* AssetCache;
      const key = yield* keyWith("listed");

      yield* cache.put(key, asset(key, "listed"));

      assert.deepStrictEqual(
        Arr.filter(
          yield* cache.list,
          (provenance) => provenance.keyParts.key === key
        ),
        [asset(key, "listed").provenance]
      );
    }),
  },
  {
    id: "C8",
    means:
      "put rejects a secret-looking setting in the provenance and stores nothing",
    run: Effect.gen(function* clause() {
      const cache = yield* AssetCache;
      const key = Str.repeat(64)("f");
      const stored = asset(key, "secret");

      const failure = yield* failureOf(
        cache.put(key, {
          ...stored,
          provenance: { ...stored.provenance, settings: { apiKey: "hunter2" } },
        }),
        "a put of a secret-looking setting"
      );

      assert.strictEqual(failure._tag, "SecretLikeSetting");
      assert.isTrue(Option.isNone(yield* cache.get(key)));
    }),
  },
  {
    id: "C9",
    means:
      "info declares its id, its egress (local sends nothing) and non-secret settings",
    run: Effect.gen(function* clause() {
      assertInfoDeclared((yield* AssetCache).info);
    }),
  },
];

/** C3: a `put` that fails after the files and before the metadata leaves nothing a reader can see. */
export const atomicWriteClause: Clause<Failure, AssetCache> = {
  id: "C3",
  means:
    "put is atomic: a put that fails half way is invisible to get and list (files first, metadata last)",
  run: Effect.gen(function* clause() {
    const cache = yield* AssetCache;
    const key = Str.repeat(64)("a");

    yield* Effect.ignore(cache.put(key, asset(key, "half written")));

    assert.isTrue(Option.isNone(yield* cache.get(key)));
    assert.isFalse(
      Arr.some(
        yield* cache.list,
        (provenance) => provenance.keyParts.key === key
      )
    );
  }),
};

/** Registers the AssetCache contract for the store provided by `layer`. */
export const assetCacheContract = <LE>(
  label: string,
  layer: Layer.Layer<AssetCache, LE>,
  options: AssetCacheOptions = {}
): void => {
  registerClauses(label, layer, assetCacheClauses);

  describe(`${label}: atomic write`, () => {
    const writers = options.failingWriters ?? [];

    if (writers.length === 0) {
      // C3 cannot be checked without a store that fails half way: a missing writer is a failing test, not a skip.
      it("C3: put is atomic (FAILS: the adapter supplied no failing writer)", () => {
        assert.fail(
          `${label} supplied no failing writer, so C3 (put is atomic) is not checked`
        );
      });
    }

    for (const writer of writers) {
      registerClauses(`${label}, put fails when ${writer.when}`, writer.layer, [
        atomicWriteClause,
      ]);
    }
  });
};
