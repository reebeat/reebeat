// The Deck in a real Chromium (spec 0001, M3): the runtime API of the page contract, the effect of each Cue, the
// notes, and reveal.js Auto-Animate keeping the identity of a matched Element. These tests use the real clock; the
// controlled clock belongs to packages/video. One browser per test, closed with the test's scope.
import { assert, describe, it } from "@effect/vitest";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, Order, Schema } from "effect";
import type { Page } from "playwright-core";

import { renderDeck } from "../src/index.ts";
import { runtimeJs } from "../src/runtime.ts";
import { themeCss } from "../src/theme.ts";
import type { DeckSettings } from "../src/theme.ts";
import {
  evaluate,
  evaluateFailure,
  openDeck,
  speakerViewNotes,
  waitUntil,
} from "./browser.ts";
import { asText, planOf, storyPlan, writtenDeck } from "./support.ts";

const Strings = Schema.Array(Schema.String);

const Rect = Schema.Struct({
  height: Schema.Finite,
  width: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
});

const Samples = Schema.Array(Schema.Finite);

/** The keys of the Deck's reveal.js configuration, as `Reveal.getConfig()` reports them. */
const RevealSettings = Schema.Struct({
  autoAnimateDuration: Schema.Finite,
  autoAnimateEasing: Schema.String,
  controls: Schema.Boolean,
  fragments: Schema.Boolean,
  hash: Schema.Boolean,
  height: Schema.Finite,
  margin: Schema.Finite,
  maxScale: Schema.Finite,
  minScale: Schema.Finite,
  progress: Schema.Boolean,
  slideNumber: Schema.Boolean,
  transition: Schema.String,
  width: Schema.Finite,
});

const elementOf = (scene: string, id: string): string =>
  `document.querySelector('section[data-scene="${scene}"] [data-id="${id}"]')`;

const rectOf = (scene: string, id: string): string =>
  `(() => { const r = ${elementOf(scene, id)}.getBoundingClientRect(); return { height: r.height, width: r.width, x: r.x, y: r.y }; })()`;

const classesOf = (scene: string, id: string): string =>
  `${elementOf(scene, id)}.className`;

/** The class attribute of an Element of a scene, as a function of its id. */
const classesIn = (page: Page, scene: string) => (id: string) =>
  evaluate(page, classesOf(scene, id), Schema.String);

const goTo = (scene: string): string => `reebeatDeck.goToScene("${scene}")`;

/** Shows the next fragment through the page's own API; true when there was one. */
const step = "reebeatDeck.stepFragment()";

const hasClass = (classes: string, name: string): boolean =>
  classes.split(" ").includes(name);

/** The cue ids of a Scene, in order. */
const cueCount = (scene: PlanJson["scenes"][number]): number =>
  Arr.flatMap(scene.lines, (line) => line.cues).length;

const cueScreenplay = asText([
  "# Cues",
  "",
  "INT. ROOM - DAY",
  "",
  "First {#a @ml .box}",
  "Second {#b @mc .box}",
  "Third {#c @mr .box hidden}",
  "",
  "NARRATOR",
  "Look here. [[focus: a]] Then there. [[focus: b]] And more. [[next]] Done. [[sfx: pop]]",
]);

const chainsScreenplay = asText([
  "# Chains",
  "",
  "INT. A - DAY",
  "",
  "Box {#x @ml .box}",
  "",
  "NARRATOR",
  "One.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. B - DAY",
  "",
  "Box {#x @mr .box}",
  "",
  "NARRATOR",
  "Two.",
  "",
  "INT. C - DAY",
  "",
  "Box {#x @mc .box}",
  "",
  "NARRATOR",
  "Three.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. D - DAY",
  "",
  "Box {#x @bl .box}",
  "",
  "NARRATOR",
  "Four.",
]);

describe("the Deck page", () => {
  it.live(
    "loads from file: with no network request, resolves ready and exposes the Plan's scenes",
    () =>
      Effect.gen(function* loads() {
        const plan = yield* storyPlan;

        const { external, page, pageErrors } = yield* openDeck(
          yield* writtenDeck(plan)
        );

        assert.deepStrictEqual(
          yield* evaluate(page, "reebeatDeck.sceneIds", Strings),
          Arr.map(plan.scenes, (scene) => scene.id)
        );
        assert.deepStrictEqual(
          yield* evaluate(
            page,
            "Object.keys(window.reebeatDeck).sort()",
            Strings
          ),
          ["goToScene", "ready", "sceneIds", "stepFragment"]
        );
        assert.deepStrictEqual(external, []);
        assert.deepStrictEqual(pageErrors, []);

        // Inter comes from assets/fonts: both faces are loaded.
        assert.deepStrictEqual(
          yield* evaluate(
            page,
            `[...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family + face.weight).sort()`,
            Strings
          ),
          ["Inter400", "Inter700"]
        );
      })
  );

  it.live(
    "uses the contract's reveal.js configuration on a 1280x720 canvas",
    () =>
      Effect.gen(function* configured() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        // The contract's configuration for the settings of the Plan (1280x720, 0.8 s).
        assert.deepStrictEqual(
          yield* evaluate(page, "Reveal.getConfig()", RevealSettings),
          {
            autoAnimateDuration: 0.8,
            autoAnimateEasing: "ease",
            controls: false,
            fragments: true,
            hash: false,
            height: 720,
            margin: 0,
            maxScale: 1,
            minScale: 1,
            progress: false,
            slideNumber: false,
            transition: "fade",
            width: 1280,
          }
        );

        const { width, x } = yield* evaluate(
          page,
          rectOf("sc1", "title"),
          Rect
        );

        assert.strictEqual(x + width / 2, 640);
      })
  );

  it.live(
    "follows the settings it is given: slide size, type scale and Auto-Animate duration",
    () =>
      Effect.gen(function* settings() {
        const plan = yield* storyPlan;

        const large: DeckSettings = {
          height: 1080,
          transition: 1.2,
          width: 1920,
        };

        // The Plan contract pins 1280x720 today, so the files are generated from other settings by hand; the page
        // must still follow them.
        const { page } = yield* openDeck(
          yield* writtenDeck(plan, {
            ...renderDeck(plan),
            files: [
              { path: "assets/theme.css", text: themeCss(large) },
              { path: "assets/deck.js", text: runtimeJs(large) },
            ],
          })
        );

        const config = yield* evaluate(
          page,
          "Reveal.getConfig()",
          RevealSettings
        );

        assert.deepStrictEqual(
          [config.width, config.height, config.autoAnimateDuration],
          [1920, 1080, 1.2]
        );

        // The type scale follows the height: the title is 46 px on a 720 px slide, so 69 px on a 1080 px slide.
        assert.strictEqual(
          yield* evaluate(
            page,
            `getComputedStyle(${elementOf("sc1", "title")}).fontSize`,
            Schema.String
          ),
          "69px"
        );
      })
  );

  it.live(
    "steps exactly one fragment per Cue in every scene, then reports none left",
    () =>
      Effect.gen(function* stepping() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        const outcomes = yield* Effect.forEach(plan.scenes, (scene) =>
          Effect.gen(function* oneScene() {
            yield* evaluate(page, goTo(scene.id), Schema.Undefined);

            const steps = yield* Effect.forEach(
              Arr.range(0, cueCount(scene)),
              () => evaluate(page, step, Schema.Boolean)
            );

            return { cues: cueCount(scene), id: scene.id, steps };
          })
        );

        for (const { cues, id, steps } of outcomes) {
          assert.strictEqual(steps.length, cues + 1, id);
          assert.strictEqual(steps.indexOf(false), cues, `${id}: ${cues} Cues`);
        }
      })
  );

  it.live(
    "opens the speaker view with the notes of the current slide on the s key",
    () =>
      Effect.gen(function* speaker() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        yield* evaluate(page, goTo("sc4"), Schema.Undefined);

        const shown = yield* speakerViewNotes(page);

        assert.deepStrictEqual(
          Arr.filter(
            shown.split("\n"),
            (row) => row.trim() !== "" && row !== "NOTES"
          ),
          Arr.map(plan.scenes[3]?.lines ?? [], (line) => line.text)
        );
      })
  );

  it.live(
    "has both Inter faces loaded when ready resolves, even if the first slide uses one",
    () =>
      Effect.gen(function* fonts() {
        const plan = yield* planOf(
          asText([
            "# Plain",
            "",
            "INT. QUIET - DAY",
            "",
            "Only regular text {#note @mc .muted}",
            "",
            "NARRATOR",
            "One face is enough here.",
          ])
        );

        const { page } = yield* openDeck(yield* writtenDeck(plan));

        assert.deepStrictEqual(
          yield* evaluate(
            page,
            `[...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family + face.weight).sort()`,
            Strings
          ),
          ["Inter400", "Inter700"]
        );
      })
  );

  it.live("rejects an unknown scene id", () =>
    Effect.gen(function* unknown() {
      const plan = yield* storyPlan;
      const { page } = yield* openDeck(yield* writtenDeck(plan));

      assert.include(
        yield* evaluateFailure(page, goTo("nowhere")),
        "unknown scene nowhere"
      );
    })
  );

  it.live(
    "keeps the narration in <aside class=notes>, one paragraph per Line",
    () =>
      Effect.gen(function* notes() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        const found = yield* Effect.forEach(plan.scenes, (scene) =>
          evaluate(
            page,
            `[...document.querySelectorAll('section[data-scene="${scene.id}"] aside.notes p')].map((p) => p.textContent)`,
            Strings
          )
        );

        assert.deepStrictEqual(
          found,
          Arr.map(plan.scenes, (scene) =>
            Arr.map(scene.lines, (line) => line.text)
          )
        );
      })
  );

  it.live(
    "a next Cue shows the right hidden Element; a focus Cue puts the ring on its target",
    () =>
      Effect.gen(function* revealing() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        const classes = classesIn(page, "sc2");

        yield* evaluate(page, goTo("sc2"), Schema.Undefined);
        assert.isTrue(hasClass(yield* classes("twin"), "hidden"));
        assert.isFalse(hasClass(yield* classes("box"), "focused"));

        // sc2.l1.c1 is [[focus: box]]
        assert.isTrue(yield* evaluate(page, step, Schema.Boolean));
        assert.isTrue(hasClass(yield* classes("box"), "focused"));
        assert.isTrue(hasClass(yield* classes("twin"), "hidden"));

        // sc2.l2.c1 is [[next]], which reveals `twin`
        assert.isTrue(yield* evaluate(page, step, Schema.Boolean));

        const shown = yield* classes("twin");

        assert.isTrue(hasClass(shown, "shown"));
        assert.isFalse(hasClass(shown, "hidden"));

        // The 0.2 s opacity transition ends with the Element fully visible.
        yield* waitUntil(
          page,
          `getComputedStyle(${elementOf("sc2", "twin")}).opacity === "1"`
        );
      })
  );

  it.live("two next Cues reveal the hidden Elements in document order", () =>
    Effect.gen(function* ordered() {
      const plan = yield* storyPlan;
      const { page } = yield* openDeck(yield* writtenDeck(plan));

      const classes = classesIn(page, "sc6");

      yield* evaluate(page, goTo("sc6"), Schema.Undefined);
      yield* evaluate(page, step, Schema.Boolean);

      assert.deepStrictEqual(
        [
          hasClass(yield* classes("new"), "shown"),
          hasClass(yield* classes("gone"), "hidden"),
        ],
        [true, true]
      );

      yield* evaluate(page, step, Schema.Boolean);
      assert.isTrue(hasClass(yield* classes("gone"), "shown"));
    })
  );

  it.live(
    "focus moves from one Element to the next and back; sfx plays assets/sfx/<name>.wav",
    () =>
      Effect.gen(function* cues() {
        const plan = yield* planOf(cueScreenplay);

        const { page } = yield* openDeck(
          yield* writtenDeck(plan),
          `window.played = []; HTMLMediaElement.prototype.play = function () { window.played.push(this.getAttribute("src")); return Promise.resolve(); };`
        );

        const focused = () =>
          evaluate(
            page,
            `[...document.querySelectorAll(".el.focused")].map((e) => e.dataset.id)`,
            Strings
          );

        const classOfC = () => classesIn(page, "sc1")("c");

        yield* evaluate(page, step, Schema.Boolean);
        assert.deepStrictEqual(yield* focused(), ["a"]);

        yield* evaluate(page, step, Schema.Boolean);
        assert.deepStrictEqual(yield* focused(), ["b"]);

        yield* evaluate(page, step, Schema.Boolean);
        assert.isTrue(hasClass(yield* classOfC(), "shown"));

        yield* evaluate(page, step, Schema.Boolean);
        assert.deepStrictEqual(
          yield* evaluate(page, "window.played", Strings),
          ["assets/sfx/pop.wav"]
        );

        // Backwards: the fragments hide again, the ring returns to the previous focus.
        yield* evaluate(page, "Reveal.prevFragment()", Schema.Boolean);
        yield* evaluate(page, "Reveal.prevFragment()", Schema.Boolean);
        assert.isTrue(hasClass(yield* classOfC(), "hidden"));

        yield* evaluate(page, "Reveal.prevFragment()", Schema.Boolean);
        assert.deepStrictEqual(yield* focused(), ["a"]);
      })
  );

  it.live("a blocked sound does not raise an error", () =>
    Effect.gen(function* blocked() {
      const plan = yield* planOf(cueScreenplay);

      const { page, pageErrors } = yield* openDeck(
        yield* writtenDeck(plan),
        `HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("blocked", "NotAllowedError")); };`
      );

      yield* Effect.forEach(Arr.range(1, 4), () =>
        evaluate(page, step, Schema.Boolean)
      );

      // Two animation frames: an unhandled rejection would have been reported by then.
      yield* evaluate(
        page,
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))))",
        Schema.Undefined
      );
      assert.deepStrictEqual(pageErrors, []);
    })
  );
});

/**
 * Samples the left edge of `sc4`'s `one` at `steps + 1` evenly spaced moments of the Auto-Animate into `sc4`, by seeking
 * the browser's own animations instead of waiting for frames. The page goes to `sc4`; every CSS transition that starts
 * is paused in its `transitionrun` event (which fires before the first frame of the transition), and each sample sets
 * all of them to the same time and reads the box. The numbers do not depend on how fast the machine runs.
 */
const sampleTransition = (
  steps: number
): string => `new Promise((resolve, reject) => {
  const paused = [];
  document.addEventListener("transitionrun", (event) => {
    for (const animation of event.target.getAnimations()) {
      if (animation.transitionProperty === event.propertyName && !paused.includes(animation)) {
        animation.pause();
        paused.push(animation);
      }
    }
  }, true);
  const sample = () => {
    const duration = Math.max(...paused.map((animation) => animation.effect.getComputedTiming().endTime));
    const samples = [];
    for (let step = 0; step <= ${steps}; step += 1) {
      for (const animation of paused) { animation.currentTime = (duration * step) / ${steps}; }
      samples.push(${elementOf("sc4", "one")}.getBoundingClientRect().x);
    }
    resolve(samples);
  };
  // Reveal starts the Auto-Animate in a requestAnimationFrame, after the slide's own transitions have started:
  // wait for the transform transition of the moving Element.
  const moving = () => paused.some((animation) => animation.transitionProperty === "transform");
  let frames = 0;
  const wait = () => {
    frames += 1;
    if (moving()) { sample(); } else if (frames > 120) { reject(new Error("no transform transition started")); } else { requestAnimationFrame(wait); }
  };
  ${goTo("sc4")};
  wait();
})`;

describe("Auto-Animate between matched scenes", () => {
  it.live(
    "moves the matched Element from its start box to its end box, in one continuous path",
    () =>
      Effect.gen(function* animated() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));
        const fourth = plan.scenes.at(3);

        assert.strictEqual(fourth?.transition, "auto-animate");
        assert.deepStrictEqual(
          Arr.map(fourth?.identity?.update ?? [], ({ id }) => id),
          ["one", "tag"]
        );

        // What the CSS says: the end box is where the Element sits when its scene is shown after a jump from a
        // scene it does not animate with (sc1 has no Auto-Animate partner); the start box is its box in sc3.
        yield* evaluate(page, goTo("sc4"), Schema.Undefined);

        const endBox = yield* evaluate(page, rectOf("sc4", "one"), Rect);

        yield* evaluate(page, goTo("sc1"), Schema.Undefined);
        yield* evaluate(page, goTo("sc3"), Schema.Undefined);

        const startBox = yield* evaluate(page, rectOf("sc3", "one"), Rect);

        assert.isAbove(endBox.x - startBox.x, 100);

        // The animated change of slide, sampled at 24 evenly spaced moments of its 0.8 s (the 30 fps frames).
        const xs = yield* evaluate(page, sampleTransition(24), Samples);

        const strictlyBetween = Arr.filter(
          xs,
          (x) => x > startBox.x + 1 && x < endBox.x - 1
        );

        assert.strictEqual(xs.length, 25);
        assert.closeTo(xs[0] ?? Number.NaN, startBox.x, 0.6);
        assert.closeTo(xs.at(-1) ?? Number.NaN, endBox.x, 0.6);
        assert.isAtLeast(strictlyBetween.length, 20);
        assert.deepStrictEqual(xs, Arr.sort(xs, Order.Number));

        const end = yield* evaluate(page, rectOf("sc4", "one"), Rect);

        assert.closeTo(end.y, endBox.y, 0.6);
        assert.closeTo(end.width, endBox.width, 0.6);
        assert.closeTo(end.height, endBox.height, 0.6);
      })
  );

  it.live(
    "pairs the Elements the identity diff updates, and fades the entering ones",
    () =>
      Effect.gen(function* paired() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));
        const identity = plan.scenes[3]?.identity;

        yield* evaluate(page, goTo("sc3"), Schema.Undefined);
        yield* evaluate(page, goTo("sc4"), Schema.Undefined);

        const check = (expression: string) =>
          evaluate(page, expression, Schema.Boolean);

        const pairedIn = (scene: string) => (id: string) =>
          check(
            `${elementOf(scene, id)}.hasAttribute("data-auto-animate-target")`
          );

        const matched = Arr.map(identity?.update ?? [], ({ id }) => id);
        const entering = identity?.enter ?? [];
        const leaving = identity?.exit ?? [];

        assert.isAbove(matched.length, 0);
        assert.isAbove(entering.length, 0);
        assert.isAbove(leaving.length, 0);

        // Updated Elements are paired on both slides.
        assert.deepStrictEqual(
          [
            ...(yield* Effect.forEach(matched, pairedIn("sc3"))),
            ...(yield* Effect.forEach(matched, pairedIn("sc4"))),
          ],
          Arr.map([...matched, ...matched], () => true)
        );

        // Entering Elements sit in an unmatched part of the new slide and fade in.
        assert.deepStrictEqual(
          yield* Effect.forEach(entering, (id) =>
            check(
              `${elementOf("sc4", id)}.closest('[data-auto-animate-target^="unmatched"]') !== null`
            )
          ),
          Arr.map(entering, () => true)
        );

        // Leaving Elements are not on the new slide and are not paired on the old one.
        assert.deepStrictEqual(
          yield* Effect.forEach(leaving, (id) =>
            check(
              `${elementOf("sc4", id)} === null && !${elementOf("sc3", id)}.hasAttribute("data-auto-animate-target")`
            )
          ),
          Arr.map(leaving, () => true)
        );
      })
  );

  it.live("does not animate between two chains that only touch", () =>
    Effect.gen(function* separate() {
      const plan = yield* planOf(chainsScreenplay);
      const { page } = yield* openDeck(yield* writtenDeck(plan));

      // From the first chain to the second and back: two default fades, no element is paired.
      yield* evaluate(page, goTo("sc3"), Schema.Undefined);
      yield* evaluate(page, goTo("sc2"), Schema.Undefined);
      assert.strictEqual(
        yield* evaluate(
          page,
          `document.querySelectorAll("[data-auto-animate-target]").length`,
          Schema.Finite
        ),
        0
      );
    })
  );
});
