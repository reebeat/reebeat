// Frame rates (spec 0004, Revisions "exact time; the frame rate is a render setting"). IR time is exact, a whole number
// of flicks (1/705,600,000 s); a frame exists only at the Plan's rate, by one rule: the nearest frame, a half going to
// the later one (`floor(t x rate + 1/2)`, in integers). Every expected number below is worked out by hand: a frame of
// 30 fps is 705,600,000 / 30 = 23,520,000 flicks, and half of it 11,760,000.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Order, Record, String as Str } from "effect";

import { decodePlan, encodePlan, fpsPresets } from "../src/plan.ts";
import type { PlanJson, Settings } from "../src/plan.ts";
import {
  flicksOfFrames,
  flicksOfMilliseconds,
  flicksOfSeconds,
  flicksPerSecond,
  framesOfFlicks,
  rateOf,
} from "../src/time.ts";
import { mainOf, scheduledAt, statesSource } from "./stateStories.ts";

type RateSetting = Pick<Settings, "fps" | "ntsc">;

/** `[rate, flicks, frame]`: the frame the flicks fall on. */
type Row = readonly [RateSetting, number, number];

const at = (fps: Settings["fps"], ntsc = false): RateSetting => ({ fps, ntsc });

const rows: readonly Row[] = [
  // 30 fps: a frame is 23,520,000 flicks; the half 11,760,000 goes to the later frame.
  [at(30), 0, 0],
  [at(30), 11_759_999, 0],
  [at(30), 11_760_000, 1],
  [at(30), 23_520_000, 1],
  [at(30), 35_279_999, 1],
  [at(30), 35_280_000, 2],
  [at(30), 705_600_000, 30],
  // before the start: the half goes toward the later frame, which is toward zero.
  [at(30), -11_759_999, 0],
  [at(30), -11_760_000, 0],
  [at(30), -11_760_001, -1],
  [at(30), -35_280_000, -1],
  [at(30), -35_280_001, -2],
  [at(30), -705_600_000, -30],
  // 24 fps: 29,400,000 flicks a frame.
  [at(24), 14_699_999, 0],
  [at(24), 14_700_000, 1],
  [at(24), 44_100_000, 2],
  [at(24), 705_600_000, 24],
  [at(24), -14_700_000, 0],
  [at(24), -14_700_001, -1],
  // (25 fps is refused: see the end of this file.)
  // 50 fps: 14,112,000.
  [at(50), 7_055_999, 0],
  [at(50), 7_056_000, 1],
  [at(50), 705_600_000, 50],
  // 60 fps: 11,760,000; a tenth of a second is exactly 6 frames.
  [at(60), 5_879_999, 0],
  [at(60), 5_880_000, 1],
  [at(60), 70_560_000, 6],
  [at(60), 705_600_000, 60],
  // NTSC: 30000/1001 fps is 23,543,520 flicks a frame; 1001 s is exactly 30,000 frames.
  [at(30, true), 11_771_759, 0],
  [at(30, true), 11_771_760, 1],
  [at(30, true), 705_600_000, 30],
  [at(30, true), 7_056_000_000, 300],
  [at(30, true), 70_560_000_000, 2997],
  [at(30, true), 706_305_600_000, 30_000],
  // NTSC: 24000/1001 fps is 29,429,400 flicks a frame.
  [at(24, true), 14_714_699, 0],
  [at(24, true), 14_714_700, 1],
  [at(24, true), 706_305_600_000, 24_000],
];

describe("the frame of an exact time", () => {
  it("is the nearest frame, a half to the later one, at every rate (positive and negative)", () => {
    for (const [setting, flicks, frame] of rows) {
      assert.strictEqual(
        framesOfFlicks(rateOf(setting), flicks),
        frame,
        `${setting.fps} fps${setting.ntsc ? " NTSC" : ""}, ${flicks} flicks`
      );
    }
  });

  it("is the rate as a fraction: the nominal rate, or the nominal rate times 1000/1001", () => {
    assert.deepStrictEqual(rateOf(at(30)), { den: 1, num: 30 });
    assert.deepStrictEqual(rateOf(at(30, true)), { den: 1001, num: 30_000 });
    assert.deepStrictEqual(rateOf(at(24, true)), { den: 1001, num: 24_000 });
  });
});

describe("flicks are exact", () => {
  it("divide evenly into one frame of every rate the engine names", () => {
    const frames: readonly (readonly [number, number])[] = [
      [24, 29_400_000],
      [25, 28_224_000],
      [30, 23_520_000],
      [48, 14_700_000],
      [50, 14_112_000],
      [60, 11_760_000],
      [120, 5_880_000],
    ];

    for (const [fps, flicks] of frames) {
      assert.strictEqual(flicksPerSecond % fps, 0, `${fps} fps`);
      assert.strictEqual(flicksPerSecond / fps, flicks, `${fps} fps`);
      assert.strictEqual(flicksOfFrames(fps, 1), flicks, `${fps} fps`);
    }
  });

  it("turn seconds, milliseconds and frames into whole numbers, with no float left over", () => {
    assert.strictEqual(flicksOfSeconds(0.1), 70_560_000);
    assert.strictEqual(flicksOfSeconds(0.0005), 352_800);
    assert.strictEqual(flicksOfSeconds(1 / 3), 235_200_000);
    assert.strictEqual(flicksOfMilliseconds(1), 705_600);
    assert.strictEqual(flicksOfMilliseconds(133), 93_844_800);
    assert.strictEqual(flicksOfFrames(24, 3), 88_200_000);
    assert.strictEqual(flicksOfFrames(60, 60), flicksPerSecond);
  });

  it("add without drift: ten tenths of a second are one second, which `0.1 * 10` in a float is not the way to say", () => {
    assert.strictEqual(
      Arr.reduce(
        Arr.makeBy(10, () => flicksOfSeconds(0.1)),
        0,
        (total, flicks) => total + flicks
      ),
      flicksPerSecond
    );
  });
});

/** What the story of the comparison says, with times only in seconds and milliseconds (a frame count would change with the rate). */
const story = statesSource([
  'r1: show note at word("charlie").end +0.1s',
  'f1: focus box at word("foxtrot").start until word("hotel").start',
  "let settled = last(box.move.end, fresh.enter.end)",
  'let words = each(word("alpha").start, word("echo").start, word("hotel").start)',
  "x1: sound pop at transition.start",
  "x2: sound pop at box.move.50%",
  "x3: sound pop at settled +0.1s",
  "x4: sound pop at words",
  "x5: sound pop at tag.update.start",
  "x6: sound pop at scene.end -0.2s",
  "x7: sound pop at fresh.enter.start",
  'x8: sound pop at word("delta").start +50%',
  "x9: sound pop at r1.end",
  "x10: sound pop at state(2).enter",
  "x11: sound ding at beat(1).50%",
  'x12: sound pop at 1.5s because "a fixed beat"',
  'x13: sound pop at each(word("alpha").start, word("bravo").start, stagger=0.5s)',
  'x14: sound pop at each(word("alpha").start, word("bravo").start, word("charlie").start, throttle=0.5s)',
]);

/** The seconds a frame is at a rate: frame x den / num. */
const seconds = (setting: RateSetting, frame: number): number => {
  const { den, num } = rateOf(setting);

  return (frame * den) / num;
};

const sampleOf = (
  setting: RateSetting,
  plan: PlanJson
): Readonly<Record<string, number>> => {
  const scene = mainOf(plan);

  return Record.fromEntries([
    ["scene.slide", seconds(setting, scene.slideFrame)],
    ["scene.end", seconds(setting, scene.endFrame)],
    ...Arr.flatMap(scene.effects, (timed) => [
      [
        `${timed.effectId}#${timed.instance}.fire`,
        seconds(setting, timed.fireFrame),
      ] as const,
      ...(timed.endFrame === null
        ? []
        : [
            [
              `${timed.effectId}#${timed.instance}.end`,
              seconds(setting, timed.endFrame),
            ] as const,
          ]),
    ]),
    ...Arr.flatMap(scene.events, (derived) =>
      Arr.map(
        derived.frames,
        (frame, index) =>
          [`${derived.name}[${index}]`, seconds(setting, frame)] as const
      )
    ),
  ]);
};

/** The `effect#instance` of every instance of the Scene, sorted. */
const countsAt = (plan: PlanJson) =>
  Arr.sort(
    Arr.map(
      mainOf(plan).effects,
      (timed) => `${timed.effectId}#${timed.instance}`
    ),
    Order.String
  );

describe("the same IR at two rates", () => {
  const reference = at(60);

  /**
   * Each quantity that makes an anchor (the end of the previous Scene, a Line's start, a word, an offset) is rounded on
   * its own to a frame, so a chain of them can drift by half a frame for each half it rounds up. At every rate the
   * engine allows, an anchor is within one frame of the coarser rate; 25 fps is refused (below) because its half-frame
   * quantities (0.5 s is 12.5 frames, 300 ms is 7.5) added up to 1.5 frames against 60 fps.
   */
  const settings: readonly RateSetting[] = [
    at(24),
    at(30),
    at(50),
    at(24, true),
    at(30, true),
  ];

  for (const setting of settings) {
    it.effect(
      `puts every anchor of every effect at the same time at ${setting.fps} fps${setting.ntsc ? " NTSC" : ""} as at 60 fps, within one frame of the coarser rate`,
      () =>
        Effect.gen(function* compared() {
          const coarse = sampleOf(setting, yield* scheduledAt(story, setting));

          const fine = sampleOf(
            reference,
            yield* scheduledAt(story, reference)
          );

          assert.sameMembers(Record.keys(coarse), Record.keys(fine));
          assert.isAbove(Record.keys(fine).length, 25);

          const bound = Math.max(seconds(setting, 1), seconds(reference, 1));

          for (const key of Record.keys(fine)) {
            const apart = Math.abs(
              (coarse[key] ?? Number.NaN) - (fine[key] ?? Number.NaN)
            );

            assert.isTrue(
              apart <= bound + 1e-9,
              `${key}: ${coarse[key]} s against ${fine[key]} s`
            );
          }
        })
    );
  }

  it.effect(
    "keeps the number of instances of every effect, whatever the rate",
    () =>
      Effect.gen(function* counted() {
        const at24 = countsAt(yield* scheduledAt(story, at(24)));
        const at60 = countsAt(yield* scheduledAt(story, at(60)));

        assert.deepStrictEqual(at24, at60);
        assert.include(at60, "x4#3");
        assert.notInclude(at60, "x4#4");
        assert.include(at60, "x13#2");
        assert.include(at60, "x14#2");
        assert.notInclude(at60, "x14#3");
      })
  );
});

/** The Plan of the story at `setting`, as the JSON text `decodePlan` reads. */
const planText = (setting: RateSetting) =>
  Effect.flatMap(scheduledAt(story, setting), encodePlan);

describe("a frame rate that is refused fails closed", () => {
  it.effect(
    "refuses fps 25 when a Plan is decoded, naming the rate, the allowed ones and spec 0005",
    () =>
      Effect.gen(function* refused() {
        const text = yield* planText(at(30));

        assert.include(text, '"fps": 30');

        const error = yield* Effect.flip(
          decodePlan(Str.replace('"fps": 30', '"fps": 25')(text))
        );

        assert.include(error.message, "settings.fps");
        assert.include(error.message, "24, 30, 50, 60");
        assert.include(error.message, "25 fps is refused");
        assert.include(error.message, "spec 0005");
      })
  );

  it.effect("refuses any other number the same way", () =>
    Effect.gen(function* refused() {
      const error = yield* Effect.flip(
        decodePlan(
          Str.replace('"fps": 30', '"fps": 29')(yield* planText(at(30)))
        )
      );

      assert.include(error.message, "spec 0005");
    })
  );

  it.effect(
    "still reads every rate that is allowed, NTSC included, and writes it back as it was",
    () =>
      Effect.forEach(
        [
          at(24),
          at(30),
          at(50),
          at(60),
          at(24, true),
          at(30, true),
          at(60, true),
        ],
        (setting) =>
          Effect.gen(function* allowed() {
            const text = yield* planText(setting);
            const decoded = yield* decodePlan(text);

            assert.deepStrictEqual(
              [decoded.settings.fps, decoded.settings.ntsc],
              [setting.fps, setting.ntsc]
            );
            assert.strictEqual(yield* encodePlan(decoded), text);
          })
      )
  );

  it("lists exactly the rates of the allowed set, 25 not among them", () => {
    assert.deepStrictEqual([...fpsPresets], [24, 30, 50, 60]);
  });
});
