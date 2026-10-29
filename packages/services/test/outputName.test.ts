// The rule for the base name of a build's files (`--name`): a plain file stem. Each refused name and each accepted
// name is a test, so loosening the pattern or dropping the `..` clause turns one red.
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { requireOutputName } from "../src/outputName.ts";

const run = (name: string) => Effect.runSyncExit(requireOutputName(name));

describe("requireOutputName", () => {
  it("accepts a plain stem", () => {
    for (const name of ["same-id", "a", "v1.2_final", "a-b.c"]) {
      expect(Exit.isSuccess(run(name))).toBe(true);
    }
  });

  it("refuses a name that can leave the output directory or hides", () => {
    for (const name of [
      "",
      "..",
      "../x",
      "a/b",
      "a\\b",
      "/etc/passwd",
      ".hidden",
      "-flag",
      "a b",
      "a..b",
      "x..",
    ]) {
      expect(Exit.isFailure(run(name))).toBe(true);
    }
  });
});
