// The tests' one runtime adapter: the platform services (file system, path) and the SHA-256 digest the adapter
// runs on, and the platform file system with one operation made to fail, for the atomicity tests.
import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, PlatformError, Ref } from "effect";

export const platform = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest);

/** The file system operations of a `put` that a failing store can break. */
export type FailingMethod = "rename" | "writeFile" | "writeFileString";

/** The platform file system whose `nth` call of `method` fails with a full disk; calls count from 1 per build. */
export const failingFileSystem = (method: FailingMethod, nth = 1) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* failing() {
      const real = yield* FileSystem.FileSystem;
      const calls = yield* Ref.make(0);

      const trip = (name: FailingMethod) =>
        Effect.flatMap(
          Ref.updateAndGet(calls, (count) => count + 1),
          (count) =>
            count === nth
              ? Effect.fail(
                  PlatformError.badArgument({
                    description: "the disk is full",
                    method: name,
                    module: "FileSystem",
                  })
                )
              : Effect.void
        );

      return FileSystem.FileSystem.of({
        ...real,
        rename: (from, to) =>
          method === "rename"
            ? Effect.andThen(trip("rename"), real.rename(from, to))
            : real.rename(from, to),
        writeFile: (path, data, options) =>
          method === "writeFile"
            ? Effect.andThen(
                trip("writeFile"),
                real.writeFile(path, data, options)
              )
            : real.writeFile(path, data, options),
        writeFileString: (path, data, options) =>
          method === "writeFileString"
            ? Effect.andThen(
                trip("writeFileString"),
                real.writeFileString(path, data, options)
              )
            : real.writeFileString(path, data, options),
      });
    })
  ).pipe(Layer.provide(platform));
