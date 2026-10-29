// The schedule of spec 0004 (F3 to F5, F10), with every expected frame worked out by hand on the story of
// `stateStories.ts` (30 fps; the slide change into `main` runs 63 to 87, the Scene's last frame is 179; the words are
// alpha 93..102, bravo ..111, charlie ..120, delta ..129, echo ..138, foxtrot ..147, golf ..156, hotel ..165). Each probe
// is a `sound` at the event under test, so its instances are the occurrences of the event.
//
//   steps    r1 `show note` at charlie.end (120, a fade of 4 frames to 124) and f1 `focus box` at foxtrot.start (138):
//            Beat 1 is 120..124 and Beat 2 is 138..138, so State 1 holds 63..120, State 2 124..138, State 3 138..179.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Result } from "effect";

import { collectErrors } from "../src/build.ts";
import { parseEffectLine } from "../src/effects.ts";
import { stepsOf } from "../src/steps.ts";
import {
  firesOf,
  instancesOf,
  mainOf,
  scheduledAt,
  statesSource,
  stepRows,
} from "./stateStories.ts";

/** The `when` the parser reads from an effect line with `event` after `at`. */
const whenOf = (event: string) => {
  const parsed = parseEffectLine(`t: sound pop at ${event}`, 3);

  return Result.isSuccess(parsed) ? parsed.success.when : undefined;
};

/** `[id, the event as written after at, the frames of its instances]`. */
type Probe = readonly [string, string, readonly number[]];

const probesOf = (probes: readonly Probe[], steps: readonly string[]) =>
  Effect.gen(function* scheduledProbes() {
    const plan = yield* scheduledAt(
      statesSource([
        ...steps,
        ...Arr.map(probes, ([id, event]) => `${id}: sound pop at ${event}`),
      ])
    );

    return Arr.map(probes, ([id, event, frames]): Probe => [
      id,
      event,
      firesOf(plan, id).length === frames.length ? firesOf(plan, id) : [],
    ]);
  });

/** Asserts each probe's instances are the expected frames, naming the event that is wrong. */
const assertProbes = (
  probes: readonly Probe[],
  steps: readonly string[] = stepRows
) =>
  Effect.gen(function* checked() {
    const found = yield* probesOf(probes, steps);

    for (const [index, [, event, frames]] of found.entries()) {
      assert.deepStrictEqual(frames, probes[index]?.[2], event);
    }
  });

describe("combinators on real words", () => {
  it.effect("all is the last of its operands, first the earliest", () =>
    assertProbes([
      // bravo ends at 111 and delta starts at 120: all waits for both.
      ["a1", 'last(word("bravo").end, word("delta").start)', [120]],
      // golf starts at 147 and echo ends at 138: first is the earlier.
      ["a2", 'first(word("golf").start, word("echo").end)', [138]],
      // an Element's motion and a word: the move ends at 87, alpha starts at 93.
      ["a3", 'last(box.move.end, word("alpha").start)', [93]],
      ["a4", 'first(box.move.end, word("alpha").start)', [87]],
    ])
  );

  it.effect(
    "each keeps every occurrence, and stagger and throttle space or thin them",
    () =>
      assertProbes([
        // alpha 93, charlie 111, echo 129.
        [
          "e1",
          'each(word("alpha").start, word("charlie").start, word("echo").start)',
          [93, 111, 129],
        ],
        // stagger 20f: 93; max(111, 93 + 20) = 113; max(129, 113 + 20) = 133.
        [
          "e2",
          'each(word("alpha").start, word("charlie").start, word("echo").start, stagger=20f)',
          [93, 113, 133],
        ],
        // throttle 20f: 93 kept; 111 is 18 after it, dropped; 129 is 36 after it, kept.
        [
          "e3",
          'each(word("alpha").start, word("charlie").start, word("echo").start, throttle=20f)',
          [93, 129],
        ],
        // both: throttle first ([93, 129]), then stagger 40f: 93; max(129, 93 + 40) = 133.
        [
          "e4",
          'each(word("alpha").start, word("charlie").start, word("echo").start, throttle=20f, stagger=40f)',
          [93, 133],
        ],
        // a gap in seconds: 0.5 s is 15 frames, so the 18 frames from alpha to charlie keep it.
        [
          "e5",
          'each(word("alpha").start, word("charlie").start, throttle=0.5s)',
          [93, 111],
        ],
      ])
  );

  it.effect(
    "within keeps the occurrences inside the dwell of a State, both ends included",
    () =>
      assertProbes([
        // State 1 is 63..120, State 2 is 124..138, State 3 is 138..179.
        [
          "w1",
          'within(each(word("alpha").start, word("echo").start, word("hotel").start), state(1))',
          [93],
        ],
        [
          "w2",
          'within(each(word("alpha").start, word("echo").start, word("hotel").start), state(2))',
          [129],
        ],
        [
          "w3",
          'within(each(word("alpha").start, word("echo").start, word("hotel").start), state(3))',
          [156],
        ],
        // foxtrot starts at 138, the first frame of State 3 (and the last of State 2): it is in both.
        [
          "w4",
          'within(each(word("delta").start, word("foxtrot").start, word("golf").start), state(3))',
          [138, 147],
        ],
        [
          "w5",
          'within(each(word("delta").start, word("foxtrot").start, word("golf").start), state(2))',
          [138],
        ],
      ])
  );

  it.effect("an offset moves every occurrence, in time or in frames", () =>
    assertProbes([
      // +0.1s is 70,560,000 flicks: 3 frames at 30 fps. -2f is two output frames.
      ["o1", 'word("alpha").start +0.1s', [96]],
      ["o2", 'each(word("alpha").start, word("echo").start) -2f', [91, 127]],
      // +50% of delta, which is 120 to 129: 120 + round(4.5) = 125 (a half goes to the later frame).
      ["o3", 'word("delta").start +50%', [125]],
    ])
  );
});

describe("a derived event is evaluated once and used wherever it is named", () => {
  it.effect(
    "gives a let the same frames at each use, and lists them in the Scene",
    () =>
      Effect.gen(function* twice() {
        const plan = yield* scheduledAt(
          statesSource([
            ...stepRows,
            "let settle = last(box.move.50%, fresh.enter.end)",
            'let marks = each(word("alpha").start, word("echo").start)',
            "l1: sound pop at settle",
            "l2: sound pop at settle +0.1s",
            "l3: sound pop at marks",
            "l4: sound pop at marks +2f",
          ])
        );

        // box.move.50% is 71 and fresh.enter.end is 85: settle is 85.
        assert.deepStrictEqual(firesOf(plan, "l1"), [85]);
        assert.deepStrictEqual(firesOf(plan, "l2"), [88]);
        assert.deepStrictEqual(firesOf(plan, "l3"), [93, 129]);
        assert.deepStrictEqual(firesOf(plan, "l4"), [95, 131]);
        assert.deepStrictEqual(
          Arr.map(mainOf(plan).events, ({ frames, name }) => [name, frames]),
          [
            ["settle", [85]],
            ["marks", [93, 129]],
          ]
        );
      })
  );
});

describe("a threshold event and the percent spelling of 0002 mean the same", () => {
  it.effect("puts when(... progress >= N%) where N% put it", () =>
    assertProbes([
      // box moves 65..87 by the declared ease: 50 percent of the progress is 29.33 percent of the time, 65 + 6 = 71.
      ["t1", "box.move.50%", [71]],
      ["t2", "when(box.move.progress >= 50%)", [71]],
      ["t3", "when(box.move.progress >= 0%)", [65]],
      ["t4", "when(box.move.progress >= 100%)", [87]],
      ["t5", "tag.update.50%", [71]],
      ["t6", "when(tag.update.progress >= 50%)", [71]],
      // the slide change is linear in time: 63 + 12.
      ["t7", "transition.50%", [75]],
      ["t8", "when(scene.transition.progress >= 50%)", [75]],
      // a Beat is linear in time: 120 + 2.
      ["t9", "beat(1).50%", [122]],
      ["t10", "when(beat(1).progress >= 50%)", [122]],
      // a decimal percent is one token: 12.5 percent of the progress is 11.8 percent of the time, 65 + round(2.6) = 68 (as at 12 and 13 percent).
      ["d1", "box.move.12.5%", [68]],
      ["d2", "box.move.12%", [68]],
      ["d3", "box.move.13%", [68]],
      ["d4", "when(box.move.progress >= 12.5%)", [68]],
    ])
  );

  it("reads the sugar and the threshold as one event expression", () => {
    assert.isDefined(whenOf("box.move.50%"));
    assert.deepStrictEqual(
      whenOf("box.move.50%"),
      whenOf("when(box.move.progress >= 50%)")
    );
  });
});

describe("the spellings of 0002 and release 1 mean what they meant", () => {
  it.effect(
    "puts scene.end, transition.start, r1.end and the rest at the frames of their canonical spelling",
    () =>
      assertProbes([
        // scene.end is the last frame of the Scene, 179; scene.start the slide change, 63.
        ["k1", "scene.end", [179]],
        ["k2", "scene.shown.leave", [179]],
        ["k3", "scene.end -1f", [178]],
        ["k4", "scene.start", [63]],
        ["k5", "scene.before.leave", [63]],
        ["k6", "transition.start", [63]],
        ["k7", "scene.transition.start", [63]],
        ["k8", "transition.end", [87]],
        ["k9", "scene.transition.end", [87]],
        // r1.end is the end of the show's fade: 120 + 4.
        ["k10", "r1.end", [124]],
        ["k11", "r1.start", [120]],
        ["k12", "fresh.enter.start", [71]],
        ["k13", "gone.exit.start", [63]],
      ])
  );
});

describe("the machines' state events", () => {
  it.effect(
    "leaves a state when the machine does, and every state at the slide change",
    () =>
      assertProbes([
        ["m1", "box.moving.leave", [87]],
        ["m2", "box.moving.enter", [65]],
        ["m3", "r1.active.enter", [120]],
        ["m4", "r1.active.leave", [124]],
        ["m5", "scene.shown.leave", [179]],
        ["m6", "scene.shown.enter", [87]],
        // a state still held at the end of the Scene is left at its last frame.
        ["m7", "fresh.present.leave", [179]],
        ["m8", "r1.done.leave", [179]],
      ])
  );
});

describe("the Beats and the States of a Scene", () => {
  it.effect(
    "starts a Beat at the fire frame of its step and enters the next State at the Beat's end",
    () =>
      assertProbes([
        ["b1", "beat(1).start", [120]],
        ["b2", "beat(1).end", [124]],
        ["b3", "beat(2).start", [138]],
        ["b4", "beat(2).end", [138]],
        ["s1", "state(1).enter", [63]],
        ["s2", "state(1).leave", [120]],
        ["s3", "state(2).enter", [124]],
        ["s4", "state(2).leave", [138]],
        ["s5", "state(3).enter", [138]],
        ["s6", "state(3).leave", [179]],
      ])
  );

  it.effect(
    "makes one Beat of two steps that fire together, as long as the slower one",
    () =>
      Effect.gen(function* together() {
        const plan = yield* scheduledAt(
          statesSource([
            'r1: show note at word("charlie").end',
            'f1: focus box at word("charlie").end',
            "b1: sound pop at beat(1).start",
            "b2: sound pop at beat(1).end",
            "b3: sound pop at state(2).enter",
          ])
        );

        // the show fades for 4 frames, the focus is an instant: the Beat is 120..124.
        assert.deepStrictEqual(firesOf(plan, "b1"), [120]);
        assert.deepStrictEqual(firesOf(plan, "b2"), [124]);
        assert.deepStrictEqual(firesOf(plan, "b3"), [124]);
      })
  );

  it.effect(
    "has no Beat 2 where the steps fire together, though two steps could make one",
    () =>
      Effect.gen(function* missing() {
        const error = yield* Effect.flip(
          scheduledAt(
            statesSource([
              'r1: show note at word("charlie").end',
              'f1: focus box at word("charlie").end',
              "b1: sound pop at beat(2).start",
            ])
          )
        );

        assert.strictEqual(error._tag, "UnresolvedAnchor");
        assert.strictEqual(
          error.message,
          "beat(2) does not exist: Scene main has 1 Beat"
        );
      })
  );

  it.effect(
    "never enters a State before the one it follows, when a step fires inside the fade of the step before it",
    () =>
      assertProbes(
        [
          // r1 fades 120..124 (Beat 1); f2 fires at 120 + 2f = 122 inside it (Beat 2 is 122..122).
          // State 2 holds from the end of Beat 1 (124) to the start of Beat 2 (122), so it is only the instant 124.
          // State 3 enters at the later of the Beat ends (124 and 122): 124, not 122.
          ["v1", "beat(2).start", [122]],
          ["v2", "state(2).enter", [124]],
          ["v3", "state(2).leave", [124]],
          ["v4", "state(3).enter", [124]],
          ["v5", "state(3).leave", [179]],
        ],
        [
          'r1: show note at word("charlie").end',
          'f2: focus box at word("charlie").end +2f',
        ]
      )
  );
});

const untilRows = [
  'r1: show note at word("charlie").end',
  'u1: focus box at word("bravo").start until word("delta").start',
  'u2: focus tag at word("echo").start until word("echo").start',
  'u3: focus fresh at word("foxtrot").start until word("alpha").end',
  'u4: focus box at word("golf").start until word("hotel").end +1s',
  'u5: focus tag at word("alpha").start until each(word("alpha").start, word("charlie").start)',
  'f1: focus box at word("hotel").start',
  'z1: sound pop at each(word("alpha").start, word("charlie").start, word("echo").start)',
];

describe("until: the end of an effect with a window", () => {
  /** `[id, fire, command, end, ended by, end command]`. */
  const windows = [
    // fire 102; delta starts at 120, after it: the ring ends there, commanded one frame before.
    ["u1", 102, 101, 120, "until", 119],
    // echo starts at 129, the fire frame itself: an equal frame is not an end, and nothing later ends it.
    ["u2", 129, 128, 179, "slide-change", null],
    // alpha ends at 102, before the fire frame 138: never after it.
    ["u3", 138, 137, 179, "slide-change", null],
    // hotel ends at 165, and one second later is 195, after the Scene's last frame 179: the slide change ends it.
    ["u4", 147, 146, 179, "slide-change", null],
    // alpha starts at 93, the fire frame: ignored; charlie starts at 111.
    ["u5", 93, 92, 111, "until", 110],
    // no until: the ring is on until the slide change.
    ["f1", 156, 155, 179, "slide-change", null],
    // a show fades for 4 frames.
    ["r1", 120, 119, 124, "window", null],
  ] as const;

  it.effect(
    "ends at the first occurrence strictly after the fire frame, else at the slide change",
    () =>
      Effect.gen(function* ends() {
        const plan = yield* scheduledAt(statesSource(untilRows));

        for (const [id, fire, command, end, endedBy, endCommand] of windows) {
          const [timed] = instancesOf(plan, id);

          assert.deepStrictEqual(
            [
              timed?.fireFrame,
              timed?.commandFrame,
              timed?.endFrame,
              timed?.endedBy,
              timed?.endCommandFrame,
            ],
            [fire, command, end, endedBy, endCommand],
            id
          );
        }
      })
  );

  it.effect(
    "commands the ring off one frame before its last frame, and only when its own until ended it",
    () =>
      Effect.gen(function* commanded() {
        const plan = yield* scheduledAt(statesSource(untilRows));

        for (const timed of mainOf(plan).effects) {
          if (timed.endedBy === "until") {
            assert.strictEqual(
              timed.endCommandFrame,
              (timed.endFrame ?? 0) - 1
            );
          } else {
            assert.isNull(timed.endCommandFrame);
          }
        }
      })
  );

  it.effect(
    "gives the Deck an end step for each ring its own until ended, and none for one the slide change ended",
    () =>
      Effect.gen(function* steps() {
        const plan = yield* scheduledAt(statesSource(untilRows));
        const [, scene] = plan.scenes;

        assert.isDefined(scene);

        const found = scene === undefined ? [] : stepsOf(plan, scene);

        assert.deepStrictEqual(
          Arr.map(
            Arr.filter(found, ({ edge }) => edge === "end"),
            ({ effect, timed }) => [effect.id, timed?.endFrame]
          ),
          [
            ["u5", 111],
            ["u1", 120],
          ]
        );
        assert.deepStrictEqual(
          Arr.map(
            Arr.filter(found, ({ edge }) => edge === "start"),
            ({ effect }) => effect.id
          ),
          ["u5", "u1", "r1", "u2", "u3", "u4", "f1"]
        );
      })
  );
});

describe("several instances of one sound", () => {
  it.effect(
    "runs a sound once for each occurrence of its event, numbered from 1, with no window",
    () =>
      Effect.gen(function* instances() {
        const plan = yield* scheduledAt(statesSource(untilRows));

        assert.deepStrictEqual(
          Arr.map(instancesOf(plan, "z1"), (timed) => [
            timed.instance,
            timed.fireFrame,
            timed.commandFrame,
            timed.endFrame,
            timed.endedBy,
          ]),
          [
            [1, 93, 93, null, null],
            [2, 111, 111, null, null],
            [3, 129, 129, null, null],
          ]
        );
      })
  );
});

/** The `a1` and `a2` effects of a story in resolved order, with their fire frames. */
const order = (rows: readonly string[]) =>
  Effect.map(scheduledAt(statesSource(rows)), (plan) =>
    Arr.map(
      Arr.filter(mainOf(plan).effects, ({ effectId }) =>
        Arr.contains(["a1", "a2"], effectId)
      ),
      ({ effectId, fireFrame }) => [effectId, fireFrame]
    )
  );

describe("simultaneous events: one moment is one occurrence", () => {
  it.effect(
    "gives an each of two operands at one frame one sound instance, and two instances when the frames differ",
    () =>
      assertProbes([
        // alpha starts at 93: the same moment twice is one instance.
        ["c1", 'each(word("alpha").start, word("alpha").start)', [93]],
        // the control: alpha starts at 93 and ends at 102, two moments, two instances.
        ["c2", 'each(word("alpha").start, word("alpha").end)', [93, 102]],
        // last and first of operands that tie give that frame once.
        ["c3", 'last(word("echo").start, word("delta").end)', [129]],
        ["c4", 'first(word("echo").start, word("delta").end)', [129]],
        // a stagger does not push the second of two simultaneous operands away.
        [
          "c5",
          'each(word("alpha").start, word("alpha").start, stagger=20f)',
          [93],
        ],
      ])
  );

  it.effect(
    "fires two different effects at one frame both, in declaration order",
    () =>
      Effect.gen(function* together() {
        const ding = 'a2: sound ding at word("echo").start';
        const pop = 'a1: sound pop at word("echo").start';

        assert.deepStrictEqual(yield* order([...stepRows, pop, ding]), [
          ["a1", 129],
          ["a2", 129],
        ]);
        assert.deepStrictEqual(yield* order([...stepRows, ding, pop]), [
          ["a2", 129],
          ["a1", 129],
        ]);
      })
  );

  it.effect(
    "makes one Beat of two steps at one frame, in declaration order",
    () =>
      Effect.gen(function* oneBeat() {
        const plan = yield* scheduledAt(
          statesSource([
            'f2: focus tag at word("charlie").end',
            'r1: show note at word("charlie").end',
            "b1: sound pop at beat(1).start",
            "b2: sound pop at state(2).enter",
          ])
        );

        const [, scene] = plan.scenes;

        assert.isDefined(scene);
        assert.deepStrictEqual(
          scene === undefined
            ? []
            : Arr.map(stepsOf(plan, scene), ({ effect }) => effect.id),
          ["f2", "r1"]
        );
        // one Beat (120..124, the show's fade): its start is the shared fire frame, State 2 enters at its end.
        assert.deepStrictEqual(firesOf(plan, "b1"), [120]);
        assert.deepStrictEqual(firesOf(plan, "b2"), [124]);
      })
  );
});

describe("an until may name a State or a Beat: it is a window end and never changes a Beat", () => {
  it.effect(
    "ends a focus at a Beat of its own Scene, and at a State, with no cycle",
    () =>
      Effect.gen(function* untilBeat() {
        const rows = [
          ...stepRows,
          'u9: focus tag at word("alpha").start until beat(2).start',
          'u8: focus fresh at word("alpha").start +1f until state(2).enter',
        ];

        assert.deepStrictEqual(collectErrors(statesSource(rows)), []);

        const plan = yield* scheduledAt(statesSource(rows));

        // u9 and u8 fire at 93 and 94, so the Beats are 93, 94, 120 (r1) and 138 (f1): beat(2) starts at 94, state(2)
        // is entered at the end of Beat 1 (93, an instant).
        assert.deepStrictEqual(
          Arr.map(instancesOf(plan, "u9"), (timed) => [
            timed.endFrame,
            timed.endedBy,
          ]),
          [[94, "until"]]
        );
        assert.deepStrictEqual(
          Arr.map(instancesOf(plan, "u8"), (timed) => [
            timed.endFrame,
            timed.endedBy,
          ]),
          [[179, "slide-change"]]
        );
      })
  );

  it("still refuses a step that is timed by a State or a Beat of its own Scene", () => {
    assert.deepStrictEqual(
      Arr.map(
        collectErrors(
          statesSource([...stepRows, "f2: focus tag at beat(1).end"])
        ),
        ({ _tag }) => _tag
      ),
      ["EffectCycle"]
    );
  });
});
