// The lint rules, each with a control that shows the rule fails when the thing it guards is broken.
import { assert, describe, it } from "@effect/vitest";
import { buildPlan } from "@tsukuri/core";
import type { Effect as PlanEffect, PlanJson } from "@tsukuri/core";
import { Array as Arr, Effect, String as Str } from "effect";

import {
  absoluteTimesNeedReason,
  contrast,
  contrastRatio,
  derivedEventsNeverUsed,
  effectFragmentAgreement,
  lintPlan,
  untilsOfTheirOwnFire,
} from "../src/index.ts";
import type { Fragment } from "../src/index.ts";
import { plan } from "./support.ts";

/** The fragments a faithful Rendering of the Plan in `support.ts` shows, written out: one per show and focus. */
const faithful = (): readonly Fragment[] => [
  { edge: "start", effectId: "r1", sceneId: "one", target: "b", verb: "show" },
  { edge: "start", effectId: "f1", sceneId: "two", target: "a", verb: "focus" },
];

const places = (diagnostics: ReturnType<typeof effectFragmentAgreement>) =>
  Arr.map(diagnostics, ({ index, sceneId }) => [sceneId, index]);

/** The Plan with a Timeline in which the focus `f1` of Scene `two` ends by its own `until`: it has an end step. */
const ringed = (given: PlanJson): PlanJson => ({
  ...given,
  timeline: {
    chapters: [],
    scenes: [
      {
        effects: [
          {
            commandFrame: 9,
            effectId: "f1",
            endCommandFrame: 19,
            endFrame: 20,
            endedBy: "until",
            fireFrame: 10,
            instance: 1,
          },
        ],
        endFrame: 60,
        events: [],
        lines: [],
        sceneId: "two",
        slideFrame: 0,
      },
    ],
    totalFrames: 60,
  },
});

describe("effectFragmentAgreement", () => {
  it.effect(
    "holds for the fragments of the Plan's own show and focus effects, sounds excluded",
    () =>
      Effect.gen(function* agrees() {
        const given = yield* plan;

        assert.strictEqual(faithful().length, 2);
        assert.deepStrictEqual(effectFragmentAgreement(given, faithful()), []);
      })
  );

  it.effect(
    "control: a missing fragment names the Scene, the position and the source line",
    () =>
      Effect.gen(function* missing() {
        const given = yield* plan;

        const diagnostics = effectFragmentAgreement(given, [
          {
            edge: "start",
            effectId: "r1",
            sceneId: "one",
            target: "b",
            verb: "show",
          },
        ]);

        assert.deepStrictEqual(places(diagnostics), [["two", 0]]);
        assert.strictEqual(diagnostics[0]?.rule, "effect-fragment-agreement");
        assert.include(
          diagnostics[0]?.message ?? "",
          "scene two, fragment 0: the Plan says f1 (focus a), the fragments have no fragment"
        );
        assert.isNumber(diagnostics[0]?.line);
      })
  );

  it.effect(
    "control: an extra, a re-verbed and a re-targeted fragment each fail at their position",
    () =>
      Effect.gen(function* broken() {
        const given = yield* plan;
        const [first, second] = faithful();

        assert.isDefined(first);
        assert.isDefined(second);

        const extra: readonly Fragment[] = [
          first,
          second,
          {
            edge: "start",
            effectId: "x",
            sceneId: "three",
            target: "c",
            verb: "show",
          },
        ];

        const reverbed = [first, { ...second, verb: "show" }];
        const retargeted = [first, { ...second, target: "b" }];

        assert.deepStrictEqual(places(effectFragmentAgreement(given, extra)), [
          ["three", 0],
        ]);
        assert.deepStrictEqual(
          places(effectFragmentAgreement(given, reverbed)),
          [["two", 0]]
        );
        assert.deepStrictEqual(
          places(effectFragmentAgreement(given, retargeted)),
          [["two", 0]]
        );
      })
  );

  it.effect("reports every Scene that differs, once each", () =>
    Effect.gen(function* several() {
      const given = yield* plan;

      assert.deepStrictEqual(places(effectFragmentAgreement(given, [])), [
        ["one", 0],
        ["two", 0],
      ]);
    })
  );

  it.effect(
    "control: a ring whose end step is missing, or an end without a ring, fails at the end",
    () =>
      Effect.gen(function* rings() {
        const given = ringed(yield* plan);
        const [first, second] = faithful();

        assert.isDefined(first);
        assert.isDefined(second);

        const withEnd: readonly Fragment[] = [
          first,
          second,
          { ...second, edge: "end" },
        ];

        assert.deepStrictEqual(effectFragmentAgreement(given, withEnd), []);

        const missing = effectFragmentAgreement(given, [first, second]);

        assert.deepStrictEqual(places(missing), [["two", 1]]);
        assert.include(
          missing[0]?.message ?? "",
          "scene two, fragment 1: the Plan says f1 end (focus a), the fragments have no fragment"
        );

        // The Deck shows an end step the Plan does not have (its ring has no `until`).
        const extra = effectFragmentAgreement(yield* plan, withEnd);

        assert.deepStrictEqual(places(extra), [["two", 1]]);
        assert.include(
          extra[0]?.message ?? "",
          "the Plan says no fragment, the fragments have f1 end (focus a)"
        );
      })
  );
});

describe("contrast", () => {
  it("is the WCAG ratio: 21 for black on white, 1 for equal colours, symmetric", () => {
    assert.closeTo(contrastRatio("#000000", "#ffffff"), 21, 1e-9);
    assert.closeTo(contrastRatio("#ffffff", "#ffffff"), 1, 1e-9);
    assert.strictEqual(
      contrastRatio("#1a3fa8", "#f7f5f0"),
      contrastRatio("#f7f5f0", "#1a3fa8")
    );
  });

  it("holds for pairs at or above the minimum and says nothing", () => {
    assert.deepStrictEqual(
      contrast(
        [{ background: "#ffffff", foreground: "#000000", label: "ink" }],
        4.5
      ),
      []
    );
  });

  it("control: a pair below the minimum is named with its ratio", () => {
    const [found, ...rest] = contrast(
      [
        { background: "#ffffff", foreground: "#000000", label: "ink" },
        { background: "#ffffff", foreground: "#777777", label: "grey" },
      ],
      4.5
    );

    assert.strictEqual(rest.length, 0);
    assert.strictEqual(found?.rule, "contrast");
    assert.match(
      found?.message ?? "",
      /^grey: #777777 on #ffffff is 4\.48:1, below 4\.5:1$/u
    );
  });
});

/** The Plan with its Scene `sceneId` changed by `change`. */
const withScene = (
  given: PlanJson,
  sceneId: string,
  change: (scene: PlanJson["scenes"][number]) => PlanJson["scenes"][number]
): PlanJson => ({
  ...given,
  scenes: Arr.map(given.scenes, (scene) =>
    scene.id === sceneId ? change(scene) : scene
  ),
});

/** The Plan with the effect `effectId` of Scene `sceneId` replaced by `change` of it. */
const withEffect = (
  given: PlanJson,
  sceneId: string,
  effectId: string,
  change: (effect: PlanEffect) => PlanEffect
): PlanJson =>
  withScene(given, sceneId, (scene) => ({
    ...scene,
    effects: Arr.map(scene.effects, (effect) =>
      effect.id === effectId ? change(effect) : effect
    ),
  }));

describe("absoluteTimesNeedReason", () => {
  it.effect(
    "lists every absolute time with its reason as `info`, and flags none that has one",
    () =>
      Effect.gen(function* listed() {
        const found = absoluteTimesNeedReason(yield* plan);

        assert.deepStrictEqual(
          Arr.map(found, ({ rule, severity, sceneId }) => [
            rule,
            severity,
            sceneId,
          ]),
          [["absolute-time", "info", "three"]]
        );
        assert.include(
          found[0]?.message ?? "",
          'effect a1: absolute time 1s because "the beat of the music"'
        );
      })
  );

  it.effect("control: an absolute time whose reason is blank is an error", () =>
    Effect.gen(function* blank() {
      const broken = withEffect(yield* plan, "three", "a1", (effect) =>
        "absoluteFlicks" in effect.when
          ? { ...effect, when: { ...effect.when, reason: "  " } }
          : effect
      );

      const [found, ...rest] = absoluteTimesNeedReason(broken);

      assert.strictEqual(rest.length, 0);
      assert.strictEqual(found?.rule, "absolute-times-need-a-reason");
      assert.isUndefined(found?.severity);
      assert.include(found?.message ?? "", "absolute time 1s has no reason");
    })
  );
});

/** The plan of one Scene whose effects block is `lines`, built by the real importer (`b` is hidden: `r1` shows it). */
const withEffects = (lines: readonly string[]) =>
  buildPlan(
    Arr.join(
      [
        "Title: Events",
        "",
        "# Part",
        "",
        "INT. ONE #one#",
        "",
        "Box {id=a cell=tl class=box}",
        "Later {id=b cell=br class=label visible=false}",
        "",
        "[[effects",
        ...lines,
        "]]",
        "",
        "NARRATOR",
        "One two three four.",
        "",
      ],
      "\n"
    ),
    Str.repeat(32)("5a")
  );

const linesOf = (diagnostics: readonly { readonly line?: number }[]) =>
  Arr.map(diagnostics, ({ line }) => line);

describe("derivedEventsNeverUsed", () => {
  it.effect(
    "holds when every let is used by an effect, directly or through another let",
    () =>
      Effect.gen(function* used() {
        const given = yield* withEffects([
          '  let inner = word("two").end',
          "  let outer = inner +0.1s",
          "  r1: show b at outer",
        ]);

        assert.deepStrictEqual(derivedEventsNeverUsed(given), []);
      })
  );

  it.effect(
    "control: a let no effect uses is an error at its line, and so is a let only another unused let uses",
    () =>
      Effect.gen(function* unused() {
        const given = yield* withEffects([
          '  let spare = word("one").end',
          '  let inner = word("two").end',
          "  let outer = inner +0.1s",
          '  r1: show b at word("three").end',
        ]);

        const found = derivedEventsNeverUsed(given);

        assert.deepStrictEqual(linesOf(found), [11, 12, 13]);
        assert.deepStrictEqual(
          Arr.map(found, ({ rule }) => rule),
          Arr.replicate("derived-event-never-used", 3)
        );
        assert.include(
          found[0]?.message ?? "",
          'scene one: the derived event spare (word("one").end) is never used'
        );
      })
  );

  it.effect("control: a let used only in an until counts as used", () =>
    Effect.gen(function* untilUse() {
      const given = yield* withEffects([
        '  let done = word("three").end',
        '  f1: focus a at word("one").end until done',
        '  r1: show b at word("two").end',
      ]);

      assert.deepStrictEqual(derivedEventsNeverUsed(given), []);
    })
  );
});

describe("untilsOfTheirOwnFire", () => {
  it.effect(
    "holds for an until that comes after the event the effect fires at",
    () =>
      Effect.gen(function* later() {
        const given = yield* withEffects([
          '  f1: focus a at word("one").end until word("three").end',
          '  r1: show b at word("two").end',
        ]);

        assert.deepStrictEqual(untilsOfTheirOwnFire(given), []);
      })
  );

  it.effect(
    "control: an until that is the event the effect fires at is an error at the effect's line, also through a let",
    () =>
      Effect.gen(function* same() {
        const given = yield* withEffects([
          '  let t = word("one").end',
          '  f1: focus a at word("one").end until word("one").end',
          "  f2: focus a at t until t",
          '  r1: show b at word("two").end',
        ]);

        const found = untilsOfTheirOwnFire(given);

        assert.deepStrictEqual(linesOf(found), [12, 13]);
        assert.deepStrictEqual(
          Arr.map(found, ({ rule }) => rule),
          Arr.replicate("until-is-its-own-fire", 2)
        );
        assert.include(
          found[0]?.message ?? "",
          'scene one, effect f1: until word("one").end is the event it fires at'
        );
      })
  );
});

describe("lintPlan", () => {
  it.effect(
    "runs the Plan rules: the information of a valid Plan is its absolute times",
    () =>
      Effect.gen(function* all() {
        assert.deepStrictEqual(
          Arr.map(lintPlan(yield* plan), ({ rule }) => rule),
          ["absolute-time"]
        );
      })
  );

  it.effect(
    "control: lintPlan runs the event rules too, with the absolute times",
    () =>
      Effect.gen(function* events() {
        const given = yield* withEffects([
          '  let spare = word("one").end',
          '  f1: focus a at word("one").end until word("one").end',
          '  r1: show b at word("two").end',
        ]);

        assert.deepStrictEqual(
          Arr.map(lintPlan(given), ({ rule }) => rule),
          ["derived-event-never-used", "until-is-its-own-fire"]
        );
      })
  );
});
