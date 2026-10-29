// The capture schedule: which Reveal call runs at which frame, worked out from a Plan whose frames were set by hand
// (test/fixturePlan.ts). A pure function of the Plan; the measured lags it encodes are checked in capture.test.ts and
// lags.test.ts on a real Chromium.
import { assert, describe, it } from "@effect/vitest";
import type { TimedPlan } from "@reebeat/core";
import { Array as Arr, Order } from "effect";

import { captureSchedule, sceneChangeLag } from "../src/captureSchedule.ts";
import { fixture } from "./fixturePlan.ts";

const firstOf = <A>(items: readonly A[]): A => {
  const [first] = items;

  assert.isDefined(first);

  return first;
};

describe("captureSchedule", () => {
  it("commands each slide change `lag` frames before its slide frame and each fragment at its Cue's command frame", () => {
    const { commands } = captureSchedule(fixture);

    assert.deepStrictEqual(
      Arr.map(commands, ({ frame, source }) => [frame, source]),
      [
        [46, "sc1.l1.c1"],
        [65, "sc1.l1.c2"],
        [81 - sceneChangeLag["auto-animate"], "sc2"],
        [118, "sc2.l1.c1"],
        [156 - sceneChangeLag.cut, "sc3"],
      ]
    );
  });

  it("takes the viewport and the frame rate from the Plan's settings", () => {
    const plan = fixture;

    const wide: TimedPlan = {
      ...plan,
      settings: { ...plan.settings, height: 720, width: 1280 },
    };

    const schedule = captureSchedule(wide);

    assert.strictEqual(schedule.width, wide.settings.width);
    assert.strictEqual(schedule.height, wide.settings.height);
    assert.strictEqual(schedule.fps, wide.settings.fps);
  });

  it("is sorted, inside the Video, and has no command for the first Scene", () => {
    const schedule = captureSchedule(fixture);
    const frames = Arr.map(schedule.commands, (step) => step.frame);

    assert.deepStrictEqual(frames, Arr.sort(frames, Order.Number));
    assert.isTrue(
      Arr.every(frames, (frame) => frame >= 0 && frame < schedule.totalFrames)
    );
    assert.isFalse(
      Arr.some(schedule.commands, (step) => step.source === "sc1")
    );
  });

  it("each next or focus command precedes its fire frame by one frame, and each slide change its slide frame by the measured lag (a fade 1 frame, a cut and an Auto-Animate 0)", () => {
    const plan = fixture;
    const { commands } = captureSchedule(plan);

    const fires = new Map(
      Arr.map(
        Arr.flatMap(plan.timeline.scenes, (scene) =>
          Arr.flatMap(scene.lines, (line) => line.cues)
        ),
        (cue): [string, number] => [cue.cueId, cue.fireFrame]
      )
    );

    const slides = new Map(
      Arr.map(plan.timeline.scenes, (scene): [string, number] => [
        scene.sceneId,
        scene.slideFrame,
      ])
    );

    const transitions = new Map(
      Arr.map(plan.scenes, (scene): [string, string] => [
        scene.id,
        scene.transition,
      ])
    );

    for (const step of commands) {
      const slide = slides.get(step.source);

      if (slide === undefined && step.source !== "sc1.l1.c2") {
        assert.strictEqual((fires.get(step.source) ?? 0) - step.frame, 1);
      } else if (slide !== undefined) {
        assert.strictEqual(
          slide - step.frame,
          transitions.get(step.source) === "default" ? 1 : 0
        );
      }
    }
  });

  it("keeps fragment steps in Cue order: an sfx before a next is commanded no later than the next", () => {
    const plan = fixture;
    const first = firstOf(plan.timeline.scenes);
    const line = firstOf(first.lines);

    const swapped: TimedPlan = {
      ...plan,
      timeline: {
        ...plan.timeline,
        scenes: [
          {
            ...first,
            lines: [
              {
                ...line,
                cues: [
                  { commandFrame: 47, cueId: "sc1.l1.c2", fireFrame: 47 },
                  { commandFrame: 46, cueId: "sc1.l1.c1", fireFrame: 47 },
                ],
              },
            ],
          },
          ...Arr.drop(plan.timeline.scenes, 1),
        ],
      },
    };

    const steps = Arr.filter(
      captureSchedule(swapped).commands,
      (step) => step.command.kind === "stepFragment"
    );

    assert.deepStrictEqual(
      Arr.map(Arr.take(steps, 2), ({ frame, source }) => [frame, source]),
      [
        [46, "sc1.l1.c2"],
        [46, "sc1.l1.c1"],
      ]
    );
  });
});
