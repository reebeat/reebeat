// Builds what is published (spec 0009): for every public package, `<package>/dist` holds the bundled ESM, the
// declarations TypeScript 7 emits through `vp pack`, a `package.json` written by `release.ts` (exports pointing at the
// build, `workspace:*` and `catalog:` replaced by versions), the README, the CHANGELOG when Changesets wrote one, and
// the repository's LICENSE and NOTICE. `changeset publish` publishes that directory (`publishConfig.directory`).
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  decodePackListing,
  decodeRoot,
  encodePublished,
  entriesOf,
  publicPackages,
  publishDirectory,
  publishManifest,
  readPackages,
  unexpectedFiles,
  versionsOf,
} from "./release.ts";
import type { StagedManifest, WorkspacePackage } from "./release.ts";

class ReleaseFailed extends Schema.TaggedError<
  ReleaseFailed,
  { readonly brand: unique symbol }
>()("ReleaseFailed", {
  message: Schema.String,
}) {}

/** Files of the repository root that every published package carries (Apache-2.0 section 4 and the NOTICE file). */
const rootFiles: readonly string[] = ["LICENSE", "NOTICE"];

/** Files of the package itself that are published when they exist. */
const packageFiles: readonly string[] = ["README.md", "CHANGELOG.md"];

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = path.resolve(".");

  const rootManifest = yield* decodeRoot(
    yield* fs.readFileString(path.join(root, "package.json"))
  );

  const packages = yield* readPackages(root);
  const versions = versionsOf(packages);

  const plan = Arr.map(publicPackages(packages), (workspace) => ({
    workspace,
    ...publishManifest(workspace, rootManifest, versions),
  }));

  const problems = Arr.flatMap(plan, (item) => item.problems);

  if (Arr.isReadonlyArrayNonEmpty(problems)) {
    const message = Arr.join(problems, "\n");

    yield* Effect.logError(message);

    return yield* new ReleaseFailed({ message });
  }

  const stage = Effect.fnUntraced(function* stage(
    item: StagedManifest & { readonly workspace: WorkspacePackage }
  ) {
    const directory = path.join(root, "packages", item.workspace.directory);
    const dist = path.join(directory, publishDirectory);

    const exit = yield* spawner.exitCode(
      ChildProcess.make(
        "vp",
        [
          "pack",
          ...entriesOf(item.workspace.manifest),
          "--dts",
          "--root",
          ".",
          "--no-config",
        ],
        { cwd: directory, stderr: "inherit", stdout: "inherit" }
      )
    );

    if (exit !== 0) {
      return yield* new ReleaseFailed({
        message: `vp pack failed for ${item.workspace.manifest.name} (exit ${exit})`,
      });
    }

    yield* fs.writeFileString(
      path.join(dist, "package.json"),
      `${yield* encodePublished(item.manifest)}\n`
    );

    yield* Effect.forEach(
      rootFiles,
      (name) => fs.copyFile(path.join(root, name), path.join(dist, name)),
      { discard: true }
    );

    yield* Effect.forEach(
      packageFiles,
      Effect.fnUntraced(function* copyWhenPresent(name) {
        if (yield* fs.exists(path.join(directory, name))) {
          yield* fs.copyFile(path.join(directory, name), path.join(dist, name));
        }
      }),
      { discard: true }
    );

    const [{ files }] = yield* decodePackListing(
      yield* spawner.string(
        ChildProcess.make("npm", ["pack", "--dry-run", "--json"], {
          cwd: dist,
        })
      )
    );

    const unexpected = unexpectedFiles(Arr.map(files, (file) => file.path));

    if (Arr.isReadonlyArrayNonEmpty(unexpected)) {
      return yield* new ReleaseFailed({
        message: `${item.workspace.manifest.name} would ship files that are not built output: ${Arr.join(unexpected, ", ")}`,
      });
    }

    return yield* Effect.log(
      `Staged ${item.workspace.manifest.name}@${item.workspace.manifest.version} in ${path.relative(root, dist)} (${files.length} files)`
    );
  });

  return yield* Effect.forEach(plan, stage, { discard: true });
});

NodeRuntime.runMain(
  main.pipe(
    Effect.tapCause(Effect.logError),
    Effect.provide(NodeServices.layer)
  ),
  { disableErrorReporting: true }
);
