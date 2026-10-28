// F3, F4 and the deck side of F5 (spec 0001): a written deck.html is read back and compared with the Plan. Every
// control below edits the written file (or the Plan) the way a stale or hand-edited output would differ, and the
// check must fail naming the slide and the position.
import { assert, describe, it } from "@effect/vitest";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect } from "effect";

import { checkDeck, DeckMismatch, renderDeck } from "../src/index.ts";
import { readIn, storyPlan, writtenDeck } from "./support.ts";

/** The written deck.html of the committed story and its Plan. */
const writtenStory = Effect.gen(function* written() {
  const plan = yield* storyPlan;
  const html = yield* readIn(yield* writtenDeck(plan), "deck.html");

  return { html, plan };
});

const span = (html: string, cueId: string): string => {
  const found = new RegExp(
    `\\s*<span class="fragment cue"[^>]*data-cue-id="${cueId}"[^>]*></span>`,
    "u"
  ).exec(html);

  assert.isNotNull(found, `the page has a fragment for ${cueId}`);

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
    failureOf(plan, html, html.replace(search, replacement))
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
        "<p>Box two has no match, so it leaves the screen.</p>",
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
          html.replace(span(html, "sc2.l2.c1"), "")
        );

        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc2", 1]);
        assert.include(error.message, "scene sc2, fragment 1");
      })
  );

  it.effect("F4 control: two swapped fragments fail at the first of them", () =>
    Effect.gen(function* fragments() {
      const { html, plan } = yield* writtenStory;
      const first = span(html, "sc6.l3.c1");
      const second = span(html, "sc6.l3.c2");

      const error = yield* failureOf(
        plan,
        html,
        html
          .replace(first, "\u0000")
          .replace(second, first)
          .replace("\u0000", second)
      );

      assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc6", 0]);
    })
  );

  it.effect("F4 control: a changed argument or kind fails", () =>
    Effect.gen(function* fragments() {
      const { html, plan } = yield* writtenStory;

      const argument = yield* failureOf(
        plan,
        html,
        html.replace('data-cue-arg="box"', 'data-cue-arg="twin"')
      );

      const kind = yield* failureOf(
        plan,
        html,
        html.replace(
          'data-cue-id="sc2.l1.c1" data-cue-kind="focus"',
          'data-cue-id="sc2.l1.c1" data-cue-kind="sfx"'
        )
      );

      assert.deepStrictEqual(
        [placeOf(argument), placeOf(kind)],
        [
          ["F4 fragments", "sc2", 0],
          ["F4 fragments", "sc2", 0],
        ]
      );
    })
  );

  it.effect(
    "F4 control: a fragment that reveals another Element fails, though its kind and argument agree",
    () =>
      Effect.gen(function* reveals() {
        const { html, plan } = yield* writtenStory;

        const error = yield* failureOf(
          plan,
          html,
          html.replace('data-reveals="twin"', 'data-reveals=""')
        );

        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc2", 1]);
        assert.include(error.message, 'the Plan reveals "twin"');
      })
  );

  it.effect("F5 control: a changed hash attribute fails", () =>
    Effect.gen(function* hash() {
      const { html, plan } = yield* writtenStory;
      const flipped = `${plan.sourceSha256.slice(0, -1)}0`;

      const error = yield* failureOf(
        plan,
        html,
        html.replace(
          `<html lang="en" data-source-sha256="${plan.sourceSha256}">`,
          `<html lang="en" data-source-sha256="${flipped}">`
        )
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
        html.replace(meta, meta.replace(plan.sourceSha256, "stale"))
      );

      const missing = yield* failureOf(plan, html, html.replace(meta, ""));

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
              text: line.text.replace("box", "crate"),
            })),
          })),
          sourceSha256: "0".repeat(64),
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
                    classes: ["muted"],
                    hidden: false,
                    id: "late",
                    line: 1,
                    text: "Late",
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
        html.replace(
          box,
          `${box}<div class="el" data-id="stray" data-cell="mc">x</div>`
        )
      );

      const changed = yield* failureOf(
        plan,
        html,
        html.replace(
          'data-id="box" data-cell="ml"',
          'data-id="box" data-cell="mr"'
        )
      );

      assert.deepStrictEqual(
        [extra.check, extra.slide, changed.check, changed.slide],
        ["elements", "sc2", "elements", "sc2"]
      );
      assert.include(extra.message, "stray");
      assert.include(changed.message, "Element box differs");
    })
  );

  it.effect("control: a lost data-auto-animate fails", () =>
    Effect.gen(function* marks() {
      const { html, plan } = yield* writtenStory;

      const lost = yield* failureOf(
        plan,
        html,
        html.replace(/ data-auto-animate="" data-auto-animate-id="aa1"/u, "")
      );

      assert.deepStrictEqual([lost.check, lost.slide], ["transitions", "sc3"]);
    })
  );

  it.effect("control: a slide with another scene id fails", () =>
    Effect.gen(function* order() {
      const { html, plan } = yield* writtenStory;

      const error = yield* failureOf(
        plan,
        html,
        html.replace('data-scene="sc1"', 'data-scene="scX"')
      );

      assert.deepStrictEqual([error.check, error.index], ["slides", 0]);
    })
  );
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
            html: bundle.html.replace(span(bundle.html, "sc2.l2.c1"), ""),
          })
        );

        assert.instanceOf(error, DeckMismatch);
        assert.deepStrictEqual(placeOf(error), ["F4 fragments", "sc2", 1]);
      })
  );
});
