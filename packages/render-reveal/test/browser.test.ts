// The Deck in a real Chromium (spec 0001, M3): the runtime API of the page contract, the effect of each Cue, the
// notes, and reveal.js Auto-Animate keeping the identity of a matched Element. These tests use the real clock; the
// controlled clock belongs to packages/capture-chromium. One browser per test, closed with the test's scope.
import { assert, describe, it } from "@effect/vitest";
import { stepsOf } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, Order, Schema, String as Str } from "effect";
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
import {
  asText,
  planOf,
  reringSource,
  ringSource,
  scheduledOf,
  scheduledStory,
  storyPlan,
  writtenDeck,
} from "./support.ts";

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

/** Runs a fragment command of the page (a step forward, `Reveal.prevFragment()`), then asserts which Elements carry the focus ring. */
const focusAfter = (page: Page, command: string, ids: readonly string[]) =>
  Effect.gen(function* moved() {
    yield* evaluate(page, command, Schema.Boolean);

    assert.deepStrictEqual(
      yield* evaluate(
        page,
        `[...document.querySelectorAll(".el.focused")].map((e) => e.dataset.id)`,
        Strings
      ),
      ids
    );
  });

const goTo = (scene: string): string => `reebeatDeck.goToScene("${scene}")`;

/** Shows the next fragment through the page's own API; true when there was one. */
const step = "reebeatDeck.stepFragment()";

const hasClass = (classes: string, name: string): boolean =>
  Str.split(classes, " ").includes(name);

/**
 * Steps through every fragment of the first Scene of `source`, asserting which Elements carry the ring after each step
 * (`forward`), then that no step is left, then steps back through them (`back`).
 */
const walkRings = (
  source: string,
  forward: readonly (readonly string[])[],
  back: readonly (readonly string[])[]
) =>
  Effect.gen(function* walk() {
    const plan = yield* scheduledOf(source);
    const { page } = yield* openDeck(yield* writtenDeck(plan));

    for (const ringed of forward) {
      yield* focusAfter(page, step, ringed);
    }

    assert.isFalse(yield* evaluate(page, step, Schema.Boolean));

    for (const ringed of back) {
      yield* focusAfter(page, "Reveal.prevFragment()", ringed);
    }
  });

/** How many fragment steps a Scene has: `stepsOf`, a start for each `show` and `focus` and an end for each ring that ends by its `until`. */
const stepCount = (plan: PlanJson, scene: PlanJson["scenes"][number]): number =>
  stepsOf(plan, scene).length;

/** Three steps, in the order of their words, and a pop that rides on the last one. */
const effectScreenplay = asText([
  "# Effects",
  "",
  "INT. ROOM - DAY #sc1#",
  "",
  "First {id=a cell=ml class=box}",
  "Second {id=b cell=mc class=box}",
  "Third {id=c cell=mr class=box visible=false}",
  "",
  "[[effects",
  '  f1: focus a at word("here").end',
  '  f2: focus b at word("there").end',
  '  r1: show c at word("more").end',
  '  s1: sound pop at word("done").end',
  "]]",
  "",
  "NARRATOR",
  "Look here. Then there. And more. Done.",
]);

const chainsScreenplay = asText([
  "# Chains",
  "",
  "INT. A - DAY #sc1#",
  "",
  "Box {id=x cell=ml class=box}",
  "",
  "NARRATOR",
  "One.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. B - DAY #sc2#",
  "",
  "Box {id=x cell=mr class=box}",
  "",
  "NARRATOR",
  "Two.",
  "",
  "INT. C - DAY #sc3#",
  "",
  "Box {id=x cell=mc class=box}",
  "",
  "NARRATOR",
  "Three.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. D - DAY #sc4#",
  "",
  "Box {id=x cell=bl class=box}",
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
    "steps exactly one fragment per step (a start per show or focus, an end per ring that ends by its until) in every scene, then reports none left",
    () =>
      Effect.gen(function* stepping() {
        const plan = yield* scheduledStory;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        const outcomes = yield* Effect.forEach(plan.scenes, (scene) =>
          Effect.gen(function* oneScene() {
            yield* evaluate(page, goTo(scene.id), Schema.Undefined);

            const steps = yield* Effect.forEach(
              Arr.range(0, stepCount(plan, scene)),
              () => evaluate(page, step, Schema.Boolean)
            );

            return { count: stepCount(plan, scene), id: scene.id, steps };
          })
        );

        for (const { count, id, steps } of outcomes) {
          assert.strictEqual(steps.length, count + 1, id);
          assert.strictEqual(
            steps.indexOf(false),
            count,
            `${id}: ${count} steps`
          );
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
            Str.split(shown, "\n"),
            (row) => Str.trim(row) !== "" && row !== "NOTES"
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
            "INT. QUIET - DAY #sc1#",
            "",
            "Only regular text {id=note cell=mc class=muted}",
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
    "a show step reveals its hidden Element; a focus step puts the ring on its target",
    () =>
      Effect.gen(function* revealing() {
        const plan = yield* storyPlan;
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        const classes = classesIn(page, "sc2");

        yield* evaluate(page, goTo("sc2"), Schema.Undefined);
        assert.isTrue(hasClass(yield* classes("twin"), "hidden"));
        assert.isFalse(hasClass(yield* classes("box"), "focused"));

        // the first step of sc2 is f1, the focus on box
        assert.isTrue(yield* evaluate(page, step, Schema.Boolean));
        assert.isTrue(hasClass(yield* classes("box"), "focused"));
        assert.isTrue(hasClass(yield* classes("twin"), "hidden"));

        // the second is r1, which shows `twin`
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

  it.live(
    "two show steps reveal their hidden Elements in the order of the steps",
    () =>
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
    "focus moves from one Element to the next and back; a sound plays assets/sfx/<name>.wav with the step it rides on",
    () =>
      Effect.gen(function* effects() {
        const plan = yield* scheduledOf(effectScreenplay);

        const { page } = yield* openDeck(
          yield* writtenDeck(plan),
          `window.played = []; HTMLMediaElement.prototype.play = function () { window.played.push(this.getAttribute("src")); return Promise.resolve(); };`
        );

        const classOfC = () => classesIn(page, "sc1")("c");

        yield* focusAfter(page, step, ["a"]);

        yield* focusAfter(page, step, ["b"]);

        // The pop is anchored to the end of "Done", after the last step: it rides on that step (`r1`), not on a step of
        // its own, so no fragment stands for it and nothing plays before the step runs.
        assert.deepStrictEqual(
          yield* evaluate(page, "window.played", Strings),
          []
        );

        yield* evaluate(page, step, Schema.Boolean);
        assert.isTrue(hasClass(yield* classOfC(), "shown"));
        assert.deepStrictEqual(
          yield* evaluate(page, "window.played", Strings),
          ["assets/sfx/pop.wav"]
        );
        assert.isFalse(yield* evaluate(page, step, Schema.Boolean));

        // Backwards: the fragments hide again, the ring returns to the previous focus.
        yield* evaluate(page, "Reveal.prevFragment()", Schema.Boolean);
        assert.isTrue(hasClass(yield* classOfC(), "hidden"));

        yield* focusAfter(page, "Reveal.prevFragment()", ["a"]);
      })
  );

  it.live(
    "the end step takes the ring off its own target, stepping back puts it back, and the next focus is untouched",
    // Three fragments: the start of `f1`, the end of `f1`, the start of `f2`.
    () => walkRings(ringSource, [["a"], [], ["b"]], [[], ["a"], []])
  );

  it.live(
    "the end step of a ring that a later focus on the same Element has taken over takes nothing off, and stepping back restores each owner",
    // Three fragments: the start of `f1`, the start of `f2` (the ring is its now), the end of `f1` (a no-op).
    () => walkRings(reringSource, [["a"], ["a"], ["a"]], [["a"], ["a"], []])
  );

  it.live(
    "plays the sounds of a slide when the slide is shown, not when its steps run",
    () =>
      Effect.gen(function* slideSounds() {
        const plan = yield* scheduledStory;

        const { page } = yield* openDeck(
          yield* writtenDeck(plan),
          `window.played = []; HTMLMediaElement.prototype.play = function () { window.played.push(this.getAttribute("src")); return Promise.resolve(); };`
        );

        // sc4 carries the whoosh, the ding and the pop on the slide (anchored to the slide change, to the box's motion and to the moment the box and the tag settled).
        yield* evaluate(page, goTo("sc3"), Schema.Undefined);
        yield* evaluate(
          page,
          "(window.played = [], undefined)",
          Schema.Undefined
        );
        yield* evaluate(page, goTo("sc4"), Schema.Undefined);
        assert.deepStrictEqual(
          yield* evaluate(page, "window.played", Strings),
          ["assets/sfx/whoosh.wav", "assets/sfx/ding.wav", "assets/sfx/pop.wav"]
        );

        yield* evaluate(page, step, Schema.Boolean);
        assert.deepStrictEqual(
          yield* evaluate(page, "window.played.length", Schema.Finite),
          3
        );
      })
  );

  it.live("a blocked sound does not raise an error", () =>
    Effect.gen(function* blocked() {
      const plan = yield* scheduledOf(effectScreenplay);

      const { page, pageErrors } = yield* openDeck(
        yield* writtenDeck(plan),
        `HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("blocked", "NotAllowedError")); };`
      );

      yield* Effect.forEach(Arr.range(1, 3), () =>
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

const cutScreenplay = asText([
  "# Cut",
  "",
  "INT. A - DAY #sc1#",
  "",
  "Box {id=x cell=mc class=box}",
  "",
  "NARRATOR",
  "One.",
  "",
  "> CUT",
  "",
  "INT. B - DAY #sc2#",
  "",
  "Box {id=y cell=mc class=box}",
  "",
  "NARRATOR",
  "Two.",
  "",
  "INT. C - DAY #sc3#",
  "",
  "Box {id=z cell=mc class=box}",
  "",
  "NARRATOR",
  "Three.",
  "",
  "INT. D - DAY #sc4#",
  "",
  "Box {id=w cell=mc class=box}",
  "",
  "NARRATOR",
  "Four.",
]);

/** The opacity the slide of `scene` has in the same task as the change of slide to `to`: a leaving fade has not begun. */
const opacityRightAfter = (to: string, scene: string): string =>
  `(() => { ${goTo(to)}; return Number(getComputedStyle(document.querySelector('section[data-scene="${scene}"]')).opacity); })()`;

describe("the slide change into a CUT", () => {
  it.live(
    "the old slide leaves at once on a cut and fades out on a default change",
    () =>
      Effect.gen(function* cutting() {
        const plan = yield* planOf(cutScreenplay);
        const { page } = yield* openDeck(yield* writtenDeck(plan));

        // sc1 -> sc2 is a cut: sc1 is invisible in the same task.
        assert.strictEqual(
          yield* evaluate(page, opacityRightAfter("sc2", "sc1"), Schema.Finite),
          0
        );
        // sc3 -> sc4 is a default fade, once sc3 has faded in: sc3 has begun to leave, it is still visible.
        yield* evaluate(page, goTo("sc3"), Schema.Undefined);
        yield* waitUntil(
          page,
          `getComputedStyle(document.querySelector('section[data-scene="sc3"]')).opacity === "1"`
        );
        assert.isAbove(
          yield* evaluate(page, opacityRightAfter("sc4", "sc3"), Schema.Finite),
          0.5
        );
      })
  );
});
