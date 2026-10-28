#!/usr/bin/env bun
// The `reebeat` executable, one of the two composition roots of the CLI (the other is `scripts/journey.ts`). The
// arguments come from the `Stdio` service.
import { NodeRuntime } from "@effect/platform-node";
import { Effect, Stdio } from "effect";

import { run } from "../src/cli.ts";
import { cliServices } from "./services.ts";

const main = Effect.gen(function* main() {
  const stdio = yield* Stdio.Stdio;

  yield* run(yield* stdio.args);
});

// The failure is already printed (or is a usage error whose help is shown): the runner only sets the exit code.
NodeRuntime.runMain(Effect.provide(main, cliServices), {
  disableErrorReporting: true,
});
