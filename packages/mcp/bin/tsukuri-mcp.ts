#!/usr/bin/env bun
// The `tsukuri-mcp` executable, the composition root of the MCP inspector (spec 0016): the platform services, the
// SHA-256 digest and the workspace from the environment, then the server over stdio. Nothing is written to stdout but
// the protocol's frames.
import { NodeCrypto, NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Logger } from "effect";

import {
  newInputWatch,
  teardownAfter,
  watchedStdio,
} from "../src/endOfInput.ts";
import { roots, stdioServer } from "../src/runtime.ts";

const main = Effect.gen(function* main() {
  const { checkout, workspace } = yield* roots;

  return yield* Layer.launch(stdioServer(workspace, checkout));
});

// stdout carries the protocol's frames and nothing else, so the logger writes to stderr. A client ends the session by
// closing stdin: that is a clean exit (0), not the interrupt (130) Effect's transport reports it as.
const input = newInputWatch();

NodeRuntime.runMain(
  Effect.provide(
    Effect.provideService(main, Logger.LogToStderr, true),
    Layer.provideMerge(
      watchedStdio(input),
      Layer.merge(NodeServices.layer, NodeCrypto.layerDigest)
    )
  ),
  { disableErrorReporting: true, teardown: teardownAfter(input) }
);
