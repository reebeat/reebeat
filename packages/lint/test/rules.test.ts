// The lint rules, each with a control that shows the rule fails when the thing it guards is broken.
import { assert, describe, it } from "@effect/vitest";
import type { Effect as PlanEffect, PlanJson } from "@tsukuri/core";
import { Array as Arr, Effect } from "effect";

import {
  absoluteTimesNeedReason,
  contrast,
  contrastRatio,
  effectFragmentAgreement,
  lintPlan,
} from "../src/index.ts";
import type { Fragment } from "../src/index.ts";
import { plan } from "./support.ts";

/** The fragments a faithful Rendering of the Plan in `support.ts` shows, written out: one per show and focus. */
const faithful = (): readonly Fragment[] => [
  { effectId: "r1", sceneId: "one", target: "b", verb: "show" },
  { effectId: "f1", sceneId: "two", target: "a", verb: "focus" },
];

const places = (diagnostics: ReturnType<typeof effectFragmentAgreement>) =>
  Arr.map(diagnostics, ({ index, sceneId }) => [sceneId, index]);

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
          { effectId: "r1", sceneId: "one", target: "b", verb: "show" },
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

        const extra = [
          first,
          second,
          { effectId: "x", sceneId: "three", target: "c", verb: "show" },
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
        "absoluteMs" in effect.when
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
});
