#!/usr/bin/env bun
// The `tsukuri-mcp` executable, the composition root of the MCP inspector (spec 0016): the platform services, the
// SHA-256 digest and the workspace from the environment, then the server over stdio. Nothing is written to stdout but
// the protocol's frames.
import { NodeCrypto, NodeRuntime, NodeServices } from "@effect/platform-node";
import { Cause, Effect, Exit, Fiber, Layer, Logger } from "effect";

import { newInputWatch, watchedStdio } from "../src/endOfInput.ts";
import { roots, stdioServer } from "../src/runtime.ts";

const input = newInputWatch();

const main = Effect.gen(function* main() {
  const { checkout, workspace } = yield* roots;

  // EOF interrupts this child after the RPC and stdout queues drain. Signals interrupt the parent awaiting it,
  // so they cannot pass through the EOF normalization, including while child finalizers are running.
  const server = yield* Effect.forkChild(
    Layer.launch(stdioServer(workspace, checkout))
  );

  const exit = yield* Fiber.await(server);

  if (Exit.isSuccess(exit)) {
    return yield* Effect.void;
  }

  if (input.ended && Cause.hasInterruptsOnly(exit.cause)) {
    return yield* Effect.void;
  }

  return yield* Effect.failCause(exit.cause);
});

// stdout carries protocol frames only; diagnostics go to stderr. The default teardown preserves signal status 130.

NodeRuntime.runMain(
  Effect.provide(
    Effect.provideService(main, Logger.LogToStderr, true),
    Layer.provideMerge(
      watchedStdio(input),
      Layer.merge(NodeServices.layer, NodeCrypto.layerDigest)
    )
  ),
  { disableErrorReporting: true }
);
