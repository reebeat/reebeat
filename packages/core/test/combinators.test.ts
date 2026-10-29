// F3 of spec 0004: one marble fixture per combinator. A marble draws an event with one column per frame: `-` is a frame
// with nothing, a letter is an occurrence. The expected frames are written out as marbles by hand (fps 30); no code
// computed them. Inputs, from three words of a Line at frames 4, 8 and 14:
//
//   a      ----a---------
//   b      --------b-----
//   c      --------------c
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Option, Record, Result, String as Str } from "effect";

import {
  all,
  each,
  endsAfter,
  first,
  once,
  stagger,
  throttle,
  within,
} from "../src/combinators.ts";
import type { Event } from "../src/combinators.ts";
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

describe("all (SMIL endsync=all, forkJoin)", () => {
  it("happens at the last of the operands", () => {
    assert.deepStrictEqual(
      frames(all([a, b, c])),
      frames(marble("--------------c"))
    );
    assert.deepStrictEqual(
      frames(all([a, b])),
      frames(marble("--------b-----"))
    );
  });

  it("uses the LAST occurrence of an operand that has several", () => {
    assert.deepStrictEqual(
      frames(all([each([a, c]), b])),
      frames(marble("--------------c"))
    );
    assert.deepStrictEqual(
      frames(all([each([a, b]), a])),
      frames(marble("--------b-----"))
    );
  });

  it("never happens while one operand never does", () => {
    assert.deepStrictEqual(all([a, never]), []);
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
      ["pair", { kind: "all", of: [word("a"), word("b")] }],
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
