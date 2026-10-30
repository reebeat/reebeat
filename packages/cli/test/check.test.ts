// `tsukuri check`: it refuses a directory that is not a finished build before any check runs (F12: a build that
// failed or was interrupted leaves no `build.json`), prints one row per verdict, and exits non-zero when any
// verdict fails; a not-applicable verdict is printed and does not fail. The verdicts themselves are
// `@tsukuri/verify`'s; here they are fakes.
import { assert, layer } from "@effect/vitest";
import { writeManifest } from "@tsukuri/pipeline";
import { Effect, Exit, FileSystem, Path, String as Str } from "effect";

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
    verifier: fakeVerifier(verdicts, verdict("F6", "pass"), calls),
  });

const aBuild = Effect.gen(function* build() {
  const dir = yield* tempDirectory;

  yield* writeText(dir, "plan.json", "{}");
  yield* writeText(dir, "deck.html", "<html></html>");
  yield* writeManifest(dir, {
    adapters: [],
    assets: [],
    source: { path: "story.fountain", sha256: Str.repeat(64)("0") },
  });

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
      [verdict("F1", "pass")],
      calls
    );

    assert.isTrue(Exit.isFailure(exit));
    assert.strictEqual(stdout, "");
    assert.match(stderr, message);
    assert.deepStrictEqual(calls, []);
  });

layer(platform)("tsukuri check", (it) => {
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

      yield* writeText(dir, "build.json", '{ "schema": 1 }');
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
    "prints one row per verdict and exits 0 when no verdict fails",
    () =>
      Effect.gen(function* passing() {
        const calls: string[] = [];
        const dir = yield* aBuild;
        const story = yield* storyFile();

        const { exit, stdout } = yield* check(
          dir,
          story,
          [
            verdict("F1", "pass", "all cues within a frame"),
            verdict("F2", "pass", "12 cues"),
          ],
          calls
        );

        assert.isTrue(Exit.isSuccess(exit));
        assert.match(
          stdout,
          /F1 +PASS +all cues within a frame\nF2 +PASS +12 cues\n2 of 2 falsifiers hold/u
        );
        assert.deepStrictEqual(calls, [`check ${dir} ${story}`]);
      })
  );

  it.effect("prints a not-applicable verdict as N/A and still exits 0", () =>
    Effect.gen(function* skipped() {
      const dir = yield* aBuild;
      const story = yield* storyFile();

      const { exit, stdout } = yield* check(
        dir,
        story,
        [
          verdict("F1", "pass"),
          verdict("F8", "na", "N/A (silent stand-in): the narrator is silent"),
        ],
        []
      );

      assert.isTrue(Exit.isSuccess(exit));
      assert.match(stdout, /F8 +N\/A +N\/A \(silent stand-in\)/u);
      assert.include(stdout, "1 of 2 falsifiers hold; not applicable: F8");
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
          [verdict("F1", "pass"), verdict("F2", "fail", "Line sc1.l1 differs")],
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
        verifier: fakeVerifier([], verdict("F6", "pass"), calls),
      });

      assert.isTrue(Exit.isFailure(exit));
      assert.include(stderr, "Missing required flag: --source");
      assert.deepStrictEqual(calls, []);
    })
  );
});
