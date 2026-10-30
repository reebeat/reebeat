// The id of a Line (spec 0004, step 2): `<scene id>.l<position>`, derived from where the Line is, never stored. One
// function, `lineIdOf`, makes it; `placedLines` and `planLines` put it on the Lines of a Plan, `timedLines` on those of
// a Timeline. A hand-written IR or Plan that still carries an `id` on a Line is refused: both schemas are closed.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Result, String as Str } from "effect";

import { buildPlan, fountainImporter } from "../src/build.ts";
import { jsonCodec } from "../src/graph.ts";
import { lineIdOf, placedLines, planLines } from "../src/lines.ts";
import { decodePlan, encodePlan } from "../src/plan.ts";
import { asText, fixtureSha256, readFixture } from "./support.ts";

/** Four Scenes; `sc4` has three Lines. */
const story = asText([
  "Title: Lines",
  "",
  "# Part",
  "",
  "INT. ONE #sc1#",
  "",
  "Box {id=a cell=tl class=box}",
  "",
  "NARRATOR",
  "One.",
  "",
  "INT. TWO #sc2#",
  "",
  "Box {id=a cell=br class=box}",
  "",
  "NARRATOR",
  "Two.",
  "",
  "INT. THREE #sc3#",
  "",
  "Box {id=a cell=tr class=box}",
  "",
  "NARRATOR",
  "Three.",
  "",
  "INT. FOUR #sc4#",
  "",
  "Box {id=a cell=bl class=box}",
  "",
  "NARRATOR",
  "Four, first.",
  "",
  "NARRATOR",
  "Four, second.",
  "",
  "NARRATOR",
  "Four, third.",
  "",
]);

describe("the id of a Line", () => {
  it("is the Scene id, `.l`, and the 1-based position", () => {
    assert.strictEqual(lineIdOf("sc4", 3), "sc4.l3");
    assert.strictEqual(lineIdOf("opening", 1), "opening.l1");
  });

  it.effect("of the 3rd Line of sc4 is sc4.l3, derived from the Plan", () =>
    Effect.gen(function* third() {
      const plan = yield* buildPlan(story, fixtureSha256);
      const sc4 = Arr.findFirst(plan.scenes, (scene) => scene.id === "sc4");

      assert.isTrue(Option.isSome(sc4));

      const placed = Option.match(sc4, {
        onNone: () => [],
        onSome: placedLines,
      });

      assert.deepStrictEqual(
        Arr.map(placed, ({ id }) => id),
        ["sc4.l1", "sc4.l2", "sc4.l3"]
      );
      assert.strictEqual(placed[2]?.line.text, "Four, third.");
      assert.strictEqual(placed[2]?.position, 3);
      assert.deepStrictEqual(
        Arr.map(planLines(plan), ({ id }) => id),
        ["sc1.l1", "sc2.l1", "sc3.l1", "sc4.l1", "sc4.l2", "sc4.l3"]
      );
    })
  );

  it.effect("is stored nowhere: a Plan holds no `id` on a Line", () =>
    Effect.gen(function* stored() {
      const plan = yield* buildPlan(story, fixtureSha256);
      const text = yield* encodePlan(plan);

      assert.notInclude(text, "sc4.l3");
      assert.notInclude(text, ".l1");
    })
  );

  it.effect("is refused on a Line of a hand-written Plan (closed schema)", () =>
    Effect.gen(function* excess() {
      const text = yield* encodePlan(
        yield* buildPlan(yield* readFixture("boxes.fountain"), fixtureSha256)
      );

      const withId = Str.replace(
        '"hints":',
        '"id": "opening.l1", "hints":'
      )(text);

      assert.notStrictEqual(withId, text);

      const error = yield* Effect.flip(decodePlan(withId));

      assert.strictEqual(error._tag, "SchemaError");
      assert.include(error.message, "id");
    })
  );

  it.effect("is refused on a Line of a hand-written IR (closed schema)", () =>
    Effect.gen(function* excess() {
      const graph = yield* Effect.fromResult(
        Result.mapError(fountainImporter.import(story), Arr.headNonEmpty)
      );

      const text = yield* Effect.fromResult(jsonCodec.encode(graph));
      const withId = Str.replace('"hints":', '"id": "sc1.l1", "hints":')(text);

      assert.notStrictEqual(withId, text);

      const decoded = jsonCodec.decode(withId);

      assert.isTrue(Result.isFailure(decoded));
      assert.include(
        Result.isFailure(decoded) ? decoded.failure.message : "",
        "id"
      );
    })
  );
});
