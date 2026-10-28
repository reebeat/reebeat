// The command line: what parses, what is a usage error, and that a usage error exits non-zero before any program
// runs. The programs behind the commands are tested in `plan`, `build`, `check`, `journey` and `selection`.
import { assert, layer } from "@effect/vitest";
import { Effect, Exit, FileSystem, Path } from "effect";

import { version } from "../src/version.ts";
import {
  fakeVerifier,
  platform,
  runCli,
  storyFile,
  verdict,
} from "./support.ts";

layer(platform)("the reebeat command line", (it) => {
  it.effect("--help lists the four commands and exits 0", () =>
    Effect.gen(function* help() {
      const { exit, stdout } = yield* runCli(["--help"]);

      assert.isTrue(Exit.isSuccess(exit));

      for (const command of ["plan", "build", "check", "journey"]) {
        assert.match(stdout, new RegExp(`^ {2}${command} `, "mu"));
      }
    })
  );

  it.effect("build --help names a flag per service of the selection", () =>
    Effect.gen(function* flags() {
      const { exit, stdout } = yield* runCli(["build", "--help"]);

      assert.isTrue(Exit.isSuccess(exit));

      for (const flag of [
        "--speech",
        "--aligner",
        "--sounds",
        "--renderer",
        "--capturer",
        "--encoder",
        "--cache",
        "--cache-dir",
      ]) {
        assert.include(stdout, flag);
      }
    })
  );

  it.effect("--version prints the version of the package manifest", () =>
    Effect.gen(function* versioned() {
      const { exit, stdout } = yield* runCli(["--version"]);

      assert.isTrue(Exit.isSuccess(exit));
      assert.include(stdout, version);
    })
  );

  it.effect.each([
    { args: () => [], why: "no command" },
    { args: () => ["frobnicate"], why: "an unknown command" },
    { args: () => ["plan"], why: "plan without a story" },
    {
      args: (story: string) => ["plan", story, "--nope"],
      why: "an unknown flag",
    },
    { args: (story: string) => ["build", story], why: "build without --out" },
    {
      args: (story: string, out: string) => [
        "build",
        story,
        "--out",
        out,
        "--capture-timeout",
        "0",
      ],
      why: "a capture timeout of 0",
    },
    {
      args: (story: string, out: string) => [
        "build",
        story,
        "--out",
        out,
        "--capture-timeout",
        "soon",
      ],
      why: "a capture timeout that is no number",
    },
    {
      args: (_story: string, out: string) => ["check", out],
      why: "check without --source",
    },
    { args: () => ["journey"], why: "journey without a story" },
  ])("$why is a usage error: non-zero exit, nothing is built", ({ args }) =>
    Effect.gen(function* usage() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const story = yield* storyFile();
      const out = path.join(path.dirname(story), "o");
      const calls: string[] = [];

      const { exit } = yield* runCli(args(story, out), {
        verifier: fakeVerifier([], verdict("F6", "pass"), calls),
      });

      assert.isTrue(Exit.isFailure(exit));
      assert.isFalse(yield* fs.exists(out));
      assert.deepStrictEqual(calls, []);
    })
  );
});
