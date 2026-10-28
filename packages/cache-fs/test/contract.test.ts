// The AssetCache contract against the filesystem store (offline, in `ready`). The atomicity clause (C3) runs
// against a second build of the store whose rename of the provenance file fails: the files are down and the
// provenance is not, so a reader must see nothing.
import { assetCacheContract } from "@reebeat/services/contract";
import { Effect, FileSystem, Layer, PlatformError } from "effect";

import { fsAssetCache } from "../src/fsAssetCache.ts";
import { platform } from "./support.ts";

const failingRename = Layer.effect(
  FileSystem.FileSystem,
  Effect.map(FileSystem.FileSystem, (real) =>
    FileSystem.FileSystem.of({
      ...real,
      rename: () =>
        Effect.fail(
          PlatformError.badArgument({
            description: "the disk is full",
            method: "rename",
            module: "FileSystem",
          })
        ),
    })
  )
);

const fresh = Layer.unwrap(
  Effect.map(
    Effect.flatMap(FileSystem.FileSystem, (fs) =>
      fs.makeTempDirectoryScoped({ prefix: "reebeat-contract-" })
    ),
    fsAssetCache
  )
).pipe(Layer.provide(platform));

const failingWriter = Layer.unwrap(
  Effect.map(
    Effect.flatMap(FileSystem.FileSystem, (fs) =>
      fs.makeTempDirectoryScoped({ prefix: "reebeat-contract-" })
    ),
    (directory) =>
      fsAssetCache(directory).pipe(
        Layer.provide(Layer.provide(failingRename, platform))
      )
  )
).pipe(Layer.provide(platform));

assetCacheContract("fs cache", fresh, {
  failingWriter: Layer.orDie(failingWriter),
});
