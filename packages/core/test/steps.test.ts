// How a Rendering carries a Scene's effects (spec 0002, Revisions): `show` and `focus` are fragment steps in
// resolved-time order, a sound rides along with the step or the slide it is anchored to, or plays alone.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { buildPlan } from "../src/build.ts";
import type { PlanJson, Scene } from "../src/plan.ts";
import { schedule } from "../src/schedule.ts";
import { soundsOf, stepsOf } from "../src/steps.ts";
import { asText, evenlySpoken, fixtureSha256, lifecycle } from "./support.ts";

const source = asText([
  "Title: Steps",
  "",
  "# Part",
  "",
  "INT. ONE #one#",
  "",
  "Mover {id=m cell=ml class=box}",
  "Late {id=late cell=br class=label visible=false}",
  "Later {id=later cell=bc class=label visible=false}",
  "",
  "[[effects",
  '  r2: show later at word("six").end',
  '  r1: show late at word("two").end',
  '  f1: focus m at word("three").end',
  "  a1: sound pop at late.enter.end",
  '  a2: sound ding at word("five").end',
  "  a3: sound pop at f1.start",
  "  a4: sound whoosh at scene.start",
  "  a5: sound pop at scene.end",
  '  a6: sound ding at 0.1s because "before any step"',
  "]]",
  "",
  "NARRATOR",
  "One two three four five six seven eight nine ten eleven twelve.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. TWO #two#",
  "",
  "Mover {id=m cell=mr class=box}",
  "Fresh {id=fresh cell=tc class=title}",
  "",
  "[[effects",
  "  b1: sound whoosh at transition.start",
  "  b2: sound pop at m.move.end",
  "  b3: sound ding at fresh.enter.start",
  "  b4: sound pop at b1.start +1f",
  "]]",
  "",
  "NARRATOR",
  "Nothing is revealed here.",
  "",
]);

const timed = Effect.gen(function* built() {
  const plan = yield* buildPlan(source, fixtureSha256);

  // 300 ms a word: One 0-9 f, two 9-18, ... each word ends at 9 * n frames after the line start (45).
  return yield* schedule(plan, evenlySpoken(plan, 300), lifecycle);
});

/** The Scene at `index` of a Plan the test built. */
const sceneOf = (plan: PlanJson, index: number): Scene => {
  const scene = plan.scenes[index];

  if (scene === undefined) {
    return assert.fail(`the Plan has no Scene ${index}`);
  }

  return scene;
};

describe("stepsOf", () => {
  it.effect("lists show and focus in resolved-time order, and no sound", () =>
    Effect.gen(function* steps() {
      const plan = yield* timed;
      const scene = sceneOf(plan, 0);

      // Written order r2, r1, f1; resolved: r1 at "two" end, f1 at "three" end, r2 at "six" end.
      assert.deepStrictEqual(
        Arr.map(stepsOf(plan, scene), ({ effect }) => effect.id),
        ["r1", "f1", "r2"]
      );
    })
  );

  it.effect("keeps the written order when the Plan has no timeline", () =>
    Effect.gen(function* untimed() {
      const plan = yield* buildPlan(source, fixtureSha256);
      const scene = sceneOf(plan, 0);

      assert.deepStrictEqual(
        Arr.map(stepsOf(plan, scene), ({ effect }) => effect.id),
        ["r2", "r1", "f1"]
      );
    })
  );

  it.effect("is empty for a Scene with no show and no focus", () =>
    Effect.gen(function* none() {
      const plan = yield* timed;

      assert.deepStrictEqual(stepsOf(plan, sceneOf(plan, 1)), []);
    })
  );
});

describe("soundsOf", () => {
  it.effect(
    "puts each sound on the step, the slide or nothing it is anchored to",
    () =>
      Effect.gen(function* carriers() {
        const plan = yield* timed;

        const first = Arr.map(
          soundsOf(plan, sceneOf(plan, 0)),
          ({ carrier, effect }) => [effect.id, carrier]
        );

        assert.deepStrictEqual(first, [
          // late.enter.end: the Element the show effect r1 reveals enters with that step.
          ["a1", { effectId: "r1", kind: "step" }],
          // word("five").end: the nearest step at or before it in time is f1 (word "three").
          ["a2", { effectId: "f1", kind: "step" }],
          // f1.start: another effect's start: the step of that effect.
          ["a3", { effectId: "f1", kind: "step" }],
          // scene.start: the slide change.
          ["a4", { kind: "slide" }],
          // scene.end: after every step, so the last one, r2.
          ["a5", { effectId: "r2", kind: "step" }],
          // an absolute time before any step: alone.
          ["a6", { kind: "alone" }],
        ]);

        const second = Arr.map(
          soundsOf(plan, sceneOf(plan, 1)),
          ({ carrier, effect }) => [effect.id, carrier]
        );

        assert.deepStrictEqual(second, [
          ["b1", { kind: "slide" }],
          ["b2", { kind: "slide" }],
          ["b3", { kind: "slide" }],
          // b1.start: a sound anchored to a sound plays where that sound plays.
          ["b4", { kind: "slide" }],
        ]);
      })
  );
});

const durations = asText([
  "Title: Durations",
  "",
  "# Part",
  "",
  "INT. ONE #one#",
  "",
  "Mover {id=m cell=ml class=box}",
  "Late {id=late cell=br class=label visible=false}",
  "",
  "[[effects",
  '  r1: show late at word("two").end',
  '  f1: focus m at word("three").end until word("six").start',
  '  s1: sound pop at each(word("four").end, word("eight").end)',
  '  f2: focus m at word("ten").end',
  "  let both = last(r1.end, f1.end)",
  "  s2: sound ding at both",
  "]]",
  "",
  "NARRATOR",
  "One two three four five six seven eight nine ten eleven twelve.",
  "",
]);

// 300 ms a word at 30 fps: the Line starts at frame 30 and word n ends at 30 + 9 n; `six` starts at 30 + 9 * 5 = 75.
const timedDurations = Effect.gen(function* built() {
  const plan = yield* buildPlan(durations, fixtureSha256);

  return yield* schedule(plan, evenlySpoken(plan, 300), lifecycle);
});

describe("a focus that ends by its own until", () => {
  it.effect(
    "has an end step, in resolved-time order; a focus with no until has none (the slide change ends its ring)",
    () =>
      Effect.gen(function* ends() {
        const plan = yield* timedDurations;

        assert.deepStrictEqual(
          Arr.map(stepsOf(plan, sceneOf(plan, 0)), (step) => [
            step.effect.id,
            step.edge,
          ]),
          [
            ["r1", "start"],
            ["f1", "start"],
            ["f1", "end"],
            ["f2", "start"],
          ]
        );
      })
  );

  it.effect("is commanded off one frame before the ring's last frame", () =>
    Effect.gen(function* commands() {
      const plan = yield* timedDurations;

      const found = Arr.map(
        plan.timeline?.scenes[0]?.effects ?? [],
        (entry) => [
          entry.effectId,
          entry.instance,
          entry.fireFrame,
          entry.endFrame,
          entry.endedBy,
          entry.endCommandFrame,
        ]
      );

      assert.deepStrictEqual(found, [
        ["r1", 1, 48, 52, "window", null],
        ["f1", 1, 57, 75, "until", 74],
        ["s1", 1, 66, null, null, null],
        ["s2", 1, 75, null, null, null],
        ["s1", 2, 102, null, null, null],
        // f2 has no until: its ring lasts to the Scene's last frame, where the slide change interrupts it.
        ["f2", 1, 120, 152, "slide-change", null],
      ]);
    })
  );

  it.effect(
    "gives one carried sound for each instance of a sound, and a sound at the end of a focus rides the step before it",
    () =>
      Effect.gen(function* instances() {
        const plan = yield* timedDurations;

        assert.deepStrictEqual(
          Arr.map(
            soundsOf(plan, sceneOf(plan, 0)),
            ({ carrier, effect, timed: entry }) => [
              effect.id,
              entry?.instance,
              carrier,
            ]
          ),
          [
            ["s1", 1, { effectId: "f1", kind: "step" }],
            ["s1", 2, { effectId: "f1", kind: "step" }],
            ["s2", 1, { effectId: "f1", kind: "step" }],
          ]
        );
      })
  );
});
