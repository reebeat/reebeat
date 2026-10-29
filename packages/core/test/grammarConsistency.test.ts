// F3 of spec 0002, the consistency half: the grammar that `grammar.ts` declares and the parser that reads it say the same
// thing.
//
//   1. Every production has examples, and each example is read by the parser as that production.
//   2. Sentences generated from the closed sets (each verb x each anchor kind x each offset unit, and every anchor
//      form once) parse AND resolve to a frame in a fixture Scene.
//   3. Every mutation of one token of a valid sentence (the `at` dropped; a verb, edge, event or unit misspelt) is
//      an error.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Order, Record, Result } from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import { parseEffectLine } from "../src/effects.ts";
import {
  absoluteUnit,
  anchorWords,
  keywords,
  offsetExamples,
  productions,
  sourceUnits,
} from "../src/grammar.ts";
import { edges, elementEvents, verbs } from "../src/plan.ts";
import type { Verb } from "../src/plan.ts";
import { schedule } from "../src/schedule.ts";
import { asText, evenlySpoken, fixtureSha256, lifecycle } from "./support.ts";

/** A story of two Scenes joined by Auto-Animate, with one `[[effects]]` block in the second. */
const storyOf = (effects: readonly string[], extra: readonly string[] = []) =>
  asText([
    "# P",
    "",
    "INT. ONE #one#",
    "",
    "Mover {id=m cell=tl class=box}",
    "Leaver {id=x cell=tr class=box}",
    "Changer {id=u cell=bl class=box}",
    "",
    "NARRATOR",
    "One two three.",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. TWO #two#",
    "",
    "Mover {id=m cell=mc class=box}",
    "Changer {id=u cell=bl class=accent}",
    "Arrival {id=e cell=br class=label}",
    "Note {id=h cell=tc class=label visible=false}",
    ...extra,
    "",
    "[[effects",
    `  r1: show h ${keywords.at} word("two").end`,
    ...effects,
    "]]",
    "",
    "NARRATOR",
    "One two three one four five six seven eight nine ten eleven twelve.",
    "",
  ]);

const arguments_ = { focus: "m", show: "k", sound: "pop" } as const;

/** The effect line `t1` that puts `when` (what follows `at`) on a verb. */
const lineFor = (verb: Verb, when: string): string =>
  `  t1: ${verb} ${arguments_[verb]} ${keywords.at} ${when}`;

const readErrors = (line: string): readonly unknown[] => {
  const read = parseEffectLine(line, 1);

  return Result.isFailure(read) ? [read.failure] : [];
};

const afterAt = (when: string): string => `x: sound pop ${keywords.at} ${when}`;

const [firstEdge] = edges;

describe("every production of the grammar has examples that the parser reads as that production", () => {
  /** How one example of each production is put into a line (or a story) that the parser reads. */
  const readers: Record<string, (example: string) => readonly unknown[]> = {
    absolute: (example) => readErrors(afterAt(example)),
    anchor: (example) => readErrors(afterAt(example)),
    block: (example) =>
      collectErrors(
        asText([
          "# P",
          "",
          "INT. ONE #one#",
          "",
          "Note {id=note cell=tc class=label visible=false}",
          "",
          example,
          "",
          "NARRATOR",
          "One two.",
          "",
        ])
      ),
    edge: (example) => readErrors(afterAt(`${anchorWords.scene}.${example}`)),
    event: (example) => readErrors(afterAt(`m.${example}.${firstEdge}`)),
    id: (example) =>
      readErrors(
        `${example}: sound pop ${keywords.at} ${anchorWords.scene}.${firstEdge}`
      ),
    line: (example) => readErrors(example),
    offset: (example) =>
      readErrors(afterAt(`${anchorWords.scene}.${firstEdge} ${example}`)),
    verb: (example) =>
      readErrors(
        `x: ${example} ${keywords.at} ${anchorWords.scene}.${firstEdge}`
      ),
    when: (example) => readErrors(afterAt(example)),
  };

  it("has a reader for each production and no other", () => {
    assert.deepStrictEqual(
      Arr.sort(
        Arr.map(productions, ({ name }) => name),
        Order.String
      ),
      Arr.sort(Record.keys(readers), Order.String)
    );
  });

  for (const production of productions) {
    it(`reads each example of ${production.name}`, () => {
      assert.isAbove(production.examples.length, 0, "at least one example");

      for (const example of production.examples) {
        assert.deepStrictEqual(
          readers[production.name]?.(example),
          [],
          `${production.name}: ${example}`
        );
      }
    });
  }

  it("has an example of every verb, edge, event and offset unit", () => {
    const examples = Arr.join(
      Arr.flatMap(productions, (production) => production.examples),
      "\n"
    );

    for (const word of [...verbs, ...edges, ...elementEvents]) {
      assert.include(examples, word);
    }

    assert.deepStrictEqual(
      Arr.filter(offsetExamples, (offset) => !examples.includes(offset)),
      []
    );
  });
});

/** One anchor form: its kind, its text, whether it has a window (a percent offset needs one), and the sign that keeps an offset inside. */
interface Form {
  readonly kind: string;
  readonly sign: "+" | "-";
  readonly text: string;
  readonly windowed: boolean;
}

const signOf = (edge: string): Form["sign"] => (edge === "end" ? "-" : "+");

/** The Elements of the fixture Scene, one per event: m moves, u updates, e enters, x exits (an instant, no window). */
const elementsOf = [
  { event: "move", id: "m" },
  { event: "update", id: "u" },
  { event: "enter", id: "e" },
  { event: "exit", id: "x" },
] as const;

const forms: readonly Form[] = [
  ...Arr.flatMap(edges, (edge): readonly Form[] => [
    {
      kind: anchorWords.word,
      sign: "+",
      text: `${anchorWords.word}("two").${edge}`,
      windowed: true,
    },
    {
      kind: anchorWords.word,
      sign: "+",
      text: `${anchorWords.word}("one", 2).${edge}`,
      windowed: true,
    },
    {
      kind: anchorWords.scene,
      sign: signOf(edge),
      text: `${anchorWords.scene}.${edge}`,
      windowed: false,
    },
    {
      kind: anchorWords.transition,
      sign: signOf(edge),
      text: `${anchorWords.transition}.${edge}`,
      windowed: true,
    },
    { kind: "effect", sign: "+", text: `r1.${edge}`, windowed: true },
  ]),
  {
    kind: anchorWords.transition,
    sign: "+",
    text: `${anchorWords.transition}.50%`,
    windowed: true,
  },
  ...Arr.flatMap(elementsOf, ({ event, id }) =>
    Arr.flatMap([...edges, "50%"], (point): readonly Form[] =>
      event === "exit" && point === "50%"
        ? []
        : [
            {
              kind: "element",
              sign: event === "exit" ? "+" : signOf(point),
              text: `${id}.${event}.${point}`,
              windowed: event !== "exit",
            },
          ]
    )
  ),
];

/** Whether the form resolves to the frame of the slide change, where a `show` or `focus` cannot be commanded without an offset. */
const atSlide = (form: Form): boolean =>
  form.text === `${anchorWords.scene}.${firstEdge}` ||
  form.text === `${anchorWords.transition}.${firstEdge}` ||
  form.text.includes(".exit.");

interface Sentence {
  readonly line: string;
  /** The unit token the sentence's offset is written in; none without an offset. */
  readonly unit: string | undefined;
  readonly verb: Verb;
}

const kinds = Arr.dedupe(Arr.map(forms, ({ kind }) => kind));

/** Every verb x anchor kind x offset unit (none included) once, the form of the kind rotating. */
const covering: readonly Sentence[] = Arr.flatMap(verbs, (verb, verbIndex) =>
  Arr.flatMap(kinds, (kind, kindIndex) =>
    Arr.flatMap([undefined, ...sourceUnits], (unit, unitIndex) => {
      const candidates = Arr.filter(
        forms,
        (form) =>
          form.kind === kind &&
          (unit?.stored !== "percent" || form.windowed) &&
          (unit !== undefined || verb === "sound" || !atSlide(form))
      );

      return Arr.map(
        Option.toArray(
          Arr.get(
            candidates,
            (verbIndex + kindIndex + unitIndex) % candidates.length
          )
        ),
        (form): Sentence => ({
          line: lineFor(
            verb,
            unit === undefined
              ? form.text
              : `${form.text} ${form.sign}${unit.stored === "percent" ? "10" : unit.example}${unit.token}`
          ),
          unit: unit?.token,
          verb,
        })
      );
    })
  )
);

/** Every anchor form once, with the verbs in turn; and an absolute time for each verb. */
const everyForm: readonly Sentence[] = [
  ...Arr.map(forms, (form, index): Sentence => {
    const rotated = verbs[index % verbs.length] ?? "sound";
    const verb = atSlide(form) ? "sound" : rotated;

    return { line: lineFor(verb, form.text), unit: undefined, verb };
  }),
  ...Arr.map(verbs, (verb): Sentence => ({
    line: lineFor(
      verb,
      `0.5${absoluteUnit.token} ${keywords.because} "a beat"`
    ),
    unit: undefined,
    verb,
  })),
];

const sentences = Arr.dedupeWith(
  [...covering, ...everyForm],
  (left, right) => left.line === right.line
);

/** The story with one sentence in its block (and the hidden Element a `show` needs). */
const withSentence = (sentence: { line: string; verb: Verb }) =>
  storyOf(
    [sentence.line],
    sentence.verb === "show"
      ? ["Hidden {id=k cell=ml class=label visible=false}"]
      : []
  );

describe("sentences generated from the closed sets", () => {
  it("are at most 200, and more than the verbs times the anchor kinds", () => {
    assert.isAtMost(sentences.length, 200);
    assert.isAbove(sentences.length, verbs.length * kinds.length);
  });

  it("have no error in the fixture Scene", () => {
    for (const sentence of sentences) {
      assert.deepStrictEqual(
        collectErrors(withSentence(sentence)),
        [],
        sentence.line
      );
    }
  });

  it.effect(
    "resolve to a frame, and the intent is the sentence as written",
    () =>
      Effect.gen(function* resolved() {
        for (const sentence of sentences) {
          const plan = yield* buildPlan(withSentence(sentence), fixtureSha256);

          const { timeline } = yield* schedule(
            plan,
            evenlySpoken(plan, 300),
            lifecycle
          );

          const timed = Option.getOrUndefined(
            Arr.findFirst(
              timeline?.scenes[1]?.effects ?? [],
              (effect) => effect.effectId === "t1"
            )
          );

          assert.isDefined(timed, sentence.line);
          assert.strictEqual(
            timed?.intent,
            sentence.line.split(` ${keywords.at} `)[1],
            sentence.line
          );
        }
      })
  );
});

/** Every one-token mutation of a sentence: the `at` dropped, then the verb, each edge, each event and the unit misspelt. */
const mutants = (sentence: Sentence): readonly string[] => {
  const { line } = sentence;

  return [
    line.replace(` ${keywords.at} `, " "),
    line.replace(`: ${sentence.verb} `, `: ${sentence.verb}x `),
    ...Arr.flatMap(edges, (edge) =>
      line.includes(`.${edge}`) ? [line.replace(`.${edge}`, `.${edge}x`)] : []
    ),
    ...Arr.flatMap(elementEvents, (event) =>
      line.includes(`.${event}.`)
        ? [line.replace(`.${event}.`, `.${event}x.`)]
        : []
    ),
    ...(sentence.unit === undefined ? [] : [`${line}x`]),
  ];
};

describe("a mutation of one token of a valid sentence", () => {
  it("is an error, for every sentence", () => {
    const all = Arr.flatMap(sentences, (sentence) =>
      Arr.map(mutants(sentence), (line) => ({ ...sentence, line }))
    );

    assert.isAbove(all.length, 150);

    for (const mutant of all) {
      assert.isAbove(
        collectErrors(withSentence(mutant)).length,
        0,
        mutant.line
      );
    }
  });
});
