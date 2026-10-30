// The source walk the release rules use (moved with `sourceFiles` from the retired tier gate, spec 0017): what it
// reads, and that it reports a symbolic link and fails on a directory it cannot read instead of skipping either.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path, PlatformError } from "effect";

import { sourceFiles } from "../sourceFiles.ts";
import { tree } from "./tree.ts";

const platform = NodeServices.layer;

describe("sourceFiles: what the gate reads, and what it refuses to skip", () => {
  it.effect(
    "lists TypeScript sources, dotfiles included, and nothing of dependencies, tests, live suites, fixtures, build output or declarations",
    () =>
      Effect.gen(function* listed() {
        const path = yield* Path.Path;

        const root = yield* tree({
          ".git/g.ts": "",
          "bin/run.ts": "",
          "dist/o.ts": "",
          "fixtures/f.ts": "",
          "live/l.ts": "",
          "node_modules/m/x.ts": "",
          "src/.hidden.ts": "",
          "src/a.ts": "",
          "src/c.mts": "",
          "src/d.cts": "",
          "src/e.js": "",
          "src/nested/b.tsx": "",
          "src/nested/node_modules/n.ts": "",
          "src/notes.md": "",
          "src/test/deep.ts": "",
          "src/types.d.ts": "",
          "test/t.ts": "",
        });

        const listing = yield* sourceFiles(root);

        assert.deepStrictEqual(
          Arr.map(listing.files, (file) => path.relative(root, file)),
          [
            "bin/run.ts",
            "src/.hidden.ts",
            "src/a.ts",
            "src/c.mts",
            "src/d.cts",
            "src/nested/b.tsx",
          ]
        );
        assert.deepStrictEqual(listing.opaque, []);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a symbolic link under the sources is opaque, not followed and not skipped",
    () =>
      Effect.gen(function* linked() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const root = yield* tree({
          "elsewhere/b.ts": "export {};\n",
          "src/index.ts": "export {};\n",
        });

        yield* fs.symlink(
          path.join(root, "elsewhere"),
          path.join(root, "src", "linked")
        );

        const listing = yield* sourceFiles(path.join(root, "src"));

        assert.deepStrictEqual(
          Arr.map(listing.files, (file) => path.relative(root, file)),
          ["src/index.ts"]
        );
        assert.deepStrictEqual(
          Arr.map(listing.opaque, (entry) => path.relative(root, entry)),
          ["src/linked"]
        );
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a directory that cannot be read fails the listing with the platform error",
    () =>
      Effect.gen(function* unreadable() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* tree({ "src/a.ts": "", "src/locked/c.ts": "" });
        const locked = path.join(root, "src", "locked");

        const denying = FileSystem.FileSystem.of({
          ...fs,
          readDirectoryEntries: (directory) =>
            directory === locked
              ? Effect.fail(
                  PlatformError.badArgument({
                    description: "the directory cannot be read",
                    method: "readDirectoryEntries",
                    module: "FileSystem",
                  })
                )
              : fs.readDirectoryEntries(directory),
        });

        const error = yield* Effect.flip(
          Effect.provideService(
            sourceFiles(root),
            FileSystem.FileSystem,
            denying
          )
        );

        assert.strictEqual(error.reason._tag, "BadArgument");
      }).pipe(Effect.provide(platform))
  );
});
