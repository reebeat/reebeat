// The live composition of the inspector (spec 0016): the confined file-system `Projects`, the ffmpeg `Observer` and the
// documents of the checkout, behind one `McpServer`. `tsukuri-mcp` runs it over stdio; the tests run the same layers
// over an in-memory client and an HTTP fixture.
import { MediaTools } from "@tsukuri/encode-ffmpeg";
import { Config, Effect, Layer, Path } from "effect";
import type { FileSystem } from "effect";
import { McpServer } from "effect/ai";
import type { Digest } from "effect/crypto";
import type { ChildProcessSpawner } from "effect/process";

import { fileDocs } from "./docs.ts";
import { ffmpegObserver } from "./observerFfmpeg.ts";
import { fileProjects } from "./projectsFs.ts";
import type { Workspace } from "./projectsFs.ts";
import { protocols, registrations, serverInfo } from "./server.ts";

/** The services the live layers read from the platform. */
export type Platform =
  | ChildProcessSpawner.ChildProcessSpawner
  | Digest.Digest
  | FileSystem.FileSystem
  | Path.Path;

/** The layers every tool reads: projects, observer and documents. */
export const live = (
  workspace: Workspace,
  checkout: string
): Layer.Layer<
  | Layer.Success<ReturnType<typeof fileDocs>>
  | Layer.Success<typeof ffmpegObserver>
  | Layer.Success<ReturnType<typeof fileProjects>>,
  never,
  Platform
> =>
  Layer.mergeAll(
    fileProjects(workspace),
    fileDocs(checkout),
    Layer.provide(ffmpegObserver, MediaTools.layer)
  );

/** The workspace and the checkout from the environment: `TSUKURI_ROOT` (default: the checkout) and `TSUKURI_BUILDS` (default: `<root>/build`). */
const workspaceConfig = (checkout: string) =>
  Effect.gen(function* workspace() {
    const path = yield* Path.Path;

    const root = yield* Config.String("TSUKURI_ROOT").pipe(
      Config.withDefault(checkout)
    );

    const builds = yield* Config.String("TSUKURI_BUILDS").pipe(
      Config.withDefault(path.join(root, "build"))
    );

    return { builds, root } satisfies Workspace;
  });

/** The checkout this package is in (three directories up from here and from `bin/`) and the workspace it reads. */
export const roots = Effect.gen(function* rootsOf() {
  const path = yield* Path.Path;
  const checkout = path.resolve(import.meta.dirname, "..", "..", "..");

  return { checkout, workspace: yield* workspaceConfig(checkout) };
});

/** The server over stdio: the platform's `Stdio` carries the JSON-RPC frames. */
export const stdioServer = (workspace: Workspace, checkout: string) =>
  McpServer.layerStdio({
    ...serverInfo,
    protocols,
    registrations: Layer.provide(registrations, live(workspace, checkout)),
  });
