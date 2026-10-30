#!/usr/bin/env bun
// The `tsukuri-mcp` executable, the composition root of the MCP inspector (spec 0016): the platform services, the
// SHA-256 digest and the workspace from the environment, then the server over stdio. Nothing is written to stdout but
// the protocol's frames.
import { NodeCrypto, NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer, Logger } from "effect";

import { roots, stdioServer } from "../src/runtime.ts";

const main = Effect.gen(function* main() {
  const { checkout, workspace } = yield* roots;

  return yield* Layer.launch(stdioServer(workspace, checkout));
});

// stdout carries the protocol's frames and nothing else, so the logger writes to stderr.
NodeRuntime.runMain(
  Effect.provide(
    Effect.provideService(main, Logger.LogToStderr, true),
    Layer.merge(NodeServices.layer, NodeCrypto.layerDigest)
  ),
  { disableErrorReporting: true }
);
