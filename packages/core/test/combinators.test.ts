// F3 of spec 0004: one marble fixture per combinator. A marble draws an event with one column per frame: `-` is a frame
// with nothing, a letter is an occurrence. The expected frames are written out as marbles by hand (fps 30); no code
// computed them. Inputs, from three words of a Line at frames 4, 8 and 14:
//
//   a      ----a---------
//   b      --------b-----
//   c      --------------c
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Option,
  Order,
  Record,
  Result,
  String as Str,
} from "effect";

import {
  each,
  endsAfter,
  first,
  last,
  once,
  stagger,
  throttle,
  within,
} from "../src/combinators.ts";
import type { Event, Occurrence } from "../src/combinators.ts";
import { evaluator } from "../src/evaluate.ts";
import type { Sources } from "../src/evaluate.ts";
import type { Duration, EventExpr } from "../src/plan.ts";

/** An event from a marble: a column for each frame, every character but `-` and `|` an occurrence. */
const marble = (drawing: string): Event =>
  Arr.flatMap(Str.split(drawing, ""), (character, frame) =>
    character === "-" || character === "|" ? [] : once(frame)
  );

const frames = (event: Event): readonly number[] =>
  Arr.map(event, ({ frame }) => frame);

const a = marble("----a---------");
const b = marble("--------b-----");
const c = marble("--------------c");
const never = marble("--------------");

describe("last (SMIL endsync=last, forkJoin)", () => {
  it("happens at the last of the operands", () => {
    assert.deepStrictEqual(
      frames(last([a, b, c])),
      frames(marble("--------------c"))
    );
    assert.deepStrictEqual(
      frames(last([a, b])),
      frames(marble("--------b-----"))
    );
  });

  it("uses the LAST occurrence of an operand that has several", () => {
    assert.deepStrictEqual(
      frames(last([each([a, c]), b])),
      frames(marble("--------------c"))
    );
    assert.deepStrictEqual(
      frames(last([each([a, b]), a])),
      frames(marble("--------b-----"))
    );
  });

  it("never happens while one operand never does", () => {
    assert.deepStrictEqual(last([a, never]), []);
  });
});

describe("first (SMIL endsync=first, race)", () => {
  it("happens at the earliest of the operands", () => {
    assert.deepStrictEqual(
      frames(first([c, b, a])),
      frames(marble("----a---------"))
    );
    assert.deepStrictEqual(
      frames(first([c, b])),
      frames(marble("--------b-----"))
    );
  });

  it("ignores an operand that never happens, and never happens when all of them never do", () => {
    assert.deepStrictEqual(
      frames(first([never, c])),
      frames(marble("--------------c"))
    );
    assert.deepStrictEqual(first([never, never]), []);
  });
});

describe("each (a begin-value list, merge)", () => {
  it("has every occurrence of every operand, in time order, a frame once", () => {
    assert.deepStrictEqual(
      frames(each([c, a, b])),
      frames(marble("----a---b-----c"))
    );
    assert.deepStrictEqual(
      frames(each([a, a])),
      frames(marble("----a---------"))
    );
  });
});

describe("within (scoping by a Beat)", () => {
  it("keeps the occurrences inside the window, both ends included", () => {
    const everything = each([a, b, c]);

    assert.deepStrictEqual(
      frames(within(everything, { end: 12, start: 6 })),
      frames(marble("--------b-----"))
    );
    assert.deepStrictEqual(
      frames(within(everything, { end: 14, start: 8 })),
      frames(marble("--------b-----c"))
    );
    assert.deepStrictEqual(within(everything, { end: 3, start: 0 }), []);
  });
});

describe("throttle (leading edge)", () => {
  const everything = each([a, b, c]);

  it("drops an occurrence closer than the gap to the last one kept", () => {
    // gap 5: b is 4 after a and goes; c is 10 after a and stays.
    assert.deepStrictEqual(
      frames(throttle(everything, 5)),
      frames(marble("----a---------c"))
    );
  });

  it("keeps an occurrence exactly one gap after the last kept one", () => {
    assert.deepStrictEqual(
      frames(throttle(everything, 4)),
      frames(marble("----a---b-----c"))
    );
  });
});

describe("stagger (no two closer than the gap, by delaying)", () => {
  it("moves each occurrence to at least one gap after the one before it", () => {
    // gap 6: a stays at 4, b 8 -> 10, c 14 -> 16.
    assert.deepStrictEqual(
      frames(stagger(each([a, b, c]), 6)),
      frames(marble("----a-----b-----c"))
    );
  });

  it("leaves occurrences that are far enough apart where they are", () => {
    assert.deepStrictEqual(
      frames(stagger(each([a, b, c]), 3)),
      frames(marble("----a---b-----c"))
    );
  });
});

describe("endsAfter (SMIL end value, takeUntil)", () => {
  it("ends at the first occurrence strictly after the beginning", () => {
    assert.deepStrictEqual(endsAfter(4, each([a, b, c]), 20), {
      frame: 8,
      interrupted: false,
    });
  });

  it("does not take an occurrence at or before the beginning", () => {
    assert.deepStrictEqual(endsAfter(8, each([a, b]), 20), {
      frame: 20,
      interrupted: true,
    });
    assert.deepStrictEqual(endsAfter(4, a, 20), {
      frame: 20,
      interrupted: true,
    });
  });

  it("is ended by the end of the Scene when the event comes after it or never", () => {
    assert.deepStrictEqual(
      endsAfter(4, marble("------------------------z"), 20),
      { frame: 20, interrupted: true }
    );
    assert.deepStrictEqual(endsAfter(4, [], 20), {
      frame: 20,
      interrupted: true,
    });
  });
});

const marbles: Readonly<Record<string, Event>> = { a, b, c };

/** Sources for expressions over three named words and State `1` from frame 6 to 12. */
const sources = (calls: string[]): Sources<string> => ({
  anchor: (anchor) => {
    calls.push(JSON.stringify(anchor));

    if (anchor.kind !== "word") {
      return Result.fail("only words here");
    }

    return Option.match(Record.get(marbles, anchor.phrase), {
      onNone: () => Result.fail(`no word ${anchor.phrase}`),
      onSome: (event) =>
        Result.succeed(
          Arr.map(event, (occurrence) => ({
            frame: occurrence.frame,
            window: { end: occurrence.frame + 10, start: occurrence.frame },
          }))
        ),
    });
  },
  emptyWindow: (what) => `empty window: ${what}`,
  frames: (flicks) => Math.round((30 * flicks) / 705_600_000),
  state: (n) =>
    n === 1
      ? Result.succeed({ end: 12, start: 6 })
      : Result.fail("no such state"),
  unresolved: (message) => message,
});

const word = (phrase: string): EventExpr => ({
  anchor: { edge: "end", explicit: false, kind: "word", occurrence: 1, phrase },
  kind: "anchor",
});

const group = (
  of: readonly EventExpr[],
  spacing: Duration | null = null,
  thinning: Duration | null = null
): EventExpr => ({ kind: "each", of, stagger: spacing, throttle: thinning });

const lets = new Map<string, EventExpr>();

const frameList = (
  expr: EventExpr,
  letLines: ReadonlyMap<string, EventExpr> = lets,
  calls: string[] = []
) => Result.map(evaluator(sources(calls), letLines)(expr), frames);

describe("an offset (a begin value plus or minus a time)", () => {
  it("moves every occurrence by frames or by milliseconds", () => {
    assert.deepStrictEqual(
      frameList({
        kind: "shift",
        of: group([word("a"), word("b")]),
        offset: { unit: "f", value: 2 },
      }),
      Result.succeed(frames(marble("------a---b-----")))
    );
    // 100 ms at 30 fps is 3 frames.
    assert.deepStrictEqual(
      frameList({
        kind: "shift",
        of: word("b"),
        offset: { unit: "flicks", value: 70_560_000 },
      }),
      Result.succeed(frames(marble("-----------b")))
    );
  });

  it("takes a percent of the window of EACH occurrence", () => {
    // the window of every word here is 10 frames, so +50% is 5 frames.
    assert.deepStrictEqual(
      frameList({
        kind: "shift",
        of: word("a"),
        offset: { unit: "percent", value: 50 },
      }),
      Result.succeed(frames(marble("---------a")))
    );
  });
});

describe("let (share): one evaluation, the same list everywhere", () => {
  it("evaluates the named event once however often it is used", () => {
    const calls: string[] = [];

    const named = new Map<string, EventExpr>([
      ["pair", { kind: "last", of: [word("a"), word("b")] }],
    ]);

    const result = frameList(
      group([
        { kind: "ref", name: "pair" },
        {
          kind: "shift",
          of: { kind: "ref", name: "pair" },
          offset: { unit: "f", value: 3 },
        },
      ]),
      named,
      calls
    );

    assert.deepStrictEqual(
      result,
      Result.succeed(frames(marble("--------b--b")))
    );
    assert.deepStrictEqual(calls.length, 2, "a and b were each asked for once");
  });

  it("reports a name that waits for itself", () => {
    const loop = new Map<string, EventExpr>([
      ["x", { kind: "first", of: [{ kind: "ref", name: "y" }] }],
      ["y", { kind: "ref", name: "x" }],
    ]);

    assert.deepStrictEqual(
      frameList({ kind: "ref", name: "x" }, loop),
      Result.fail('derived event "x" waits for itself')
    );
  });
});

describe("within and the combinators over expressions", () => {
  it("scopes an event to a State", () => {
    assert.deepStrictEqual(
      frameList({
        kind: "within",
        of: group([word("a"), word("b"), word("c")]),
        state: 1,
      }),
      Result.succeed(frames(marble("--------b")))
    );
  });

  it("applies throttle and then stagger to the merged group", () => {
    assert.deepStrictEqual(
      frameList(
        group(
          [word("a"), word("b"), word("c")],
          { unit: "f", value: 6 },
          { unit: "f", value: 3 }
        )
      ),
      Result.succeed(frames(marble("----a-----b-----c")))
    );
  });
});

// Simultaneous events and an `until` at an equal frame (spec 0004, the rule): occurrences of ONE event at the same frame
// are ONE occurrence, the first operand's window kept (an effect fires once for a moment; SMIL: equal times in a
// begin-value list are one begin; a reactive `merge` would keep both, the algebra does not), and an `until` ignores an
// occurrence at or before the fire frame. Each row is worked out by hand (the string is `frame[window start-end]` for
// each occurrence); each mutant breaks one rule and must fail exactly the rows that defend it.
type Operands = (operands: readonly Event[]) => Event;

interface Ended {
  readonly frame: number;
  readonly interrupted: boolean;
}

type Ends = (begin: number, ends: Event, fallback: number) => Ended;

interface Algebra {
  readonly each: Operands;
  readonly endsAfter: Ends;
  readonly first: Operands;
  readonly last: Operands;
}

const real: Algebra = { each, endsAfter, first, last };

const byFrame = Order.mapInput(Order.Number, ({ frame }: Occurrence) => frame);

/** The occurrences of the operands whose frame is the one `pick` chooses, ties kept (what the rule forbids). */
const keepingTies =
  (pick: (edgeFrames: readonly number[]) => number): Operands =>
  (operands) => {
    const edges = Arr.flatMap(operands, (operand) => Arr.take(operand, 1));
    const chosen = pick(Arr.map(edges, ({ frame }) => frame));

    return Arr.filter(edges, ({ frame }) => frame === chosen);
  };

const mutants: Readonly<Record<string, Algebra>> = {
  // `each` that keeps both occurrences of a frame.
  eachKeepsBoth: {
    ...real,
    each: (operands) => Arr.sort(Arr.flatten(operands), byFrame),
  },
  // `first` that keeps every operand that ties for the earliest frame.
  firstKeepsTies: {
    ...real,
    first: keepingTies((edgeFrames) => Math.min(...edgeFrames)),
  },
  // `last` that keeps every operand that ties for the latest frame (each operand's LAST occurrence).
  lastKeepsTies: {
    ...real,
    last: (operands) => {
      const lasts = Arr.flatMap(operands, (operand) =>
        Arr.takeRight(operand, 1)
      );

      const top = Math.max(...Arr.map(lasts, ({ frame }) => frame));

      return Arr.filter(lasts, ({ frame }) => frame === top);
    },
  },
  // an `until` that takes an occurrence at the fire frame as the end (the real rule, one frame earlier).
  untilTakesEqual: {
    ...real,
    endsAfter: (begin, ends, fallback) => endsAfter(begin - 1, ends, fallback),
  },
};

const show = (event: Event): string =>
  Arr.join(
    Arr.map(
      event,
      ({ frame, window }) => `${frame}[${window.start}-${window.end}]`
    ),
    " "
  );

const ended = (found: Ended): string =>
  `${found.frame}${found.interrupted ? " interrupted" : ""}`;

// Two words at frame 4 with different windows, and one at frame 8.
const p = once(4, { end: 6, start: 4 });
const q = once(4, { end: 10, start: 4 });
const r = once(8, { end: 8, start: 8 });
const twelve = once(12);

interface Row {
  readonly expected: string;
  /** The mutants that break this rule, so must fail this row. */
  readonly failsFor: readonly string[];
  readonly name: string;
  readonly run: (algebra: Algebra) => string;
}

const rows: readonly Row[] = [
  {
    expected: "4[4-6]",
    failsFor: ["eachKeepsBoth"],
    name: "each of two operands at one frame is one occurrence, with the first operand's window",
    run: (algebra) => show(algebra.each([p, q])),
  },
  {
    expected: "4[4-6] 8[8-8]",
    failsFor: ["eachKeepsBoth"],
    name: "each of simultaneous operands and a later one",
    run: (algebra) => show(algebra.each([p, q, r])),
  },
  {
    expected: "4[4-6]",
    failsFor: ["eachKeepsBoth"],
    name: "each of one operand twice",
    run: (algebra) => show(algebra.each([p, p])),
  },
  {
    expected: "4[4-6]",
    failsFor: ["lastKeepsTies"],
    name: "last of a tie gives that frame once",
    run: (algebra) => show(algebra.last([p, q])),
  },
  {
    expected: "8[8-8]",
    failsFor: [],
    name: "last with a later operand is that operand",
    run: (algebra) => show(algebra.last([p, q, r])),
  },
  {
    expected: "4[4-6]",
    failsFor: ["firstKeepsTies"],
    name: "first of a tie gives that frame once",
    run: (algebra) => show(algebra.first([p, q])),
  },
  {
    expected: "4[4-6]",
    failsFor: ["eachKeepsBoth"],
    name: "stagger does not push the second of two simultaneous operands away",
    run: (algebra) => show(stagger(algebra.each([p, q]), 3)),
  },
  {
    expected: "4[4-6]",
    failsFor: [],
    name: "throttle drops the second of two simultaneous operands (an equal frame is closer than any gap)",
    run: (algebra) => show(throttle(algebra.each([p, q]), 3)),
  },
  {
    expected: "12",
    failsFor: ["untilTakesEqual"],
    name: "until at the fire frame is ignored: the next occurrence ends it",
    run: (algebra) =>
      ended(algebra.endsAfter(4, algebra.each([p, twelve]), 20)),
  },
  {
    expected: "20 interrupted",
    failsFor: ["untilTakesEqual"],
    name: "until only at the fire frame is ignored: the end of the Scene interrupts",
    run: (algebra) => ended(algebra.endsAfter(4, p, 20)),
  },
  {
    expected: "5",
    failsFor: [],
    name: "until at the frame after the fire frame ends there",
    run: (algebra) => ended(algebra.endsAfter(4, once(5), 20)),
  },
  {
    expected: "20 interrupted",
    failsFor: [],
    name: "until before the fire frame is ignored",
    run: (algebra) => ended(algebra.endsAfter(4, once(2), 20)),
  },
];

describe("simultaneous events are one occurrence; an until ignores the fire frame", () => {
  for (const { expected, name, run } of rows) {
    it(name, () => {
      assert.strictEqual(run(real), expected);
    });
  }

  for (const [mutant, algebra] of Record.toEntries(mutants)) {
    it(`negative control: ${mutant} fails exactly the rows that defend its rule`, () => {
      assert.deepStrictEqual(
        Arr.map(
          Arr.filter(rows, ({ expected, run }) => run(algebra) !== expected),
          ({ name }) => name
        ),
        Arr.map(
          Arr.filter(rows, ({ failsFor }) => Arr.contains(failsFor, mutant)),
          ({ name }) => name
        )
      );
    });
  }

  it("gives an each of the same word twice, through the evaluator, one occurrence that stagger and throttle leave alone", () => {
    assert.deepStrictEqual(
      frameList(
        group(
          [word("a"), word("a")],
          { unit: "f", value: 6 },
          { unit: "f", value: 3 }
        )
      ),
      Result.succeed(frames(marble("----a")))
    );
  });
});
