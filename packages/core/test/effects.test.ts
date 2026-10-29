// The effects line (spec 0002, spec 0004): each form reads into the Plan's types, and what is written back reads into
// the same effect (the law: `parseEffectLine(formatEffect(effect))` is `effect`, with seconds stored as exact flicks).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Result } from "effect";

import { formatAnchor } from "../src/anchors.ts";
import { buildPlan } from "../src/build.ts";
import {
  formatEffect,
  formatLet,
  isLetLine,
  parseEffectLine,
  parseLetLine,
} from "../src/effects.ts";
import { formatEvent } from "../src/expr.ts";
import type { Anchor, Effect as PlanEffect, EventExpr } from "../src/plan.ts";
import { reviewText } from "../src/review.ts";
import { schedule } from "../src/schedule.ts";
import { asText, evenlySpoken, fixtureSha256, lifecycle } from "./support.ts";

const read = (text: string): PlanEffect => {
  const parsed = parseEffectLine(text, 3);

  if (Result.isFailure(parsed)) {
    assert.fail(`${text}: ${parsed.failure.message}`);
  }

  return parsed.success;
};

const failure = (text: string) => {
  const parsed = parseEffectLine(text, 3);

  return Result.isFailure(parsed) ? parsed.failure : undefined;
};

/** The event an effect is timed by; absolute times have none. */
const eventOf = (text: string): EventExpr | undefined => {
  const { when } = read(text);

  return "event" in when ? when.event : undefined;
};

const anchored = (anchor: Anchor): EventExpr => ({ anchor, kind: "anchor" });

/** `scene.end`: the first frame out of the Scene's `shown` state, one frame back (the alias declares the shift). */
const sceneEnd: EventExpr = {
  kind: "shift",
  of: anchored({
    event: "leave",
    kind: "occupancy",
    state: "shown",
    subject: { kind: "scene" },
  }),
  offset: { unit: "f", value: -1 },
};

/** Whether the word the effect line is timed by wrote its occurrence. */
const explicit = (text: string): boolean | undefined => {
  const event = eventOf(text);

  return event?.kind === "anchor" && event.anchor.kind === "word"
    ? event.anchor.explicit
    : undefined;
};

/** The canonical form of the event an effect line is timed by. */
const canonical = (text: string): string => {
  const found = eventOf(text);

  return found === undefined ? "" : formatEvent(found);
};

/** The flicks of one second (1/705,600,000 s each): the literal numbers below are written out, never computed. */
const secondInFlicks = 705_600_000;

describe("reading an effect line", () => {
  it("reads a sound at a word of the narration, with the occurrence and an offset in seconds as exact flicks", () => {
    assert.deepStrictEqual(
      read('s1: sound ding at word("big idea", 2).end +0.1s'),
      {
        id: "s1",
        line: 3,
        name: "ding",
        verb: "sound",
        when: {
          event: {
            kind: "shift",
            of: anchored({
              edge: "end",
              explicit: true,
              kind: "word",
              occurrence: 2,
              phrase: "big idea",
            }),
            offset: { unit: "flicks", value: 70_560_000 },
          },
        },
      }
    );
  });

  it("reads every kind of anchor: a word, an edge of a machine, a state event, and the aliases of the Scene", () => {
    assert.deepStrictEqual(
      Arr.map(
        [
          'a: sound pop at word("x").start',
          "a: sound pop at scene.end",
          "a: sound pop at scene.start",
          "a: sound pop at transition.50%",
          "a: sound pop at box.update.end",
          "a: sound pop at b.start",
          "a: sound pop at box.moving.leave",
          "a: sound pop at state(2).enter",
          "a: sound pop at beat(1).end",
          "a: sound pop at beat(1).50%",
        ],
        eventOf
      ),
      [
        anchored({
          edge: "start",
          explicit: false,
          kind: "word",
          occurrence: 1,
          phrase: "x",
        }),
        sceneEnd,
        anchored({
          event: "leave",
          kind: "occupancy",
          state: "before",
          subject: { kind: "scene" },
        }),
        anchored({
          at: { percent: 50 },
          kind: "edge",
          subject: { kind: "scene" },
          transition: "transition",
        }),
        anchored({
          at: "end",
          kind: "edge",
          subject: { id: "box", kind: "element" },
          transition: "update",
        }),
        anchored({
          at: "start",
          kind: "edge",
          subject: { id: "b", kind: "effect" },
          transition: "run",
        }),
        anchored({
          event: "leave",
          kind: "occupancy",
          state: "moving",
          subject: { id: "box", kind: "element" },
        }),
        anchored({
          event: "enter",
          kind: "occupancy",
          state: "dwell",
          subject: { kind: "state", n: 2 },
        }),
        anchored({
          at: "end",
          kind: "edge",
          subject: { kind: "beat", n: 1 },
          transition: "change",
        }),
        anchored({
          at: { percent: 50 },
          kind: "edge",
          subject: { kind: "beat", n: 1 },
          transition: "change",
        }),
      ]
    );
  });

  it("reads `N%` as the threshold of the progress behaviour: the two spellings are one anchor", () => {
    assert.deepStrictEqual(
      eventOf("a: sound pop at when(box.move.progress >= 50%)"),
      eventOf("a: sound pop at box.move.50%")
    );
  });

  it("reads an offset in each unit with its sign: seconds and milliseconds as flicks, frames, a percent", () => {
    const offsets = Arr.map(
      ["+0.1s", "-0.2s", "+250ms", "-3f", "+50%", "-12.5%", "+1.5s"],
      (offset) => {
        const event = eventOf(`a: sound pop at scene.start ${offset}`);

        return event?.kind === "shift" ? event.offset : undefined;
      }
    );

    assert.deepStrictEqual(offsets, [
      { unit: "flicks", value: 70_560_000 },
      { unit: "flicks", value: -141_120_000 },
      { unit: "flicks", value: 176_400_000 },
      { unit: "f", value: -3 },
      { unit: "percent", value: 50 },
      { unit: "percent", value: -12.5 },
      { unit: "flicks", value: 1_058_400_000 },
    ]);
  });

  it("reads the combinators, the options of each, and an until event", () => {
    const stagger = 211_680_000;

    assert.deepStrictEqual(
      read(
        'f1: focus box at each(word("a").end, settled, throttle=5f, stagger=0.3s) until first(word("b").start, scene.end)'
      ),
      {
        id: "f1",
        line: 3,
        target: "box",
        until: {
          event: {
            kind: "first",
            of: [
              anchored({
                edge: "start",
                explicit: false,
                kind: "word",
                occurrence: 1,
                phrase: "b",
              }),
              sceneEnd,
            ],
          },
        },
        verb: "focus",
        when: {
          event: {
            kind: "each",
            of: [
              anchored({
                edge: "end",
                explicit: false,
                kind: "word",
                occurrence: 1,
                phrase: "a",
              }),
              { kind: "ref", name: "settled" },
            ],
            stagger: { unit: "flicks", value: stagger },
            throttle: { unit: "f", value: 5 },
          },
        },
      }
    );
  });

  it("reads within as the occurrences of an event inside a State, and last as the last of its operands", () => {
    assert.deepStrictEqual(
      Arr.map(
        [
          'a: sound pop at within(word("x").end, state(2))',
          "a: sound pop at last(box.move.end, tag.update.end)",
        ],
        (text) => eventOf(text)?.kind
      ),
      ["within", "last"]
    );
  });

  it("reads an absolute time with its reason, in flicks", () => {
    assert.deepStrictEqual(
      read('a: sound pop at 12.5s because "the beat   drops here"').when,
      { absoluteFlicks: 12.5 * secondInFlicks, reason: "the beat drops here" }
    );
  });

  it("reads a let line as a derived event: the name, the line and the expression, with no text of its own", () => {
    assert.isTrue(isLetLine("  let settled   = last(a.end, b.end)"));
    assert.isFalse(isLetLine("s1: sound pop at a.end"));

    const parsed = parseLetLine("let settled   = last(a.end,  b.end)", 4);

    assert.isTrue(Result.isSuccess(parsed));
    assert.deepStrictEqual(
      Result.isSuccess(parsed)
        ? [
            parsed.success.name,
            parsed.success.line,
            formatEvent(parsed.success.event),
          ]
        : [],
      ["settled", 4, "last(a.end, b.end)"]
    );
  });

  it("marks whether a phrase wrote its occurrence", () => {
    assert.isTrue(explicit('a: sound pop at word("x", 1).end'));
    assert.isFalse(explicit('a: sound pop at word("x").end'));
  });

  it("refuses a percent above 100, an occurrence of 0, a phrase of nothing, and a percent on a point that is not a window", () => {
    assert.strictEqual(
      failure("a: sound pop at transition.101%")?._tag,
      "BadPercent"
    );
    assert.strictEqual(
      failure('a: sound pop at word("x", 0).end')?._tag,
      "BadEffect"
    );
    assert.strictEqual(
      failure('a: sound pop at word("").end')?._tag,
      "BadEffect"
    );
    assert.strictEqual(failure("a: sound pop at scene.50%")?._tag, "BadEffect");
    assert.strictEqual(
      failure("a: sound pop at when(box.move.progress >= 120%)")?._tag,
      "BadEffect"
    );
  });

  it("refuses an until on a sound or a show, and a combinator that is not one", () => {
    assert.strictEqual(
      failure("a: sound pop at scene.start until scene.end")?._tag,
      "BadEffect"
    );
    assert.strictEqual(
      failure("a: show box at scene.start until scene.end")?._tag,
      "BadEffect"
    );
    assert.strictEqual(
      failure('a: sound pop at alll(word("x").end, scene.end)')?._tag,
      "BadEffect"
    );
  });
});

describe("writing an effect line", () => {
  /** Lines in the canonical form: writing them back changes nothing. */
  const lines = [
    's1: sound whoosh at word("matches").end +100ms',
    's5: sound whoosh at word("matches", 1).end +100ms',
    "s6: sound ding at when(one.move.progress >= 50%)",
    'f1: focus hint at word("slides", 2).start -200ms',
    'f3: focus hint at word("slides").start -200ms until first(word("leaves").start, scene.end)',
    "r1: show note at transition.end -3f",
    "s3: sound pop at r1.end +50%",
    'a1: sound pop at 12.5s because "a reason"',
    "s4: sound pop at scene.end",
    "s7: sound pop at last(one.move.end, tag.update.end) +100ms",
    'f4: focus hint at each(word("a").end, word("b").end, throttle=5f, stagger=300ms)',
    'f5: focus hint at within(word("a").end, state(2))',
    "s8: sound pop at settled",
    "s9: sound pop at one.moving.leave",
    "s10: sound pop at beat(2).start",
  ];

  /** Spellings that are read and never kept: each is written back as the canonical form on the right. */
  const sugar: readonly (readonly [string, string])[] = [
    [
      's5: sound whoosh at word("matches", 1).end +0.1s',
      's5: sound whoosh at word("matches", 1).end +100ms',
    ],
    [
      "s2: sound ding at one.move.50%",
      "s2: sound ding at when(one.move.progress >= 50%)",
    ],
    [
      'f2: focus hint at word("slides", 2).start -0.2s',
      'f2: focus hint at word("slides", 2).start -200ms',
    ],
    [
      "s7: sound pop at last(one.move.end, tag.update.end) +0.1s",
      "s7: sound pop at last(one.move.end, tag.update.end) +100ms",
    ],
    [
      "s9: sound pop at one.move.50% +1f",
      "s9: sound pop at when(one.move.progress >= 50%) +1f",
    ],
    [
      'f4: focus hint at each(word("a").end, word("b").end, stagger=0.3s)',
      'f4: focus hint at each(word("a").end, word("b").end, stagger=300ms)',
    ],
  ];

  it("reads back what it writes, effect for effect (the law: parse(format(effect)) is the effect)", () => {
    for (const line of [...lines, ...Arr.map(sugar, ([written]) => written)]) {
      const effect = read(line);

      assert.deepStrictEqual(read(formatEffect(effect)), effect, line);
    }
  });

  it("writes the canonical form, which is a fixed point: the occurrence and the unit of the canonical form stay", () => {
    assert.deepStrictEqual(
      Arr.map(lines, (line) => formatEffect(read(line))),
      lines
    );
  });

  it("reads a sugar and keeps none of it: the effect has no text of its own", () => {
    for (const [written, canonicalLine] of sugar) {
      assert.strictEqual(formatEffect(read(written)), canonicalLine, written);
      assert.deepStrictEqual(read(written), read(canonicalLine), written);
    }
  });

  it("collapses whitespace: what the effect says is its expression, not its spaces", () => {
    assert.strictEqual(
      formatEffect(read('a: sound pop at   word("x  y", 2).end   -3f')),
      'a: sound pop at word("x y", 2).end -3f'
    );
  });

  it("writes an anchor on its own, through the aliases of the Scene", () => {
    const event = eventOf('a: sound pop at word("x y", 2).end -3f');
    const shifted = event?.kind === "shift" ? event.of : undefined;

    assert.strictEqual(
      shifted?.kind === "anchor" ? formatAnchor(shifted.anchor) : "",
      'word("x y", 2).end'
    );
    assert.deepStrictEqual(
      Arr.map(
        ["scene.end", "scene.start", "transition.50%", "box.update.end"],
        (path) => {
          const found = eventOf(`a: sound pop at ${path}`);

          if (found?.kind === "shift") {
            return formatEvent(found);
          }

          return found?.kind === "anchor" ? formatAnchor(found.anchor) : "";
        }
      ),
      ["scene.end", "scene.start", "transition.50%", "box.update.end"]
    );
    // The anchor on its own is the canonical path: `scene.end` is that moment moved by the frame its alias declares.
    const sceneEndEvent = eventOf("a: sound pop at scene.end");

    assert.strictEqual(
      sceneEndEvent?.kind === "shift" && sceneEndEvent.of.kind === "anchor"
        ? formatAnchor(sceneEndEvent.of.anchor)
        : "",
      "scene.shown.leave"
    );
  });

  it("writes an event in its canonical form: a percent is the threshold of the progress behaviour", () => {
    assert.strictEqual(
      canonical("a: sound pop at one.move.50% +2f"),
      "when(one.move.progress >= 50%) +2f"
    );
    assert.strictEqual(
      canonical("a: sound pop at last(one.move.50%, tag.update.end)"),
      "last(when(one.move.progress >= 50%), tag.update.end)"
    );
    assert.strictEqual(canonical("a: sound pop at scene.end"), "scene.end");
  });

  it("writes a let line back in the canonical form", () => {
    const parsed = parseLetLine("let settled   = last(a.end,  b.end)", 4);

    assert.strictEqual(
      Result.isSuccess(parsed) ? formatLet(parsed.success) : "",
      "let settled = last(a.end, b.end)"
    );
  });
});

const storyOf = (block: readonly string[]) =>
  asText([
    "# P",
    "",
    "INT. A #a#",
    "",
    "Box {id=b cell=mc class=box}",
    "Note {id=note cell=br class=label visible=false}",
    "",
    "[[effects",
    ...block,
    "]]",
    "",
    "NARRATOR",
    "Box one two three four five six seven eight nine ten.",
    "",
  ]);

describe("an effect line through a whole story", () => {
  const effects = [
    '  r1: show note at word("box", 1).end +0.1s',
    '  s1: sound pop at word("box", 1).end +100ms',
    '  s2: sound pop at word("box", 1).end +3f',
    '  s3: sound pop at word("box", 1).end -0.05s',
    '  s4: sound pop at word("box", 1).end +50%',
    "  s5: sound pop at r1.start -10%",
    '  s6: sound pop at 0.5s because "a beat"',
  ];

  /** What writing each effect back gives: the canonical form, derived from the expression (`+0.1s` is `+100ms`). */
  const canonicalRows = [
    '  r1: show note at word("box", 1).end +100ms',
    '  s1: sound pop at word("box", 1).end +100ms',
    '  s2: sound pop at word("box", 1).end +3f',
    '  s3: sound pop at word("box", 1).end -50ms',
    '  s4: sound pop at word("box", 1).end +50%',
    "  s5: sound pop at r1.start -10%",
    '  s6: sound pop at 0.5s because "a beat"',
  ];

  it.effect(
    "writing every effect back gives the canonical rows, the same Plan and the same review text",
    () =>
      Effect.gen(function* storyLevel() {
        const first = yield* buildPlan(storyOf(effects), fixtureSha256);

        const rewritten = Arr.map(
          first.scenes[0]?.effects ?? [],
          (effect) => `  ${formatEffect(effect)}`
        );

        assert.deepStrictEqual(rewritten, canonicalRows);

        const second = yield* buildPlan(storyOf(rewritten), fixtureSha256);

        assert.deepStrictEqual(second, first);
        assert.strictEqual(reviewText(second), reviewText(first));

        // The review text and the Timeline carry no text of their own: the canonical form is derived from the effect.
        assert.include(reviewText(first), 'word("box", 1).end +100ms');
        assert.notInclude(reviewText(first), "+0.1s");

        const timed = yield* schedule(
          first,
          evenlySpoken(first, 300),
          lifecycle
        );

        assert.include(
          reviewText(timed, { timing: true }),
          'word("box", 1).end +100ms  ->  frame'
        );
      })
  );
});
