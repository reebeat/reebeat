// renderDeck is pure and follows the Deck page contract of spec 0001. These tests read the generated page back with
// readDeck and with plain string checks, so they need no browser.
import { assert, describe, it } from "@effect/vitest";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, Option, Order, String as Str } from "effect";

import { readDeck, renderDeck } from "../src/index.ts";
import {
  asText,
  carrySource,
  fixtureSha256,
  planOf,
  ringSource,
  scheduledOf,
  scheduledStory,
  storyPlan,
} from "./support.ts";

const chainSource = asText([
  "# One",
  "",
  "INT. A - DAY #s1#",
  "",
  "Alpha {id=a cell=ml class=box}",
  "",
  "NARRATOR",
  "First.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. B - DAY #s2#",
  "",
  "Alpha {id=a cell=mr class=box}",
  "",
  "NARRATOR",
  "Second.",
  "",
  "INT. C - DAY #s3#",
  "",
  "Alpha {id=a cell=mc class=box}",
  "",
  "NARRATOR",
  "Third.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. D - DAY #s4#",
  "",
  "Alpha {id=a cell=bl class=box}",
  "",
  "NARRATOR",
  "Fourth.",
  "",
  "> CUT",
  "",
  "INT. E - DAY #s5#",
  "",
  "Alpha {id=a cell=tl class=box}",
  "",
  "NARRATOR",
  "Fifth.",
]);

/** The text of `assets/deck.js` that renderDeck generates for a Plan. */
const deckScript = (plan: PlanJson): string =>
  Option.match(
    Arr.findFirst(
      renderDeck(plan).files,
      ({ path }) => path === "assets/deck.js"
    ),
    { onNone: () => "", onSome: ({ text }) => text }
  );

/** The item at `index`, or undefined: a test reads a slide by its place without indexing. */
const nth = <A>(items: readonly A[], index: number): A | undefined =>
  Option.getOrUndefined(Arr.get(items, index));

describe("renderDeck", () => {
  it.effect("is a pure function: the same Plan gives the same bytes", () =>
    Effect.gen(function* twice() {
      const plan = yield* storyPlan;

      assert.deepStrictEqual(renderDeck(plan), renderDeck(plan));
    })
  );

  it.effect(
    "writes the contract's page: hash, one flat section per Scene, notes, fragments",
    () =>
      Effect.gen(function* contract() {
        const plan = yield* storyPlan;
        const { html } = renderDeck(plan);
        const model = readDeck(html);

        assert.include(
          html,
          `<html lang="en" data-source-sha256="${fixtureSha256}">`
        );
        assert.include(
          html,
          `<meta name="reebeat:source-sha256" content="${fixtureSha256}">`
        );
        assert.strictEqual(model.htmlSourceSha256, fixtureSha256);
        assert.strictEqual(model.metaSourceSha256, fixtureSha256);
        assert.deepStrictEqual(
          Arr.map(model.slides, (slide) => slide.sceneId),
          Arr.map(plan.scenes, (scene) => scene.id)
        );
        assert.deepStrictEqual(
          Arr.map(model.slides, (slide) => slide.chapterId),
          Arr.map(plan.scenes, (scene) => scene.chapterId)
        );

        // Flat: every section is a direct child of `.slides`, none inside another section.
        assert.strictEqual(
          Arr.fromIterable(Str.matchAll(/<section /gu)(html)).length,
          plan.scenes.length
        );
        assert.strictEqual(
          Arr.fromIterable(Str.matchAll(/<aside class="notes">/gu)(html))
            .length,
          plan.scenes.length
        );

        for (const [index, scene] of plan.scenes.entries()) {
          const slide = model.slides[index];

          assert.deepStrictEqual(
            slide?.notes,
            Arr.map(scene.lines, (line) => line.text)
          );
          assert.deepStrictEqual(
            Arr.map(slide?.fragments ?? [], (fragment) => fragment.effectId),
            Arr.map(
              Arr.filter(scene.effects, (effect) => effect.verb !== "sound"),
              (effect) => effect.id
            )
          );
          assert.deepStrictEqual(
            Arr.sort(
              Arr.map(slide?.elements ?? [], (element) => element.id),
              Order.String
            ),
            Arr.sort(
              Arr.map(scene.elements, (element) => element.id),
              Order.String
            )
          );
        }
      })
  );

  it.effect(
    "writes each Element as div.el with data-id, data-cell, its class and hidden when it is not visible",
    () =>
      Effect.gen(function* elements() {
        const plan = yield* storyPlan;
        const { html } = renderDeck(plan);

        assert.include(
          html,
          '<div class="el box" data-id="box" data-cell="ml">A box</div>'
        );
        assert.include(
          html,
          '<div class="el box hidden" data-id="twin" data-cell="mr">Another box</div>'
        );
        assert.include(
          html,
          '<div class="el title" data-id="title" data-cell="mc">Same name, new place</div>'
        );
      })
  );

  it.effect(
    "writes one fragment per show or focus effect with verb and target, and none for a sound",
    () =>
      Effect.gen(function* effects() {
        const plan = yield* storyPlan;
        const { html } = renderDeck(plan);

        assert.include(
          html,
          '<span class="fragment effect" data-fragment-index="0" data-effect-id="f1" data-effect-verb="focus" data-target="box"></span>'
        );
        assert.include(
          html,
          '<span class="fragment effect" data-fragment-index="1" data-effect-id="r1" data-effect-verb="show" data-target="twin"></span>'
        );
        assert.notInclude(html, 'data-effect-verb="sound"');
      })
  );

  it.effect(
    "writes the end of a ring that ends by its own `until` as a fragment of its own (data-effect-edge=end), carrying no sound",
    () =>
      Effect.gen(function* ring() {
        const { html } = renderDeck(yield* scheduledOf(ringSource));

        assert.include(
          html,
          '<span class="fragment effect" data-fragment-index="1" data-effect-id="f1" data-effect-edge="end" data-effect-verb="focus" data-target="a"></span>'
        );

        // A start has no edge attribute, and the ring that runs to the slide change (`f2`) has no end step.
        assert.strictEqual(Str.split(html, 'data-effect-edge="').length, 2);

        const [slide] = readDeck(html).slides;

        assert.deepStrictEqual(
          Arr.map(slide?.fragments ?? [], (fragment) => [
            fragment.index,
            fragment.effectId,
            fragment.edge,
            fragment.sounds,
          ]),
          [
            ["0", "f1", "start", ["ding", "pop"]],
            ["1", "f1", "end", []],
            ["2", "f2", "start", []],
          ]
        );
      })
  );

  it.effect(
    "orders the fragments of a Scene by resolved time, not by the order they were written in",
    () =>
      Effect.gen(function* order() {
        const plan = yield* scheduledStory;
        const slide = nth(readDeck(renderDeck(plan).html).slides, 3);
        const scene = nth(plan.scenes, 3);

        // sc4 writes `f1` (the focus, 0.2 s before "slides") before `r1` (the show, 0.1 s after "matches"): "matches"
        // is spoken before "slides", so the steps are `r1`, `f1` and, when the `f1` ring ends by its own `until`, the
        // end of `f1`. `s3` (a sound after the box and the tag settled) is no step.
        assert.deepStrictEqual(
          Arr.map(scene?.effects ?? [], (effect) => effect.id),
          ["s1", "s2", "s3", "f1", "r1"]
        );
        assert.deepStrictEqual(
          Arr.map(slide?.fragments ?? [], (fragment) => [
            fragment.effectId,
            fragment.edge,
          ]),
          [
            ["r1", "start"],
            ["f1", "start"],
            ["f1", "end"],
          ]
        );

        const fires = new Map(
          Arr.map(
            nth(plan.timeline?.scenes ?? [], 3)?.effects ?? [],
            (timed): [string, number] => [timed.effectId, timed.fireFrame]
          )
        );

        assert.isBelow(fires.get("r1") ?? 0, fires.get("f1") ?? 0);
      })
  );

  it.effect(
    "carries each sound as data-sounds: on the slide or on the step it plays with, never as a fragment",
    () =>
      Effect.gen(function* sounds() {
        const story = readDeck(renderDeck(yield* scheduledStory).html).slides;

        // sc4: the whoosh is anchored to the slide change, the ding to the box's motion and the pop to the moment the
        // box and the tag settled: all three ride on the slide, no step comes before them.
        assert.deepStrictEqual(nth(story, 3)?.sounds, [
          "whoosh",
          "ding",
          "pop",
        ]);
        assert.deepStrictEqual(
          Arr.flatMap(
            nth(story, 3)?.fragments ?? [],
            (fragment) => fragment.sounds
          ),
          []
        );
        assert.deepStrictEqual(nth(story, 4)?.sounds, ["ding"]);
        // sc6: the two pops of the `each` ride on the slide; the pop inside State 2 (`within`) rides on the first show, the
        // pops after the second show (a Beat's end, the last frame of the last State) on the second.
        assert.deepStrictEqual(nth(story, 5)?.sounds, ["pop", "pop"]);
        assert.deepStrictEqual(
          Arr.map(nth(story, 5)?.fragments ?? [], (fragment) => [
            fragment.effectId,
            fragment.sounds,
          ]),
          [
            ["r1", ["pop"]],
            ["r2", ["pop", "pop"]],
          ]
        );
        // sc7: an absolute time with no step before it plays alone, which a Deck can only do with the slide.
        assert.deepStrictEqual(nth(story, 6)?.sounds, ["pop", "pop", "pop"]);

        const carried = nth(
          readDeck(renderDeck(yield* scheduledOf(carrySource)).html).slides,
          0
        );

        assert.deepStrictEqual(carried?.sounds, ["whoosh", "pop"]);
        assert.deepStrictEqual(
          Arr.map(carried?.fragments ?? [], (fragment) => [
            fragment.effectId,
            fragment.sounds,
          ]),
          [
            ["r1", ["ding"]],
            ["f1", []],
          ]
        );
      })
  );

  it.effect(
    "marks Auto-Animate scenes on both sides of the join and a cut on the Scene it leads into",
    () =>
      Effect.gen(function* marks() {
        const plan = yield* planOf(chainSource);
        const { slides } = readDeck(renderDeck(plan).html);
        const [a, b, c, d, e] = slides;

        // A to B and C to D are two separate chains: B and C touch but never animate into each other.
        assert.strictEqual(a?.autoAnimate, b?.autoAnimate);
        assert.strictEqual(c?.autoAnimate, d?.autoAnimate);
        assert.notStrictEqual(a?.autoAnimate, null);
        assert.notStrictEqual(a?.autoAnimate, c?.autoAnimate);
        assert.strictEqual(e?.autoAnimate, null);
        assert.strictEqual(e?.transition, "none");
        assert.deepStrictEqual(
          Arr.map(slides, (slide) => slide.transition),
          [null, null, null, null, "none"]
        );
      })
  );

  it.effect(
    "takes the Auto-Animate duration and the slide size from plan.settings",
    () =>
      Effect.gen(function* settings() {
        const plan = yield* storyPlan;
        const standard = deckScript(plan);

        const slower = deckScript({
          ...plan,
          settings: { ...plan.settings, transition: 1.2 },
        });

        assert.include(standard, '"autoAnimateDuration":0.8');
        assert.include(standard, '"width":1280}');
        assert.include(slower, '"autoAnimateDuration":1.2');
        assert.notInclude(slower, '"autoAnimateDuration":0.8');
      })
  );

  it.effect("escapes text so a screenplay cannot add markup", () =>
    Effect.gen(function* escaping() {
      const plan = yield* storyPlan;
      const text = `<b onclick="x">Tom & 'Jerry'</b>`;

      const edited: PlanJson = {
        ...plan,
        scenes: Arr.map(plan.scenes, (scene) => ({
          ...scene,
          elements: Arr.map(scene.elements, (element) => ({
            ...element,
            text,
          })),
        })),
        title: text,
      };

      const { html } = renderDeck(edited);

      assert.notInclude(html, "<b onclick");
      assert.strictEqual(readDeck(html).slides[0]?.elements[0]?.text, text);
    })
  );
});
