// The filesystem AssetCache beyond the contract: the on-disk layout (files named `<key>.<name>`, the provenance
// file last), and the entries a reader must not trust.
import { assert, layer } from "@effect/vitest";
import { localEgress, AssetCache } from "@reebeat/services";
import type { Asset } from "@reebeat/services";
import { Array as Arr, Effect, FileSystem, Option, Order, Path } from "effect";

import { fsAssetCache } from "../src/fsAssetCache.ts";
import { platform } from "./support.ts";

const adapter = { egress: localEgress, id: "test@1", settings: { voice: "v" } };

const asset = (key: string, text: string): Asset => ({
  files: [
    { bytes: new TextEncoder().encode(text), name: "audio.bin" },
    { bytes: new TextEncoder().encode("{}"), name: "words.json" },
  ],
  provenance: {
    adapter: adapter.id,
    createdBy: "test",
    egress: adapter.egress,
    keyParts: { input: text, key },
    settings: adapter.settings,
  },
});

const key = "ab".repeat(32);

const inTemp = <A, E>(
  use: (
    dir: string,
    cache: AssetCache["Service"]
  ) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>
) =>
  Effect.gen(function* run() {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-cache-" });

    return yield* Effect.provide(
      Effect.gen(function* inCache() {
        return yield* use(dir, yield* AssetCache);
      }),
      fsAssetCache(dir)
    );
  });

layer(platform)("fsAssetCache layout", (it) => {
  it.effect("writes <key>.<name> files and the provenance file last", () =>
    inTemp((dir, cache) =>
      Effect.gen(function* layout() {
        const fs = yield* FileSystem.FileSystem;

        yield* cache.put(key, asset(key, "hello"));

        assert.deepStrictEqual(
          Arr.sort(yield* fs.readDirectory(dir), Order.String),
          [`${key}.audio.bin`, `${key}.provenance.json`, `${key}.words.json`]
        );
      })
    )
  );

  it.effect("shows nothing while the provenance file is absent", () =>
    inTemp((dir, cache) =>
      Effect.gen(function* orphan() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* cache.put(key, asset(key, "hello"));
        yield* fs.remove(path.join(dir, `${key}.provenance.json`));

        assert.isTrue(Option.isNone(yield* cache.get(key)));
        assert.deepStrictEqual(yield* cache.list, []);
      })
    )
  );

  it.effect(
    "fails CacheFailed when a file no longer has the recorded hash",
    () =>
      inTemp((dir, cache) =>
        Effect.gen(function* tampered() {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;

          yield* cache.put(key, asset(key, "hello"));
          yield* fs.writeFileString(
            path.join(dir, `${key}.audio.bin`),
            "hellp"
          );

          const error = yield* Effect.flip(cache.get(key));

          assert.strictEqual(error._tag, "CacheFailed");
        })
      )
  );

  it.effect("refuses a key or a file name that could leave the directory", () =>
    inTemp((_dir, cache) =>
      Effect.gen(function* escaping() {
        const badKey = yield* Effect.flip(cache.put("../x", asset(key, "a")));

        const badName = yield* Effect.flip(
          cache.put(key, {
            ...asset(key, "a"),
            files: [{ bytes: new Uint8Array(), name: "../x" }],
          })
        );

        assert.strictEqual(badKey._tag, "CacheFailed");
        assert.strictEqual(badName._tag, "CacheFailed");
      })
    )
  );

  it.effect(
    "replaces an asset whole: the new files and the new provenance",
    () =>
      inTemp((_dir, cache) =>
        Effect.gen(function* replace() {
          yield* cache.put(key, asset(key, "first"));
          yield* cache.put(key, asset(key, "second"));

          const found = yield* cache.get(key);

          assert.deepStrictEqual(
            Option.map(found, (value) =>
              new TextDecoder().decode(value.files[0]?.bytes)
            ),
            Option.some("second")
          );
          assert.strictEqual((yield* cache.list).length, 1);
        })
      )
  );
});
