// F8 reads each Line's narration from the speech cache the check is pointed at. A cache that is not there (the wrong
// directory, or one without the Line's file) is a failure of its own, the one a person can act on: it says the cache is
// missing, names the directory looked in and the flag that points elsewhere, and is not an ffmpeg exit code. The intact
// cache still passes, so the rule is the difference, not a blanket failure.
import { assert, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { runChecks } from "../src/index.ts";
import { Fixture, narrationFile, verdictOf } from "./support.ts";

layer(Fixture.layer, { excludeTestServices: true, timeout: "300 seconds" })(
  "F8 and a speech cache that is not there",
  (it) => {
    it.effect(
      "a directory that is not the cache, and a cache without a Line's file, fail F8 naming the directory and --cache-dir; the intact cache passes",
      () =>
        Effect.gen(function* missingCache() {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const fixture = yield* Fixture;
          const nowhere = path.join(fixture.root, "no-such-cache");
          const emptied = path.join(fixture.root, "emptied-cache");

          yield* fs.copy(fixture.cacheDir, emptied);
          yield* fs.remove(
            path.join(emptied, path.basename(narrationFile(fixture, "sc1.l1")))
          );

          const check = (cacheDir: string) =>
            Effect.map(
              runChecks({
                buildDir: fixture.build,
                cacheDir,
                sourcePath: fixture.sourcePath,
              }),
              (verdicts) => verdictOf(verdicts, "F8")
            );

          const intact = yield* check(fixture.cacheDir);

          assert.strictEqual(intact.status, "pass");

          for (const dir of [nowhere, emptied]) {
            const verdict = yield* check(dir);

            assert.strictEqual(verdict.status, "fail");
            assert.include(verdict.detail, dir);
            assert.include(verdict.detail, "--cache-dir");
            assert.notInclude(verdict.detail, "ffmpeg exited");
          }
        })
    );
  }
);
