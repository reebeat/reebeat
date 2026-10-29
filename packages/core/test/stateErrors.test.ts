// F8 of spec 0004: nonsense is a Plan error, and its message is a golden. Each case is one mutation of the story of
// `stateStories.ts` (after its two steps `r1` and `f1`): the importer reports exactly these errors, each with the tag,
// the line of the effects row it concerns, and the text an author reads (what was found, what was expected, the nearest
// valid form). The misspelt anchors (`box.glide.start`, `box.moving.start`, `scene.sta`) are goldens of `vocabulary.test.ts`.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { collectErrors } from "../src/build.ts";
import { scheduledAt, statesSource, stepRows } from "./stateStories.ts";
import { lineOf } from "./support.ts";

/** `[tag, the row the error is on, the message]`. */
type Expected = readonly [string, string, string];

interface Case {
  readonly errors: readonly Expected[];
  readonly name: string;
  readonly rows: readonly string[];
}

const cycleHint =
  "expected a chain that ends at a word, the scene, the transition or an Element event (a step cannot be timed by a State or a Beat it opens)";

const percentHint =
  "expected start or end, or a percent of a move, an update, a show, a focus, or the transition of a Scene that is not > CUT";

const manyHint =
  "expected first(...) or all(...) to pick one moment (only a sound runs once for each occurrence)";

const stateHint = (most: number, what: string): string =>
  `${what} in Scene main, which has at most ${most} (one State, and one more State and one Beat for each show or focus); expected a number from 1 to ${most}`;

const cases: readonly Case[] = [
  {
    errors: [
      [
        "UnknownReference",
        "x1: sound pop at nobody.move.start",
        'Element "nobody" is not in Scene main; expected box, tag, fresh, note or gone',
      ],
    ],
    name: "an Element that the Scene does not have",
    rows: ["x1: sound pop at nobody.move.start"],
  },
  {
    errors: [
      [
        "UnknownReference",
        'x1: sound pop at word("zzz").start',
        'word("zzz").start: the narration of Scene main has no "zzz"; expected words that the Lines of this Scene say',
      ],
    ],
    name: "a word that the narration does not say",
    rows: ['x1: sound pop at word("zzz").start'],
  },
  {
    errors: [
      [
        "UnknownReference",
        "x1: sound pop at x9.start",
        'effect "x9" is not in Scene main; expected r1, f1 or x1; did you mean x1?',
      ],
    ],
    name: "an effect that the Scene does not have",
    rows: ["x1: sound pop at x9.start"],
  },
  {
    errors: [
      [
        "UnknownReference",
        "x1: sound pop at ghost",
        'derived event "ghost" is not in Scene main; expected none',
      ],
    ],
    name: "a derived event that no let declares",
    rows: ["x1: sound pop at ghost"],
  },
  {
    errors: [
      [
        "EffectCycle",
        "let a = b",
        `effects and derived events wait for each other: a -> b -> a; ${cycleHint}`,
      ],
    ],
    name: "a cycle through two lets",
    rows: ["let a = b", "let b = a", "x1: sound pop at a"],
  },
  {
    errors: [
      [
        "EffectCycle",
        "x1: sound pop at x2.start",
        `effects and derived events wait for each other: x1 -> x2 -> x1; ${cycleHint}`,
      ],
    ],
    name: "a cycle through two effects",
    rows: ["x1: sound pop at x2.start", "x2: sound pop at x1.start"],
  },
  {
    errors: [
      [
        "EffectCycle",
        'let a = all(b, word("alpha").start)',
        `effects and derived events wait for each other: b -> a -> b; ${cycleHint}`,
      ],
    ],
    name: "a cycle through an all",
    rows: [
      'let a = all(b, word("alpha").start)',
      "let b = a",
      "x1: sound pop at b",
    ],
  },
  {
    errors: [
      [
        "EffectCycle",
        'f2: focus tag at word("alpha").start until f3.end',
        `effects and derived events wait for each other: f2 -> f3 -> f2; ${cycleHint}`,
      ],
    ],
    name: "a cycle through an until",
    rows: [
      'f2: focus tag at word("alpha").start until f3.end',
      "f3: focus fresh at f2.end",
    ],
  },
  {
    errors: [
      [
        "EffectCycle",
        "f2: focus tag at state(2).enter",
        `effects and derived events wait for each other: f2 -> f2; ${cycleHint}`,
      ],
    ],
    name: "a step timed by a State it opens",
    rows: ["f2: focus tag at state(2).enter"],
  },
  {
    errors: [
      [
        "EffectCycle",
        "f2: focus tag at beat(1).end",
        `effects and derived events wait for each other: f2 -> f2; ${cycleHint}`,
      ],
    ],
    name: "a step timed by a Beat it opens",
    rows: ["f2: focus tag at beat(1).end"],
  },
  {
    errors: [
      [
        "BadEffect",
        'f2: focus tag at each(word("alpha").start, word("echo").start)',
        `f2: each(word("alpha").start, word("echo").start) can happen 2 times, but a focus happens once; ${manyHint}`,
      ],
    ],
    name: "a focus that can fire twice",
    rows: ['f2: focus tag at each(word("alpha").start, word("echo").start)'],
  },
  {
    errors: [
      [
        "BadEffect",
        'r2: show note at each(word("alpha").start, word("echo").start)',
        `r2: each(word("alpha").start, word("echo").start) can happen 2 times, but a show happens once; ${manyHint}`,
      ],
      [
        "BadShow",
        'r2: show note at each(word("alpha").start, word("echo").start)',
        'Element "note" is shown twice (effects r1 and r2); expected one show effect for each visible=false Element',
      ],
    ],
    name: "a show that can fire twice (and shows an Element a second time)",
    rows: ['r2: show note at each(word("alpha").start, word("echo").start)'],
  },
  {
    errors: [
      [
        "BadPercent",
        "x1: sound pop at gone.exit.start +50%",
        `percent offset 50% on gone.exit.start, which has no window (it is an instant); ${percentHint}`,
      ],
    ],
    name: "a percent offset on an instant (an exit)",
    rows: ["x1: sound pop at gone.exit.start +50%"],
  },
  {
    errors: [
      [
        "BadPercent",
        "x1: sound pop at gone.exit.50%",
        `percent point 50% on gone.exit.50%, which has no window (it is an instant); ${percentHint}`,
      ],
    ],
    name: "a percent point on an instant",
    rows: ["x1: sound pop at gone.exit.50%"],
  },
  {
    errors: [
      [
        "BadPercent",
        "x1: sound pop at x0.start +50%",
        `percent offset 50% on x0.start, which has no window (it is an instant); ${percentHint}`,
      ],
    ],
    name: "a percent offset on a sound, which has no window",
    rows: [
      'x0: sound pop at word("alpha").start',
      "x1: sound pop at x0.start +50%",
    ],
  },
  {
    errors: [
      [
        "BadEffect",
        'x1: sound pop at word("alpha").start until word("hotel").start',
        "until on a sound, which plays to its own end; expected until only on focus",
      ],
    ],
    name: "an until on a sound",
    rows: ['x1: sound pop at word("alpha").start until word("hotel").start'],
  },
  {
    errors: [
      [
        "BadEffect",
        'r2: show note at word("alpha").start until word("hotel").start',
        "until on a show, which stays shown; expected until only on focus",
      ],
    ],
    name: "an until on a show",
    rows: ['r2: show note at word("alpha").start until word("hotel").start'],
  },
  {
    errors: [
      [
        "UnsupportedEdge",
        "x1: sound pop at x0.end",
        "x0.end: a sound has no end (it plays to its own end, which the plan does not know); use x0.start",
      ],
    ],
    name: "the end of a sound",
    rows: ['x0: sound pop at word("alpha").start', "x1: sound pop at x0.end"],
  },
  {
    errors: [
      [
        "UnknownReference",
        "x1: sound pop at state(9).enter",
        stateHint(3, "state(9)"),
      ],
    ],
    name: "a State beyond what the Scene can have",
    rows: ["x1: sound pop at state(9).enter"],
  },
  {
    errors: [
      [
        "UnknownReference",
        "x1: sound pop at beat(9).start",
        stateHint(2, "beat(9)"),
      ],
    ],
    name: "a Beat beyond what the Scene can have",
    rows: ["x1: sound pop at beat(9).start"],
  },
  {
    errors: [
      [
        "UnknownReference",
        'x1: sound pop at within(word("alpha").start, state(9))',
        stateHint(3, "state(9)"),
      ],
    ],
    name: "a within of a State beyond what the Scene can have",
    rows: ['x1: sound pop at within(word("alpha").start, state(9))'],
  },
  {
    errors: [
      [
        "AbsoluteNeedsReason",
        "x1: sound pop at 1s",
        'absolute time "1s" has no reason; expected at 1s because "<why this moment is fixed>"',
      ],
    ],
    name: "an absolute time without a reason",
    rows: ["x1: sound pop at 1s"],
  },
];

describe("nonsense is a Plan error with a message an author can act on", () => {
  for (const { errors, name, rows } of cases) {
    it(`reports ${name}`, () => {
      const source = statesSource([...stepRows, ...rows]);

      assert.deepStrictEqual(
        Arr.map(collectErrors(source), ({ _tag, line, message }) => [
          _tag,
          line,
          message,
        ]),
        Arr.map(errors, ([tag, row, message]) => [
          tag,
          lineOf(source, row),
          message,
        ])
      );
    });
  }

  it("has a case for every class of nonsense the spec names", () => {
    assert.sameMembers(
      Arr.dedupe(
        Arr.flatMap(cases, ({ errors }) => Arr.map(errors, ([tag]) => tag))
      ),
      [
        "AbsoluteNeedsReason",
        "BadEffect",
        "BadPercent",
        "BadShow",
        "EffectCycle",
        "UnknownReference",
        "UnsupportedEdge",
      ]
    );
  });

  it("reads the story with none of the mutations, so each error is the mutation's", () => {
    assert.deepStrictEqual(collectErrors(statesSource(stepRows)), []);
  });
});

describe("an event that can never happen is caught when the Scene is scheduled", () => {
  it.effect(
    "fails an effect whose event has no occurrence, naming the effect and its line",
    () =>
      Effect.gen(function* never() {
        const row = 'x2: sound pop at within(word("alpha").start, state(2))';
        const source = statesSource([...stepRows, row]);
        const error = yield* Effect.flip(scheduledAt(source));

        assert.strictEqual(error._tag, "UnresolvedAnchor");
        assert.strictEqual(
          error.message,
          `effect x2 (line ${lineOf(source, row)}) never fires: within(word("alpha").start, state(2)) has no occurrence in Scene main`
        );
      })
  );
});
