#!/usr/bin/env bun
// The `reebeat` executable, the composition root of the CLI: the platform services (file system, path, child
// processes, crypto) and the arguments from the `Stdio` service. The adapters are chosen per command, from the
// selection (`src/adapters.ts`); nothing here names one.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Stdio } from "effect";

import { run } from "../src/cli.ts";

const main = Effect.gen(function* main() {
  const stdio = yield* Stdio.Stdio;

  yield* run(yield* stdio.args);
});

// The failure is already printed (or is a usage error whose help is shown): the runner only sets the exit code.
NodeRuntime.runMain(Effect.provide(main, NodeServices.layer), {
  disableErrorReporting: true,
});
