#!/usr/bin/env bun
// Writes every generated file of the inspector (spec 0016): the client install files under `packages/mcp/clients/`
// and the surface lock `packages/mcp/tools.lock.json`, from `@tsukuri/lifecycle`. Run it from the repository root after
// a change to a tool, the distribution or the skill: `bun run --cwd packages/mcp generate`. The tests regenerate the same
// text in memory and fail when a committed file differs.
import { NodeCrypto, NodeRuntime, NodeServices } from "@effect/platform-node";
import { tools } from "@tsukuri/lifecycle";
import { Array as Arr, Effect, FileSystem, Layer, Path } from "effect";

import { clientFiles } from "../src/clients.ts";
import { lockOf, lockText } from "../src/lock.ts";
import { toolOf } from "../src/server.ts";

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packageRoot = path.resolve(import.meta.dirname, "..");

  const skill = yield* fs.readFileString(
    path.join(
      packageRoot,
      "..",
      "lifecycle",
      "skills",
      "tsukuri-lifecycle",
      "SKILL.md"
    )
  );

  const lock = yield* lockOf(Arr.map(tools, toolOf));

  const files = [
    ...Arr.map(clientFiles(skill), (file) => ({
      path: path.join(packageRoot, "clients", file.path),
      text: file.text,
    })),
    { path: path.join(packageRoot, "tools.lock.json"), text: lockText(lock) },
  ];

  yield* fs.remove(path.join(packageRoot, "clients"), {
    force: true,
    recursive: true,
  });

  for (const file of files) {
    yield* fs.makeDirectory(path.dirname(file.path), { recursive: true });
    yield* fs.writeFileString(file.path, file.text);
  }

  return yield* Effect.log(`Wrote ${files.length} files under ${packageRoot}.`);
});

NodeRuntime.runMain(
  Effect.provide(main, Layer.merge(NodeServices.layer, NodeCrypto.layerDigest)),
  {
    disableErrorReporting: true,
  }
);
