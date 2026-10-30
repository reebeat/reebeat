// The SMIL `restart` and `fill` of each verb, declared once per verb as data (`verbArguments` in `grammar.ts`), not per
// effect. The resolver builds only `restart="overlap"` (instances of one effect do not restart each other, a documented
// departure from SMIL's `always`), so a verb that declares another mode fails here; the grammar document and the
// annotation of the Effect construct print what is declared.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Record } from "effect";

import { fillModes, restartModes, verbArguments } from "../src/grammar.ts";
import { grammarDocument } from "../src/grammarDoc.ts";
import { verbs } from "../src/plan.ts";
import {
  firesOf,
  instancesOf,
  scheduledAt,
  statesSource,
} from "./stateStories.ts";

/** The verbs whose declared restart mode the resolver does not build. */
const unbuilt = (
  table: Readonly<Record<string, { readonly restart: string }>>
) =>
  Arr.filter(Record.keys(table), (verb) => table[verb]?.restart !== "overlap");

describe("the SMIL restart and fill of a verb", () => {
  it("has the closed sets of SMIL 3.0 (and the overlap of tsukuri)", () => {
    assert.deepStrictEqual(
      [...restartModes],
      ["always", "whenNotActive", "never", "overlap"]
    );
    assert.deepStrictEqual([...fillModes], ["remove", "freeze"]);
  });

  it("declares, for every verb and nothing else, a restart and a fill from those sets", () => {
    assert.sameMembers(Record.keys(verbArguments), [...verbs]);

    for (const verb of verbs) {
      assert.include(restartModes, verbArguments[verb].restart, verb);
      assert.include(fillModes, verbArguments[verb].fill, verb);
    }
  });

  it("pins the table: every verb overlaps; a show freezes, a focus and a sound remove", () => {
    assert.deepStrictEqual(
      Arr.map(verbs, (verb) => [
        verb,
        verbArguments[verb].restart,
        verbArguments[verb].fill,
      ]),
      [
        ["sound", "overlap", "remove"],
        ["show", "overlap", "freeze"],
        ["focus", "overlap", "remove"],
      ]
    );
  });

  it("builds only overlap: a verb with another restart fails, and the check sees one that does", () => {
    assert.deepStrictEqual(unbuilt(verbArguments), []);
    assert.deepStrictEqual(
      unbuilt({
        ...verbArguments,
        sound: { ...verbArguments.sound, restart: "always" },
      }),
      ["sound"]
    );
  });

  it.effect(
    "builds overlap: two instances of a sound a few frames apart both stay, none cuts the other",
    () =>
      Effect.gen(function* overlapping() {
        const plan = yield* scheduledAt(
          statesSource([
            'r1: show note at word("charlie").end',
            'z1: sound pop at each(word("alpha").start, word("alpha").start +3f)',
          ])
        );

        assert.deepStrictEqual(firesOf(plan, "z1"), [93, 96]);
        assert.deepStrictEqual(
          Arr.map(instancesOf(plan, "z1"), ({ endFrame, endedBy }) => [
            endFrame,
            endedBy,
          ]),
          [
            [null, null],
            [null, null],
          ]
        );
      })
  );

  it("is printed by the grammar document, as a table with both columns and the sets", () => {
    const document = grammarDocument();

    for (const verb of verbs) {
      assert.include(
        document,
        `\`${verb}\` | ${verbArguments[verb].argument} | \`${verbArguments[verb].restart}\` | \`${verbArguments[verb].fill}\` |`
      );
    }

    assert.include(document, "`always`, `whenNotActive`, `never`, `overlap`");
    assert.include(document, "`remove`, `freeze`");
    assert.include(document, "`overlap` is not");
  });
});
