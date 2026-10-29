// The header of a review record (spec 0010, V5): `check-record.sh`, which `record-round.sh` runs before it posts anything. Each
// case writes a body file in a temporary directory and reads the script's exit code and reason. A review that the author
// records about their own change is not independent, so a pass that lists the author among the reviewers is refused.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";
import { ChildProcess } from "effect/process";

import { scratch, skillScript } from "./skillScripts.ts";

const body = (header: readonly string[]): string =>
  Arr.join([...header, "", "No findings."], "\n");

const all = "Checked: plan, implementation, agreement";

/** The exit code and the stderr of `check-record.sh <verdict> <file>`, as `code:text`. */
const outcome = Effect.fn("outcome")(function* outcome(
  verdict: string,
  text: string
) {
  const { dir, fs, path, spawner } = yield* scratch;
  const file = path.join(dir, "body.md");

  yield* fs.writeFileString(file, text);

  const script = skillScript(path, "review-pr", "check-record.sh");

  return yield* spawner.string(
    ChildProcess.make("bash", [
      "-c",
      'out=$("$0" "$1" "$2" 2>&1); printf "%s:%s" "$?" "$out"',
      script,
      verdict,
      file,
    ])
  );
});

const refused = "65:review record refused: ";

describe("the header of a review record", () => {
  it.effect("a pass by reviewers who are not the author is accepted", () =>
    Effect.gen(function* accepted() {
      assert.strictEqual(
        yield* outcome(
          "pass",
          body(["Author: ana", "Reviewers: ben, Cleo", all])
        ),
        "0:"
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect("negative control: a pass whose reviewers include the author", () =>
    Effect.gen(function* own() {
      assert.strictEqual(
        yield* outcome(
          "pass",
          body(["Author: Ana", "Reviewers: ben, ana", all])
        ),
        `${refused}the author (Ana) is among the reviewers: not independent`
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect(
    "names are compared literally: claude[bot] reviewing its own pass is refused; a.b and axb are two people",
    () =>
      Effect.gen(function* literal() {
        assert.strictEqual(
          yield* outcome(
            "pass",
            body(["Author: claude[bot]", "Reviewers: claude[bot]", all])
          ),
          `${refused}the author (claude[bot]) is among the reviewers: not independent`
        );

        assert.strictEqual(
          yield* outcome("pass", body(["Author: a.b", "Reviewers: axb", all])),
          "0:"
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect("a record that asks for changes may come from anyone", () =>
    Effect.gen(function* changes() {
      assert.strictEqual(
        yield* outcome(
          "changes",
          body(["Author: ana", "Reviewers: ana", "Checked: plan"])
        ),
        "0:"
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );

  it.effect(
    "negative control: a missing line, a unknown part, an unchecked part",
    () =>
      Effect.gen(function* refusals() {
        assert.strictEqual(
          yield* outcome("pass", body(["Reviewers: ben", all])),
          `${refused}line 1 must be "Author: <name>"`
        );

        assert.strictEqual(
          yield* outcome(
            "pass",
            body(["Author: ana", "Reviewers: ben", "Checked: plan, taste"])
          ),
          `${refused}Checked names "taste": use plan, implementation, agreement`
        );

        assert.strictEqual(
          yield* outcome(
            "pass",
            body([
              "Author: ana",
              "Reviewers: ben",
              "Checked: plan, implementation",
            ])
          ),
          `${refused}a pass must check agreement`
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );
});
