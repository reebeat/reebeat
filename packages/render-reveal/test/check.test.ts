// F3, F4 and the deck side of F5 (spec 0001): a written deck.html is read back and compared with the Plan. Every
// control below edits the written file (or the Plan) the way a stale or hand-edited output would differ, and the
// check must fail naming the slide and the position.
import { assert, describe, it } from "@effect/vitest";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, String as Str, pipe } from "effect";

import { checkDeck, DeckMismatch, renderDeck } from "../src/index.ts";
import {
  carrySource,
  readIn,
  ringSource,
  scheduledOf,
  storyPlan,
  writtenDeck,
} from "./support.ts";

/** The written deck.html of the committed story and its Plan. */
const writtenStory = Effect.gen(function* written() {
  const plan = yield* storyPlan;
  const html = yield* readIn(yield* writtenDeck(plan), "deck.html");

  return { html, plan };
});

/** The fragment of effect `effectId` of the slide of Scene `sceneId`, with the whitespace before it. */
const span = (html: string, sceneId: string, effectId: string): string => {
  const slide = new RegExp(
    `<section data-scene="${sceneId}"[\\s\\S]*?</section>`,
    "u"
  ).exec(html);

  const found = new RegExp(
    `\\s*<span class="fragment effect"[^>]*data-effect-id="${effectId}"[^>]*></span>`,
    "u"
  ).exec(slide?.[0] ?? "");

  assert.isNotNull(
    found,
    `the slide ${sceneId} has a fragment for ${effectId}`
  );

  return found?.[0] ?? "";
};

/** What `checkDeck` says about `edited` (the written page after a mutation); the mutation must change the page. */
const failureOf = (plan: PlanJson, written: string, edited: string) => {
  assert.notStrictEqual(edited, written, "the control changes the page");

  return Effect.flip(checkDeck(plan, edited));
};

/** What `checkDeck` says about the written story page after `html.replace(search, replacement)`. */
const afterReplace = (search: string | RegExp, replacement: string) =>
  Effect.flatMap(writtenStory, ({ html, plan }) =>
    failureOf(plan, html, Str.replace(search, replacement)(html))
  );

/** The place a mismatch names: which check, which slide, which position in it. */
const placeOf = (error: DeckMismatch) => [
  error.check,
  error.slide,
  error.index,
];

describe("checkDeck", () => {
  it.effect("accepts the page the Renderer assembled", () =>
    Effect.gen(function* accepted() {
      const { html, plan } = yield* writtenStory;

      yield* checkDeck(plan, html);
    })
  );

  it.effect(
    "F3 control: one changed note character fails, naming the slide and the note",
    () =>
      Effect.gen(function* notes() {
        const error = yield* afterReplace(
          "Here is a small idea about moving things.",
          "Here is a small idea about moving thing."
        );

        assert.instanceOf(error, DeckMismatch);
        assert.deepStrictEqual(placeOf(error), ["F3 notes", "sc1", 0]);
        assert.include(error.message, "slide sc1, note 1");
      })
  );

  it.effect("F3 control: a dropped note paragraph fails", () =>
    Effect.gen(function* notes() {
      const error = yield* afterReplace(
        "<p>Box two has no match, so it leaves.</p>",
        ""
      );

      assert.deepStrictEqual(placeOf(error), ["F3 notes", "sc4", 1]);
    })
  );

  it.effect(
    "F4 control: a deleted fragment fails, naming the slide and the index",
    () =>
      Effect.gen(function* fragments() {
        const { html, plan } = yield* writtenStory;

        const error = yield* failureOf(
          plan,
          html,
          Str.replace(span(html, "sc2", "r1"), "")(html)
        );

        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc2", 1]);
        assert.include(error.message, "scene sc2, fragment 1");
      })
  );

  it.effect("F4 control: two swapped fragments fail at the first of them", () =>
    Effect.gen(function* fragments() {
      const { html, plan } = yield* writtenStory;
      const first = span(html, "sc6", "r1");
      const second = span(html, "sc6", "r2");

      const error = yield* failureOf(
        plan,
        html,
        pipe(
          html,
          Str.replace(first, "\u0000"),
          Str.replace(second, first),
          Str.replace("\u0000", second)
        )
      );

      assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc6", 0]);
    })
  );

  it.effect("F4 control: a changed target or verb fails", () =>
    Effect.gen(function* fragments() {
      const { html, plan } = yield* writtenStory;

      const target = yield* failureOf(
        plan,
        html,
        Str.replace('data-target="box"', 'data-target="twin"')(html)
      );

      const verb = yield* failureOf(
        plan,
        html,
        Str.replace(
          'data-effect-id="f1" data-effect-verb="focus"',
          'data-effect-id="f1" data-effect-verb="show"'
        )(html)
      );

      assert.deepStrictEqual(
        [placeOf(target), placeOf(verb)],
        [
          ["F4 fragments", "sc2", 0],
          ["F4 fragments", "sc2", 0],
        ]
      );
    })
  );

  it.effect(
    "F4 control: a fragment with another index fails, though its verb and target agree",
    () =>
      Effect.gen(function* indices() {
        const { html, plan } = yield* writtenStory;

        const error = yield* failureOf(
          plan,
          html,
          Str.replace(
            'data-fragment-index="1" data-effect-id="r1"',
            'data-fragment-index="7" data-effect-id="r1"'
          )(html)
        );

        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc2", 1]);
        assert.include(error.message, "the Plan has index 1");
      })
  );

  it.effect(
    "F4 control: a sound dropped from, added to or reordered on the slide fails (data-sounds)",
    () =>
      Effect.gen(function* sounds() {
        const { html, plan } = yield* writtenStory;

        const dropped = yield* failureOf(
          plan,
          html,
          Str.replace(' data-sounds="whoosh ding"', "")(html)
        );

        const reordered = yield* failureOf(
          plan,
          html,
          Str.replace(
            'data-sounds="whoosh ding"',
            'data-sounds="ding whoosh"'
          )(html)
        );

        const added = yield* failureOf(
          plan,
          html,
          Str.replace(
            'data-scene="sc2"',
            'data-scene="sc2" data-sounds="pop"'
          )(html)
        );

        assert.deepStrictEqual(
          [placeOf(dropped), placeOf(reordered), placeOf(added)],
          [
            ["F4 fragments", "sc4", null],
            ["F4 fragments", "sc4", null],
            ["F4 fragments", "sc2", null],
          ]
        );
        assert.include(
          dropped.message,
          "the Plan plays whoosh ding when the slide is shown, the page's data-sounds is no sound"
        );
      })
  );

  it.effect(
    "F4 control: a sound moved to another step fails, naming the step",
    () =>
      Effect.gen(function* carried() {
        const plan = yield* scheduledOf(carrySource);
        const html = yield* readIn(yield* writtenDeck(plan), "deck.html");

        // `ding` rides on the step r1; the page puts it on f1, the step after.
        const error = yield* failureOf(
          plan,
          html,
          pipe(
            html,
            Str.replace(' data-sounds="ding"', ""),
            Str.replace('data-target="a"', 'data-target="a" data-sounds="ding"')
          )
        );

        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc1", 0]);
        assert.include(error.message, "playing ding");
      })
  );

  it.effect("F5 control: a changed hash attribute fails", () =>
    Effect.gen(function* hash() {
      const { html, plan } = yield* writtenStory;
      const flipped = `${Str.slice(0, -1)(plan.sourceSha256)}0`;

      const error = yield* failureOf(
        plan,
        html,
        Str.replace(
          `<html lang="en" data-source-sha256="${plan.sourceSha256}">`,
          `<html lang="en" data-source-sha256="${flipped}">`
        )(html)
      );

      assert.strictEqual(error.check, "F5 source hash");
      assert.include(error.message, "<html data-source-sha256>");
      assert.include(error.message, flipped);
    })
  );

  it.effect("F5 control: a changed or missing meta hash fails", () =>
    Effect.gen(function* hash() {
      const { html, plan } = yield* writtenStory;
      const meta = `<meta name="reebeat:source-sha256" content="${plan.sourceSha256}">`;

      const changed = yield* failureOf(
        plan,
        html,
        Str.replace(meta, Str.replace(plan.sourceSha256, "stale")(meta))(html)
      );

      const missing = yield* failureOf(plan, html, Str.replace(meta, "")(html));

      assert.strictEqual(changed.check, "F5 source hash");
      assert.include(changed.message, "stale");
      assert.strictEqual(missing.check, "F5 source hash");
      assert.include(missing.message, "absent");
    })
  );

  it.effect(
    "F5 control: a Plan from another source (hash and a changed narration word) fails",
    () =>
      Effect.gen(function* stale() {
        const { html, plan } = yield* writtenStory;

        const newer: PlanJson = {
          ...plan,
          scenes: Arr.map(plan.scenes, (scene) => ({
            ...scene,
            lines: Arr.map(scene.lines, (line) => ({
              ...line,
              text: Str.replace("box", "crate")(line.text),
            })),
          })),
          sourceSha256: Str.repeat(64)("0"),
        };

        assert.strictEqual(
          (yield* Effect.flip(checkDeck(newer, html))).check,
          "F5 source hash"
        );
      })
  );

  it.effect("control: an Element added to the Plan after writing fails", () =>
    Effect.gen(function* added() {
      const { html, plan } = yield* writtenStory;

      const extended: PlanJson = {
        ...plan,
        scenes: Arr.map(plan.scenes, (scene) =>
          scene.id === "sc1"
            ? {
                ...scene,
                elements: [
                  ...scene.elements,
                  {
                    cell: "bl",
                    class: "muted",
                    id: "late",
                    line: 1,
                    text: "Late",
                    visible: true,
                  },
                ],
              }
            : scene
        ),
      };

      const error = yield* Effect.flip(checkDeck(extended, html));

      assert.deepStrictEqual([error.check, error.slide], ["elements", "sc1"]);
      assert.include(error.message, "Element late is missing");
    })
  );

  it.effect("control: an Element added to or changed in the page fails", () =>
    Effect.gen(function* edited() {
      const { html, plan } = yield* writtenStory;

      const box =
        '<div class="el box" data-id="box" data-cell="ml">A box</div>';

      const extra = yield* failureOf(
        plan,
        html,
        Str.replace(
          box,
          `${box}<div class="el" data-id="stray" data-cell="mc">x</div>`
        )(html)
      );

      const changed = yield* failureOf(
        plan,
        html,
        Str.replace(
          'data-id="box" data-cell="ml"',
          'data-id="box" data-cell="mr"'
        )(html)
      );

      assert.deepStrictEqual(
        [extra.check, extra.slide, changed.check, changed.slide],
        ["elements", "sc2", "elements", "sc2"]
      );
      assert.include(extra.message, "stray");
      assert.include(changed.message, "Element box differs");
    })
  );

  it.effect.each([
    {
      lost: / data-auto-animate="" data-auto-animate-id="aa1"/u,
      slide: "sc3",
      what: "data-auto-animate",
    },
    {
      lost: / data-transition="none"/u,
      slide: "sc3",
      what: "data-transition (the incoming slide of a cut would fade in, and the one it replaces would fade out)",
    },
  ])("control: a lost $what fails", ({ lost, slide }) =>
    Effect.gen(function* marks() {
      const { html, plan } = yield* writtenStory;
      const error = yield* failureOf(plan, html, Str.replace(lost, "")(html));

      assert.deepStrictEqual(
        [error.check, error.slide],
        ["transitions", slide]
      );
    })
  );

  it.effect("control: a slide with another scene id fails", () =>
    Effect.gen(function* order() {
      const { html, plan } = yield* writtenStory;

      const error = yield* failureOf(
        plan,
        html,
        Str.replace('data-scene="sc1"', 'data-scene="scX"')(html)
      );

      assert.deepStrictEqual([error.check, error.index], ["slides", 0]);
    })
  );

  describe("the end step of a ring", () => {
    const ringDeck = Effect.gen(function* ring() {
      const plan = yield* scheduledOf(ringSource);

      return { html: renderDeck(plan).html, plan };
    });

    const endSpan =
      '    <span class="fragment effect" data-fragment-index="1" data-effect-id="f1" data-effect-edge="end" data-effect-verb="focus" data-target="a"></span>\n';

    it.effect("is accepted when the page has it", () =>
      Effect.gen(function* accepted() {
        const { html, plan } = yield* ringDeck;

        assert.include(html, endSpan);
        yield* checkDeck(plan, html);
      })
    );

    it.effect(
      "F5 control: a deleted end step fails, naming the slide and the index",
      () =>
        Effect.gen(function* deleted() {
          const { html, plan } = yield* ringDeck;

          const error = yield* failureOf(
            plan,
            html,
            Str.replace(endSpan, "")(html)
          );

          assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc1", 1]);
          assert.include(error.message, "f1 end (focus a)");
        })
    );

    it.effect(
      "F5 control: an end step written as a start fails, though its effect, verb and target agree",
      () =>
        Effect.gen(function* restarted() {
          const { html, plan } = yield* ringDeck;

          const error = yield* failureOf(
            plan,
            html,
            Str.replace(' data-effect-edge="end"', "")(html)
          );

          assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc1", 1]);
        })
    );
  });
});

describe("assembleDeck re-reads its own output", () => {
  it.effect(
    "fails the render with DeckMismatch when the bundle disagrees with the Plan (F4)",
    () =>
      Effect.gen(function* build() {
        const plan = yield* storyPlan;
        const bundle = renderDeck(plan);

        const error = yield* Effect.flip(
          writtenDeck(plan, {
            ...bundle,
            html: Str.replace(span(bundle.html, "sc2", "r1"), "")(bundle.html),
          })
        );

        assert.instanceOf(error, DeckMismatch);
        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc2", 1]);
      })
  );
});
