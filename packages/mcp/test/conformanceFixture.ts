// A test-only HTTP server for the MCP conformance suite (spec 0016, F6): the shared server core, `registrations` and
// the live layers of the inspector, behind `McpServer.layerHttp`, plus the tools, resources and prompts the suite's
// scenarios look for by name. It is run as a process by `conformance.test.ts` (it prints `listening <port>` on stdout
// once it accepts connections) and is not shipped: the inspector's own surface is the eight tools alone.
import {
  NodeCrypto,
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { McpServer } from "effect/ai";
import { HttpRouter, HttpServer } from "effect/http";

import { live, roots } from "../src/runtime.ts";
import { protocols, registrations, serverInfo } from "../src/server.ts";
import { conformanceExtras } from "./conformanceExtras.ts";

const main = Effect.gen(function* main() {
  const { checkout, workspace } = yield* roots;
  const server = yield* HttpServer.HttpServer;

  const port = "port" in server.address ? server.address.port : 0;

  // The origins a browser on this port would send; the transport matches an Origin header exactly, port included.
  const core = McpServer.layerHttp({
    ...serverInfo,
    allowedOrigins: [`http://localhost:${port}`, `http://127.0.0.1:${port}`],
    path: "/mcp",
    protocols,
    registrations: Layer.merge(
      Layer.provide(registrations, live(workspace, checkout)),
      conformanceExtras
    ),
  });

  yield* Console.log(`listening ${port}`);

  return yield* Layer.launch(HttpRouter.serve(core));
});

NodeRuntime.runMain(
  Effect.provide(
    main,
    Layer.mergeAll(
      NodeHttpServer.layerTest,
      NodeServices.layer,
      NodeCrypto.layerDigest
    )
  ),
  { disableErrorReporting: true }
);
