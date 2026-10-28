// The pure parts: the table and exit code, the Plan comparison, the signal helpers.
import { assert, describe, it } from "@effect/vitest";
import { buildPlan } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import { synthClip } from "@reebeat/sounds-synth";
import { Array as Arr, Effect } from "effect";

import { exitCode, renderVerdicts } from "../src/index.ts";
import type { Verdict } from "../src/index.ts";
import { planDifference } from "../src/planDiff.ts";
import { withinOneFrame } from "../src/units.ts";
import { onsetIndex, withSilentLead } from "../src/wav.ts";
import { storyText } from "./support.ts";

const holds: Verdict = {
  detail: "all 2 Cues hold",
  id: "F1",
  measured: [["sc1.l1.c1 next offset (frames)", "0"]],
  status: "pass",
};

const broken: Verdict = {
  detail: "Line sc1.l1 starts +3 frames from its scheduled frame 30",
  id: "F8",
  measured: [["Lines checked", 2]],
  status: "fail",
};

const skipped: Verdict = {
  detail:
    "N/A (silent stand-in): build.json lists the narrator silent@1-standin",
  id: "F8",
  measured: [],
  status: "na",
};

describe("renderVerdicts and exitCode", () => {
  it("prints one row per falsifier with its measured values and a summary", () => {
    assert.strictEqual(
      renderVerdicts([holds, broken]),
      Arr.join(
        [
          "F1  PASS  all 2 Cues hold",
          "      sc1.l1.c1 next offset (frames): 0",
          "F8  FAIL  Line sc1.l1 starts +3 frames from its scheduled frame 30",
          "      Lines checked: 2",
          "1 of 2 falsifiers FAIL: F8",
          "",
        ],
        "\n"
      )
    );
    assert.strictEqual(
      renderVerdicts([holds]),
      "F1  PASS  all 2 Cues hold\n      sc1.l1.c1 next offset (frames): 0\n1 of 1 falsifiers hold\n"
    );
  });

  it("prints a not-applicable verdict as N/A with its reason, names it in the summary and does not fail", () => {
    assert.strictEqual(
      renderVerdicts([holds, skipped]),
      Arr.join(
        [
          "F1  PASS  all 2 Cues hold",
          "      sc1.l1.c1 next offset (frames): 0",
          "F8  N/A   N/A (silent stand-in): build.json lists the narrator silent@1-standin",
          "1 of 2 falsifiers hold; not applicable: F8",
          "",
        ],
        "\n"
      )
    );
    assert.strictEqual(exitCode([holds, skipped]), 0);
    assert.strictEqual(exitCode([broken, skipped]), 1);
  });

  it("exits 0 only when there is a verdict and none fails", () => {
    assert.strictEqual(exitCode([holds]), 0);
    assert.strictEqual(exitCode([holds, broken]), 1);
    assert.strictEqual(exitCode([]), 1);
  });
});

describe("planDifference", () => {
  it.effect(
    "is undefined for equal Plans and names the path of the first difference otherwise",
    () =>
      Effect.gen(function* differences() {
        const plan = yield* buildPlan(storyText, "0".repeat(64));
        const { scenes } = plan;
        const rest = Arr.drop(scenes, 1);

        assert.isUndefined(planDifference(plan, plan));

        const edited: PlanJson = {
          ...plan,
          scenes: Arr.map(scenes, (scene, sceneIndex) =>
            sceneIndex === 0
              ? {
                  ...scene,
                  lines: Arr.map(scene.lines, (line, lineIndex) =>
                    lineIndex === 0 ? { ...line, text: "changed" } : line
                  ),
                }
              : scene
          ),
        };

        assert.include(
          planDifference(plan, edited) ?? "",
          "scenes.sc1.lines.sc1.l1.text"
        );
        assert.include(
          planDifference({ ...plan, title: "Other" }, plan) ?? "",
          "title: plan.json has Other"
        );
        assert.include(
          planDifference({ ...plan, scenes: rest }, plan) ?? "",
          "scenes: plan.json has"
        );
      })
  );
});

describe("withinOneFrame", () => {
  it("holds at exactly one frame and a float's margin, and not beyond", () => {
    for (const frames of [0, 0.99, 1, -1, 1.0000005, -1.0000005]) {
      assert.isTrue(withinOneFrame(frames), String(frames));
    }

    for (const frames of [1.01, -1.01, 1.5, 1.9, 2]) {
      assert.isFalse(withinOneFrame(frames), String(frames));
    }
  });
});

describe("the signal helpers", () => {
  it("finds where a catalogue sound starts", () => {
    const { samples } = synthClip("pop");

    assert.strictEqual(samples.length, 8640);
    assert.isAtMost(onsetIndex(samples, 0.01), 96);
    assert.strictEqual(onsetIndex(new Float32Array(10), 0.01), 0);
  });

  it("puts silence before a clip", () => {
    const padded = withSilentLead(Float32Array.of(1, 1), 1);

    assert.strictEqual(padded.length, 48 + 2);
    assert.strictEqual(padded[47], 0);
    assert.strictEqual(padded[48], 1);
  });
});
