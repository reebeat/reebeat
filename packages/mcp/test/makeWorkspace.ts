// Writes the tests' workspace (a project with a real build, a project that does not import, a project with a config,
// a project with no build) into the directory named on the command line, and prints the two paths the server needs.
// `scripts/journey.sh` uses it to give a model session something to read: `bun test/makeWorkspace.ts <directory>`.
import { NodeCrypto, NodeRuntime, NodeServices } from "@effect/platform-node";
import { MediaTools } from "@tsukuri/encode-ffmpeg";
import { Console, Effect, Layer, Stdio } from "effect";

import { buildWorkspaceIn } from "./support.ts";

const main = Effect.gen(function* main() {
  const stdio = yield* Stdio.Stdio;
  const [base] = yield* stdio.args;

  if (base === undefined) {
    return yield* Effect.die("usage: bun test/makeWorkspace.ts <directory>");
  }

  const fixture = yield* buildWorkspaceIn(base);

  yield* Console.log(`TSUKURI_ROOT=${fixture.workspace.root}`);

  return yield* Console.log(`TSUKURI_BUILDS=${fixture.workspace.builds}`);
});

NodeRuntime.runMain(
  Effect.provide(
    main,
    Layer.provideMerge(
      MediaTools.layer,
      Layer.merge(NodeServices.layer, NodeCrypto.layerDigest)
    )
  ),
  { disableErrorReporting: true }
);
