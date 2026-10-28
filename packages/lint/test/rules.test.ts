// The lint rules, each with a control that shows the rule fails when the thing it guards is broken.
import { assert, describe, it } from "@effect/vitest";
import { PlanJsonSchema, encodePlan } from "@reebeat/core";
import { Array as Arr, Effect, Exit, Schema } from "effect";

import {
  absoluteTimesNeedReason,
  contrast,
  contrastRatio,
  cueFragmentAgreement,
} from "../src/index.ts";
import type { Fragment } from "../src/index.ts";
import { plan } from "./support.ts";

/** The fragments a faithful Rendering of the Plan in `support.ts` shows, written out: one per Cue, in order. */
const faithful = (): readonly Fragment[] => [
  { arg: "", cueId: "sc1.l1.c1", kind: "next", sceneId: "sc1" },
  { arg: "a", cueId: "sc2.l1.c1", kind: "focus", sceneId: "sc2" },
  { arg: "pop", cueId: "sc2.l1.c2", kind: "sfx", sceneId: "sc2" },
  { arg: "ding", cueId: "sc3.l1.c1", kind: "sfx", sceneId: "sc3" },
];

const places = (diagnostics: ReturnType<typeof cueFragmentAgreement>) =>
  Arr.map(diagnostics, ({ index, sceneId }) => [sceneId, index]);

describe("cueFragmentAgreement", () => {
  it.effect("holds for the fragments of the Plan's own Cues", () =>
    Effect.gen(function* agrees() {
      const given = yield* plan;

      assert.strictEqual(faithful().length, 4);
      assert.deepStrictEqual(cueFragmentAgreement(given, faithful()), []);
    })
  );

  it.effect(
    "control: a missing fragment names the Scene, the position and the source line",
    () =>
      Effect.gen(function* missing() {
        const given = yield* plan;

        const fragments = Arr.filter(faithful(), ({ kind }) => kind !== "sfx");

        const diagnostics = cueFragmentAgreement(given, fragments);

        assert.deepStrictEqual(places(diagnostics), [
          ["sc2", 1],
          ["sc3", 0],
        ]);
        assert.strictEqual(diagnostics[0]?.rule, "cue-fragment-agreement");
        assert.include(
          diagnostics[0]?.message ?? "",
          "scene sc2, fragment 1: the Plan says sc2.l1.c2 (sfx: pop), the fragments have no fragment"
        );
        assert.isNumber(diagnostics[0]?.line);
      })
  );

  it.effect(
    "control: an extra, a swapped, a re-kinded and a re-argued fragment each fail at their position",
    () =>
      Effect.gen(function* broken() {
        const given = yield* plan;
        const all = faithful();

        const extra = [
          ...all,
          { arg: "", cueId: "sc3.l1.cX", kind: "next", sceneId: "sc3" },
        ];

        const [first, second, third, fourth] = all;

        assert.isDefined(first);
        assert.isDefined(second);
        assert.isDefined(third);
        assert.isDefined(fourth);

        const swapped = [first, third, second, fourth];
        const rekinded = [first, { ...second, kind: "sfx" }, third, fourth];
        const reargued = [first, second, { ...third, arg: "b" }, fourth];

        assert.deepStrictEqual(places(cueFragmentAgreement(given, extra)), [
          ["sc3", 1],
        ]);
        assert.deepStrictEqual(places(cueFragmentAgreement(given, swapped)), [
          ["sc2", 0],
        ]);
        assert.deepStrictEqual(places(cueFragmentAgreement(given, rekinded)), [
          ["sc2", 0],
        ]);
        assert.deepStrictEqual(places(cueFragmentAgreement(given, reargued)), [
          ["sc2", 1],
        ]);
      })
  );

  it.effect("reports every Scene that differs, once each", () =>
    Effect.gen(function* several() {
      const given = yield* plan;

      assert.deepStrictEqual(places(cueFragmentAgreement(given, [])), [
        ["sc1", 0],
        ["sc2", 0],
        ["sc3", 0],
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

describe("absoluteTimesNeedReason", () => {
  it.effect("returns no diagnostic for a valid Plan", () =>
    Effect.gen(function* none() {
      assert.deepStrictEqual(absoluteTimesNeedReason(yield* plan), []);
    })
  );

  it.effect(
    "holds because no absolute time is representable in the Plan schema: a Cue with `at` does not decode",
    () =>
      Effect.gen(function* unrepresentable() {
        const text = yield* Effect.flatMap(plan, encodePlan);

        const withAt = text.replaceAll(
          '"afterWord"',
          '"at": 1500, "afterWord"'
        );

        const decode = Schema.decodeUnknownEffect(
          Schema.fromJsonString(PlanJsonSchema),
          { onExcessProperty: "error" }
        );

        assert.notStrictEqual(withAt, text);
        assert.isTrue(Exit.isSuccess(yield* Effect.exit(decode(text))));
        assert.isTrue(Exit.isFailure(yield* Effect.exit(decode(withAt))));
      })
  );
});
