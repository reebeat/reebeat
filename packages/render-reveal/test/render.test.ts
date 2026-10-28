// renderDeck is pure and follows the Deck page contract of spec 0001. These tests read the generated page back with
// readDeck and with plain string checks, so they need no browser.
import { assert, describe, it } from "@effect/vitest";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, Option, Order } from "effect";

import { readDeck, renderDeck } from "../src/index.ts";
import { asText, fixtureSha256, planOf, storyPlan } from "./support.ts";

const chainSource = asText([
  "# One",
  "",
  "INT. A - DAY",
  "",
  "Alpha {#a @ml .box}",
  "",
  "NARRATOR",
  "First.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. B - DAY",
  "",
  "Alpha {#a @mr .box}",
  "",
  "NARRATOR",
  "Second.",
  "",
  "INT. C - DAY",
  "",
  "Alpha {#a @mc .box}",
  "",
  "NARRATOR",
  "Third.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. D - DAY",
  "",
  "Alpha {#a @bl .box}",
  "",
  "NARRATOR",
  "Fourth.",
  "",
  "> CUT",
  "",
  "INT. E - DAY",
  "",
  "Alpha {#a @tl .box}",
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

describe("renderDeck", () => {
  it.effect("is a pure function: the same Plan gives the same bytes", () =>
    Effect.gen(function* twice() {
      const plan = yield* storyPlan;

      assert.deepStrictEqual(renderDeck(plan), renderDeck(plan));
    })
  );

  it.effect(
    "writes the contract's page: hash, one flat section per Scene, notes, cues",
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
          html.match(/<section /gu)?.length,
          plan.scenes.length
        );
        assert.strictEqual(
          html.match(/<aside class="notes">/gu)?.length,
          plan.scenes.length
        );

        for (const [index, scene] of plan.scenes.entries()) {
          const slide = model.slides[index];

          assert.deepStrictEqual(
            slide?.notes,
            Arr.map(scene.lines, (line) => line.text)
          );
          assert.deepStrictEqual(
            Arr.map(slide?.fragments ?? [], (fragment) => fragment.cueId),
            Arr.flatMap(scene.lines, (line) =>
              Arr.map(line.cues, (cue) => cue.id)
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
    "writes each Element as div.el with data-id, data-cell and its classes",
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
    "writes one fragment per Cue with kind, argument and the Element a next reveals",
    () =>
      Effect.gen(function* cues() {
        const plan = yield* storyPlan;
        const { html } = renderDeck(plan);

        assert.include(
          html,
          '<span class="fragment cue" data-fragment-index="0" data-cue-id="sc2.l1.c1" data-cue-kind="focus" data-cue-arg="box" data-reveals=""></span>'
        );
        assert.include(
          html,
          '<span class="fragment cue" data-fragment-index="1" data-cue-id="sc2.l2.c1" data-cue-kind="next" data-cue-arg="" data-reveals="twin"></span>'
        );
      })
  );

  it.effect(
    "marks Auto-Animate scenes on both sides of the join, a cut on the Scene it leads into",
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
