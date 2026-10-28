// `bun run journey`: builds stories/same-id into build/same-id, checks it, builds it again into build/same-id-2 and
// compares the two builds (F6). The second composition root of the CLI.
import { NodeRuntime } from "@effect/platform-node";
import { speechCacheOnly } from "@reebeat/speech";
import { Effect, Path } from "effect";

import { journey } from "../src/journey.ts";
import { reportFailure } from "../src/report.ts";
import { cliServices } from "./services.ts";

const program = Effect.gen(function* run() {
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));
  const story = path.join(root, "stories", "same-id", "story.fountain");
  const cacheDir = path.join(root, "stories", "same-id", "speech-cache");

  return yield* Effect.provide(
    journey({ cacheDir, outRoot: path.join(root, "build"), story }),
    speechCacheOnly(cacheDir)
  );
});

// The failure is printed once, here; the runner only sets the exit code.
NodeRuntime.runMain(
  Effect.provide(program, cliServices).pipe(Effect.tapError(reportFailure)),
  { disableErrorReporting: true }
);
