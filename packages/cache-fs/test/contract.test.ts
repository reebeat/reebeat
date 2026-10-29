// The AssetCache contract against the filesystem store (offline, in `ready`). The atomicity clause (C3) runs
// against builds of the store whose file system fails at each step of a put: the provenance is renamed into place,
// the second file is written, the first file is written, the provenance is written. A reader must see nothing after
// each of them: a put that writes the provenance before its files shows up as a failed read in the first three.
import { assetCacheContract } from "@reebeat/services/contract";
import { Effect, FileSystem, Layer } from "effect";

import { fsAssetCache } from "../src/fsAssetCache.ts";
import { failingFileSystem, platform } from "./support.ts";
import type { FailingMethod } from "./support.ts";

const fresh = Layer.unwrap(
  Effect.map(
    Effect.flatMap(FileSystem.FileSystem, (fs) =>
      fs.makeTempDirectoryScoped({ prefix: "reebeat-contract-" })
    ),
    fsAssetCache
  )
).pipe(Layer.provide(platform));

/** A store in a fresh directory whose `nth` call of `method` fails. */
const failingStore = (method: FailingMethod, nth: number) =>
  Layer.orDie(
    Layer.unwrap(
      Effect.map(
        Effect.flatMap(FileSystem.FileSystem, (fs) =>
          fs.makeTempDirectoryScoped({ prefix: "reebeat-contract-" })
        ),
        (directory) =>
          fsAssetCache(directory).pipe(
            Layer.provide(failingFileSystem(method, nth))
          )
      )
    ).pipe(Layer.provide(platform))
  );

assetCacheContract("fs cache", fresh, {
  failingWriters: [
    {
      layer: failingStore("rename", 1),
      when: "the provenance is renamed into place",
    },
    {
      layer: failingStore("writeFile", 2),
      when: "the second file is written",
    },
    { layer: failingStore("writeFile", 1), when: "the first file is written" },
    {
      layer: failingStore("writeFileString", 1),
      when: "the provenance is written",
    },
  ],
});
