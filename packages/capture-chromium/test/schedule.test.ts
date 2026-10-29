// The capture schedule: which Reveal call runs at which frame, worked out from a Plan whose frames were set by hand
// (test/fixturePlan.ts). A pure function of the Plan; the measured lags it encodes are checked in capture.test.ts and
// lags.test.ts on a real Chromium.
import { assert, describe, it } from "@effect/vitest";
import type { TimedPlan } from "@reebeat/core";
import { stepsOf } from "@reebeat/core";
import { Array as Arr, Order } from "effect";

import {
  captureSchedule,
  capturedFps,
  sceneChangeLag,
  unsupportedRate,
} from "../src/captureSchedule.ts";
import { ended, fixture, sharedIds } from "./fixturePlan.ts";

/** The Timeline entries of an effect of the `ended` Plan, one for each instance. */
const timedOf = (effectId: string) =>
  Arr.filter(
    Arr.flatMap(ended.timeline.scenes, (scene) => scene.effects),
    (effect) => effect.effectId === effectId
  );

describe("captureSchedule", () => {
  it("commands each slide change `lag` frames before its slide frame and each fragment at its effect's command frame", () => {
    const { commands } = captureSchedule(fixture);

    assert.deepStrictEqual(
      Arr.map(commands, ({ frame, source }) => [frame, source]),
      [
        [46, "r1"],
        [81 - sceneChangeLag["auto-animate"], "sc2"],
        [118, "f1"],
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

  it("each show or focus command precedes its fire frame by one frame, and each slide change its slide frame by the measured lag (a fade 1 frame, a cut and an Auto-Animate 0)", () => {
    const plan = fixture;
    const { commands } = captureSchedule(plan);

    const fires = new Map(
      Arr.map(
        Arr.flatMap(plan.timeline.scenes, (scene) => scene.effects),
        (effect): [string, number] => [effect.effectId, effect.fireFrame]
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

      if (slide === undefined) {
        assert.strictEqual((fires.get(step.source) ?? 0) - step.frame, 1);
      } else {
        assert.strictEqual(
          slide - step.frame,
          transitions.get(step.source) === "default" ? 1 : 0
        );
      }
    }
  });

  it("gives a sound no command: it is mixed at its fire frame and changes no pixel", () => {
    const { commands } = captureSchedule(fixture);

    assert.deepStrictEqual(
      Arr.filter(commands, (step) => step.source === "p1"),
      []
    );
  });

  it("tells a sound from a step by the effect of its own Scene: two Scenes may both have an `x1`", () => {
    const steps = Arr.filter(
      captureSchedule(sharedIds).commands,
      (step) => step.source === "x1"
    );

    // The `x1` of sc1 is a pop (no command); the `x1` of sc2 is a focus (one command, one frame before its fire frame).
    const [second] = Arr.drop(sharedIds.timeline.scenes, 1);
    const focus = second?.effects[0];

    assert.deepStrictEqual(
      Arr.map(steps, ({ frame }) => frame),
      [focus?.commandFrame]
    );
  });

  it("never steps a fragment before its own slide change: an effect at the transition start is commanded with the slide", () => {
    const plan = fixture;

    const early: TimedPlan = {
      ...plan,
      timeline: {
        ...plan.timeline,
        scenes: Arr.map(plan.timeline.scenes, (scene) =>
          scene.sceneId === "sc2"
            ? {
                ...scene,
                effects: Arr.map(scene.effects, (effect) => ({
                  ...effect,
                  commandFrame: scene.slideFrame - 1,
                  fireFrame: scene.slideFrame,
                })),
              }
            : scene
        ),
      },
    };

    const steps = Arr.filter(
      captureSchedule(early).commands,
      (step) => step.source === "sc2" || step.source === "f1"
    );

    // One frame before its slide frame the step would run on the PREVIOUS slide: it runs after the slide change.
    assert.deepStrictEqual(
      Arr.map(steps, ({ frame, source }) => [frame, source]),
      [
        [81, "sc2"],
        [81, "f1"],
      ]
    );
  });

  describe("a focus ring that ends by its own `until`", () => {
    const [f1] = timedOf("f1");
    const [f2] = timedOf("f2");

    it("is commanded off at its end command frame, one frame before the ring's last frame", () => {
      assert.isDefined(f1);
      assert.strictEqual(f1?.endedBy, "until");
      assert.strictEqual(f1?.endCommandFrame, (f1?.endFrame ?? 0) - 1);

      assert.deepStrictEqual(
        Arr.map(
          Arr.filter(
            captureSchedule(ended).commands,
            ({ source }) => source === "f1"
          ),
          ({ edge, frame }) => [edge, frame]
        ),
        [
          ["start", f1?.commandFrame],
          ["end", f1?.endCommandFrame],
        ]
      );
    });

    it("commands a start before an end that falls in the same frame, in the order of `stepsOf`", () => {
      assert.strictEqual(f2?.commandFrame, f1?.endCommandFrame);

      const { commands } = captureSchedule(ended);

      assert.deepStrictEqual(
        Arr.map(commands, ({ edge, source }) => [source, edge]),
        Arr.flatMap(ended.scenes, (scene) =>
          Arr.map(stepsOf(ended, scene), ({ edge, effect }) => [
            effect.id,
            edge,
          ])
        )
      );

      assert.deepStrictEqual(
        Arr.map(
          Arr.filter(commands, ({ frame }) => frame === f2?.commandFrame),
          ({ edge, source }) => [source, edge]
        ),
        [
          ["f2", "start"],
          ["f1", "end"],
        ]
      );
    });

    it("gives every instance of a sound the same absence of a command", () => {
      assert.strictEqual(timedOf("p1").length, 2);
      assert.deepStrictEqual(
        Arr.filter(
          captureSchedule(ended).commands,
          ({ source }) => source === "p1"
        ),
        []
      );
    });
  });

  describe("unsupportedRate", () => {
    it("accepts the rate the lags were measured at and nothing else", () => {
      assert.isUndefined(unsupportedRate({ fps: capturedFps, ntsc: false }));
      assert.include(
        unsupportedRate({ fps: 24, ntsc: false }) ?? "",
        "settings.fps"
      );
      assert.include(
        unsupportedRate({ fps: 30, ntsc: true }) ?? "",
        "settings.ntsc"
      );
    });
  });
});
