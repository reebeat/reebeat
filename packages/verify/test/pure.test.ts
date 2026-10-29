// The pure parts: the table and exit code, the Plan comparison, the signal helpers.
import { assert, describe, it } from "@effect/vitest";
import {
  buildPlan,
  referenceLifecycle,
  requireTimeline,
  schedule,
} from "@reebeat/core";
import type { PlanJson, RendererLifecycle } from "@reebeat/core";
import { audioOffsetMs } from "@reebeat/encode-ffmpeg";
import { synthClip } from "@reebeat/sounds-synth";
import { Array as Arr, Effect, Option, String as Str } from "effect";

import { heardAs, judge } from "../src/effects.ts";
import { observationRange } from "../src/events.ts";
import { exitCode, renderVerdicts } from "../src/index.ts";
import type { Verdict } from "../src/index.ts";
import { planDifference } from "../src/planDiff.ts";
import { withinOneFrame } from "../src/units.ts";
import { locateSounds, onsetIndex, soundMatchFloor } from "../src/wav.ts";
import { cutStoryText, storyText } from "./support.ts";

const holds: Verdict = {
  detail: "all 2 effects hold",
  id: "F1",
  measured: [["sc1.r1 show b", "0"]],
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
          "F1  PASS  all 2 effects hold",
          "      sc1.r1 show b: 0",
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
      "F1  PASS  all 2 effects hold\n      sc1.r1 show b: 0\n1 of 1 falsifiers hold\n"
    );
  });

  it("prints a not-applicable verdict as N/A with its reason, names it in the summary and does not fail", () => {
    assert.strictEqual(
      renderVerdicts([holds, skipped]),
      Arr.join(
        [
          "F1  PASS  all 2 effects hold",
          "      sc1.r1 show b: 0",
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
        const plan = yield* buildPlan(storyText, Str.repeat(64)("0"));
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

/** A track of `length` samples with each clip added at its sample. */
const mixed = (
  length: number,
  parts: readonly { readonly at: number; readonly clip: Float32Array }[]
): Float32Array => {
  const track = new Float32Array(length);

  for (const { at, clip } of parts) {
    for (const [index, sample] of clip.entries()) {
      track[at + index] = (track[at + index] ?? 0) + sample;
    }
  }

  return track;
};

describe("the signal helpers", () => {
  it("does not find a sound that was left out of the mix: its best match is under the floor, and F1 says not found", () => {
    const rate = 48_000;
    const pop = synthClip("pop").samples;
    const ding = synthClip("ding").samples;

    // The mix has the pop at 1 s and no ding at 2 s, where the plan has one.
    const track = mixed(rate * 3, [{ at: rate, clip: pop }]);

    const [present, missing] = locateSounds(
      track,
      [
        { expectedMs: 1000, reference: pop },
        { expectedMs: 2000, reference: ding },
      ],
      150
    );

    assert.isAtLeast(present?.score ?? 0, soundMatchFloor);
    assert.isBelow(missing?.score ?? 1, soundMatchFloor);
    assert.isDefined(
      heardAs(present ?? { offsetMs: 0, score: 0 }, 30, 30).start
    );

    const heard = heardAs(missing ?? { offsetMs: 0, score: 1 }, 60, 30);

    assert.isUndefined(heard.start);
    assert.include(heard.reason, "the sound is not found within 150 ms");
  });

  it("finds where a catalogue sound starts", () => {
    const { samples } = synthClip("pop");

    assert.strictEqual(samples.length, 8640);
    assert.isAtMost(onsetIndex(samples, 0.01), 96);
    assert.strictEqual(onsetIndex(new Float32Array(10), 0.01), 0);
  });

  it("finds a ding under the tail of a whoosh by its amplitude, where normalised correlation takes its ringing for its start", () => {
    const rate = 48_000;
    const ding = synthClip("ding").samples;

    const track = mixed(rate * 2, [
      { at: 0, clip: synthClip("whoosh").samples },
      { at: Math.round(0.3 * rate), clip: ding },
    ]);

    const [found] = locateSounds(
      track,
      [{ expectedMs: 300, reference: ding }],
      150
    );

    const normalised = audioOffsetMs(track, ding, 300, 150);

    assert.approximately(found?.offsetMs ?? Number.NaN, 0, 0.1);
    assert.isAbove(found?.score ?? 0, 0.5);
    // The control: the normalised correlation is the one that goes wrong, which is why catalogue sounds are not found with it.
    assert.isAbove(Math.abs(normalised.offsetMs), 20);
  });

  it("finds a whoosh and the ding that sounds over its tail, each where it is, even when the plan puts them a frame off", () => {
    const rate = 48_000;
    const whoosh = synthClip("whoosh").samples;
    const ding = synthClip("ding").samples;
    const frame = rate / 30;

    const track = mixed(rate * 3, [
      { at: 20 * frame, clip: whoosh },
      { at: 28 * frame + 3, clip: ding },
    ]);

    // The plan says the whoosh at frame 21 and the ding at frame 27: one frame late and one early.
    const [first, second] = locateSounds(
      track,
      [
        { expectedMs: (21 * 1000) / 30, reference: whoosh },
        { expectedMs: (27 * 1000) / 30, reference: ding },
      ],
      150
    );

    assert.approximately(first?.offsetMs ?? Number.NaN, -1000 / 30, 0.1);
    assert.approximately(
      second?.offsetMs ?? Number.NaN,
      1000 / 30 + 3 / 48,
      0.1
    );
    assert.isAbove(Math.min(first?.score ?? 0, second?.score ?? 0), 0.9);
  });

  it("does not find a sound that is not in the track", () => {
    const quiet = new Float32Array(48_000);

    const [found] = locateSounds(
      quiet,
      [{ expectedMs: 500, reference: synthClip("pop").samples }],
      150
    );

    assert.strictEqual(found?.score, 0);
  });
});

describe("the anchor comparison of a sound anchored to a transition", () => {
  /**
   * The problems of the whoosh of the fixture story (`s1` of `sc2`, `transition.start`, resolved at frame 100) when
   * its sound starts `soundFrames` from frame 100 and the scene change into sc2 shows at `100 + change`.
   */
  const problemsOf = Effect.fn("problemsOf")(function* problems(
    soundFrames: number,
    change: number
  ) {
    const plan = yield* buildPlan(storyText, Str.repeat(64)("0"));
    const [, scene] = plan.scenes;
    const found = Arr.findFirst(scene?.effects ?? [], (one) => one.id === "s1");

    if (scene === undefined || Option.isNone(found)) {
      return yield* Effect.die("the fixture story has no whoosh s1 in sc2");
    }

    const timed = {
      commandFrame: 100,
      effectId: "s1",
      fireFrame: 100,
      intent: "transition.start",
    };

    return judge(
      {
        effect: found.value,
        scene,
        sceneIndex: 1,
        timed,
        timedScene: {
          effects: [timed],
          endFrame: 200,
          lines: [],
          sceneId: "sc2",
          slideFrame: 100,
        },
      },
      {
        end: 100 + soundFrames,
        reason: "",
        score: 1,
        start: 100 + soundFrames,
      },
      { frame: 100 + change, length: undefined, tag: "found" },
      30
    ).problems;
  });

  it.effect(
    "passes a sound 0.99 frame from its resolved frame and from the observed first changed frame, and fails 1.02 frames, on both sides and with the picture moved",
    () =>
      Effect.gen(function* boundary() {
        // The sound is where its effect says (0.99 frame late), the picture changes at the slide frame.
        assert.deepStrictEqual(yield* problemsOf(0.99, 0), []);
        assert.deepStrictEqual(yield* problemsOf(-0.99, 0), []);
        // The picture changes one frame late or early (F7 allows it): the sound is then a frame from the motion, no more.
        assert.deepStrictEqual(yield* problemsOf(0, 1), []);
        assert.deepStrictEqual(yield* problemsOf(0, -1), []);
        assert.deepStrictEqual(yield* problemsOf(0.01, 1), []);

        for (const [soundFrames, change, shown] of [
          [1.02, 0, "+1.02"],
          [-1.02, 0, "-1.02"],
          [-0.02, 1, "-1.02"],
          [0.02, -1, "+1.02"],
        ] as const) {
          const problems = yield* problemsOf(soundFrames, change);

          assert.include(
            Arr.join(problems, "\n"),
            `${shown} frames`,
            `${soundFrames} against a change at ${change}`
          );
        }
      })
  );
});

/** The fixture story spoken evenly, 300 ms a word, and scheduled against `lifecycle`. */
const timedWith = (lifecycle: RendererLifecycle, text: string = storyText) =>
  Effect.gen(function* timed() {
    const plan = yield* buildPlan(text, Str.repeat(64)("0"));

    const aligned = Arr.flatMap(plan.scenes, (scene) =>
      Arr.map(scene.lines, (line) => ({
        audio: { file: `${Str.repeat(64)("a")}.flac`, sha256: "x" },
        durationMs: line.words.length * 300,
        lineId: line.id,
        words: Arr.map(line.words, (w, at) => ({
          endMs: (at + 1) * 300,
          startMs: at * 300,
          w,
        })),
      }))
    );

    return yield* Effect.flatMap(
      schedule(plan, aligned, lifecycle),
      (scheduled) => Effect.fromResult(requireTimeline(scheduled))
    );
  });

const slow = (lifecycle: RendererLifecycle): RendererLifecycle => ({
  ...lifecycle,
  showMs: 1000,
  transitionMs: { ...lifecycle.transitionMs, default: 2000 },
});

describe("observationRange", () => {
  it.effect(
    "ends a step's window at the declared show time plus the margin, and follows a renderer that declares a longer show",
    () =>
      Effect.gen(function* step() {
        const plan = yield* timedWith(referenceLifecycle);

        const subject = {
          fireFrame: 40,
          id: "r1",
          kind: "step",
          sceneIndex: 0,
        } as const;

        // fps 30: the reference show lasts 133 ms = 4 frames; the margin is 10 frames.
        assert.deepStrictEqual(
          observationRange(plan, referenceLifecycle, subject),
          { from: 35, to: 54 }
        );
        // A renderer declaring a show of 1 s: 30 frames, so the window grows by 26 frames.
        assert.deepStrictEqual(
          observationRange(plan, slow(referenceLifecycle), subject),
          { from: 35, to: 80 }
        );
      })
  );

  it.effect(
    "ends a slide change's window at the longest of the Plan's transition and the declared one plus the margin",
    () =>
      Effect.gen(function* settle() {
        const plan = yield* timedWith(referenceLifecycle);
        const slide = plan.timeline.scenes[1]?.slideFrame ?? -1;
        const own = { kind: "transition", sceneIndex: 1 } as const;
        const last = plan.timeline.totalFrames - 1;

        // Scene two is `> AUTO-ANIMATE`: the Plan's 0.8 s is 24 frames; reveal's unmatched Elements end at 22.
        assert.strictEqual(
          observationRange(plan, referenceLifecycle, own).to,
          Math.min(last, slide + 24 + 10)
        );

        // The declared Auto-Animate may be longer than the Plan's 0.8 s only by being wrong (`schedule` refuses it), so
        // the window follows the declared lag of an unmatched Element instead.
        const late: RendererLifecycle = {
          ...referenceLifecycle,
          unmatched: { enter: { endLagFrames: 40, startLagFrames: 8 } },
        };

        assert.strictEqual(
          observationRange(plan, late, own).to,
          Math.min(last, slide + 40 + 10)
        );
      })
  );

  for (const { kind, sceneIndex, story } of [
    { kind: "default", sceneIndex: 0, story: storyText },
    { kind: "cut", sceneIndex: 1, story: cutStoryText },
  ] as const) {
    it.effect(
      `widens a ${kind} Scene's window to the declared ${kind} time: 2 s is 60 frames, plus the margin`,
      () =>
        Effect.gen(function* declaredLonger() {
          const declared: RendererLifecycle = {
            ...referenceLifecycle,
            transitionMs: { ...referenceLifecycle.transitionMs, [kind]: 2000 },
          };

          const plan = yield* timedWith(declared, story);
          const own = { kind: "transition", sceneIndex } as const;
          const slide = plan.timeline.scenes[sceneIndex]?.slideFrame ?? -1;
          const last = plan.timeline.totalFrames - 1;

          assert.strictEqual(plan.scenes[sceneIndex]?.transition, kind);
          assert.isAbove(
            last,
            slide + 70,
            "the Timeline is long enough to show it"
          );
          // 60 frames from the declaration beat the Plan's 24 and the lags.
          assert.strictEqual(
            observationRange(plan, declared, own).to,
            slide + 60 + 10
          );
          // The reference declares 400 ms (default) or none (cut): the Plan's 24 frames decide.
          assert.strictEqual(
            observationRange(plan, referenceLifecycle, own).to,
            slide + 24 + 10
          );
        })
    );
  }
});
