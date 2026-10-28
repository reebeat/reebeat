// `reebeat check`: it refuses a directory that is not a finished build before any check runs (F12: a build that
// failed or was interrupted leaves no `build.json`), prints one row per verdict, and exits non-zero when any
// verdict fails. The verdicts themselves are `@reebeat/verify`'s; here they are fakes.
import { assert, layer } from "@effect/vitest";
import { Effect, Exit, FileSystem, Path } from "effect";

import { writeManifest } from "../src/manifest.ts";
import type { Verdict } from "../src/verify.ts";
import {
  fakeVerifier,
  platform,
  runCli,
  storyFile,
  tempDirectory,
  verdict,
  writeText,
} from "./support.ts";

const check = (
  dir: string,
  source: string,
  verdicts: readonly Verdict[],
  calls: string[]
) =>
  runCli(["check", dir, "--source", source], {
    verifier: fakeVerifier(verdicts, verdict("F6", true), calls),
  });

const aBuild = Effect.gen(function* build() {
  const dir = yield* tempDirectory;

  yield* writeText(dir, "plan.json", "{}");
  yield* writeText(dir, "deck.html", "<html></html>");
  yield* writeManifest(dir, { path: "story.fountain", sha256: "0".repeat(64) });

  return dir;
});

/** `check` of `dir` fails with `NotABuild` (the message matches `message`), and no check ran. */
const assertRefused = (dir: string, message: RegExp) =>
  Effect.gen(function* refused() {
    const calls: string[] = [];
    const story = yield* storyFile();

    const { exit, stderr, stdout } = yield* check(
      dir,
      story,
      [verdict("F1", true)],
      calls
    );

    assert.isTrue(Exit.isFailure(exit));
    assert.strictEqual(stdout, "");
    assert.match(stderr, message);
    assert.deepStrictEqual(calls, []);
  });

layer(platform)("reebeat check", (it) => {
  it.effect(
    "refuses a directory with no build.json, names it, and runs no check",
    () =>
      Effect.gen(function* missing() {
        const dir = yield* tempDirectory;

        yield* writeText(dir, "deck.html", "<html></html>");
        yield* assertRefused(dir, /^NotABuild: .*build\.json does not exist/u);
      })
  );

  it.effect("refuses a build.json that is not a manifest", () =>
    Effect.gen(function* garbled() {
      const dir = yield* tempDirectory;

      yield* writeText(dir, "build.json", '{ "schema": 2 }');
      yield* assertRefused(dir, /^NotABuild: .*is not a build manifest/u);
    })
  );

  it.effect("refuses a build.json that lists a file that is not there", () =>
    Effect.gen(function* lost() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* aBuild;

      yield* fs.remove(path.join(dir, "deck.html"));
      yield* assertRefused(
        dir,
        /^NotABuild: .*lists deck\.html, which is missing/u
      );
    })
  );

  it.effect(
    "prints one row per verdict and exits 0 when every verdict is ok",
    () =>
      Effect.gen(function* passing() {
        const calls: string[] = [];
        const dir = yield* aBuild;
        const story = yield* storyFile();

        const { exit, stdout } = yield* check(
          dir,
          story,
          [
            verdict("F1", true, "all cues within a frame"),
            verdict("F2", true, "12 cues"),
          ],
          calls
        );

        assert.isTrue(Exit.isSuccess(exit));
        assert.match(
          stdout,
          /F1 +ok +all cues within a frame\nF2 +ok +12 cues/u
        );
        assert.deepStrictEqual(calls, [`check ${dir} ${story}`]);
      })
  );

  it.effect(
    "exits non-zero when one verdict fails, and names the falsifier",
    () =>
      Effect.gen(function* failing() {
        const dir = yield* aBuild;
        const story = yield* storyFile();

        const { exit, stderr, stdout } = yield* check(
          dir,
          story,
          [verdict("F1", true), verdict("F2", false, "Line sc1.l1 differs")],
          []
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stdout, /F2 +FAIL +Line sc1\.l1 differs/u);
        assert.strictEqual(stderr, "ChecksFailed: 1 of 2 checks failed: F2");
      })
  );

  it.effect("needs --source: a usage error, no check runs", () =>
    Effect.gen(function* usage() {
      const calls: string[] = [];
      const dir = yield* aBuild;

      const { exit, stderr } = yield* runCli(["check", dir], {
        verifier: fakeVerifier([], verdict("F6", true), calls),
      });

      assert.isTrue(Exit.isFailure(exit));
      assert.include(stderr, "Missing required flag: --source");
      assert.deepStrictEqual(calls, []);
    })
  );
});
