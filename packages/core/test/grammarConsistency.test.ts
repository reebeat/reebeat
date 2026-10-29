// F3 of spec 0002 and F2 of spec 0004, the consistency half: the grammar that `grammar.ts` declares, the vocabulary that
// `machines.ts` generates and the parser that reads them say the same thing.
//
//   1. Every production has examples, and each example is read by the parser as that production.
//   2. Sentences generated from the closed sets and from `vocabulary` (each verb x each kind of anchor x each offset
//      unit, every spelling the machines generate once, the combinators) parse AND resolve to a frame in a fixture
//      Scene.
//   3. Every mutation of one token of a valid sentence (the `at` dropped; a verb, a word of an anchor or a unit
//      misspelt) is an error.
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Cause,
  Effect,
  Exit,
  Option,
  Order,
  Record,
  Result,
  String as Str,
} from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import {
  formatEffect,
  isLetLine,
  parseEffectLine,
  parseLetLine,
} from "../src/effects.ts";
import {
  absoluteUnit,
  anchorWords,
  combinatorWords,
  durationExamples,
  keywords,
  offsetExamples,
  optionWords,
  productions,
  sourceUnits,
} from "../src/grammar.ts";
import { aliases, percentToken, spelled, vocabulary } from "../src/machines.ts";
import type { Form, SubjectKind } from "../src/machines.ts";
import { edges, verbs } from "../src/plan.ts";
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

const failures = (read: Result.Result<unknown, unknown>): readonly unknown[] =>
  Result.isFailure(read) ? [read.failure] : [];

const readErrors = (line: string): readonly unknown[] =>
  failures(parseEffectLine(line, 1));

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
    duration: (example) =>
      readErrors(
        afterAt(
          `${combinatorWords.each}(word("one").end, word("two").end, ${optionWords.stagger}=${example})`
        )
      ),
    each: (example) => readErrors(afterAt(example)),
    effect: (example) => readErrors(example),
    event: (example) => readErrors(afterAt(example)),
    id: (example) =>
      readErrors(
        `${example}: sound pop ${keywords.at} ${anchorWords.scene}.${firstEdge}`
      ),
    let: (example) => failures(parseLetLine(example, 1)),
    line: (example) =>
      isLetLine(example)
        ? failures(parseLetLine(example, 1))
        : readErrors(example),
    offset: (example) =>
      readErrors(afterAt(`${anchorWords.scene}.${firstEdge} ${example}`)),
    term: (example) => readErrors(afterAt(example)),
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

  it("has an example of every verb, edge, combinator, option, keyword, offset unit and duration unit", () => {
    const examples = Arr.join(
      Arr.flatMap(productions, (production) => production.examples),
      "\n"
    );

    for (const word of [
      ...verbs,
      ...edges,
      ...Record.values(combinatorWords),
      ...Record.values(optionWords),
      keywords.until,
      keywords.let,
      keywords.because,
    ]) {
      assert.include(examples, word);
    }

    assert.deepStrictEqual(
      Arr.filter(
        [...offsetExamples, ...durationExamples],
        (unit) => !Str.includes(unit)(examples)
      ),
      []
    );
  });
});

/**
 * One anchor spelling of the fixture Scene: its kind of subject, its text, whether it has a window (a percent offset
 * needs one), the sign that keeps an offset inside the Scene, and whether it is the slide change itself (where a
 * `show` or `focus` cannot be commanded without an offset).
 */
interface Spelling {
  readonly atSlide: boolean;
  readonly kind: string;
  readonly sign: "+" | "-";
  readonly text: string;
  readonly windowed: boolean;
}

/**
 * The Element of the fixture Scene whose machines reach a state or take a transition: m moves, u updates, e enters, x
 * exits (an instant, no window).
 */
const elementHeads: Readonly<Record<string, string>> = {
  absent: "e",
  enter: "e",
  entering: "e",
  exit: "x",
  exiting: "x",
  move: "m",
  moving: "m",
  present: "e",
  steady: "u",
  still: "m",
  update: "u",
  updating: "u",
};

const nameOf = (form: Form): string =>
  form.kind === "state" ? form.state.name : form.transition.name;

/** The subject of the fixture Scene a form is written with: its Element, `r1`, the Scene, State 2 and Beat 1. */
const headFor = (form: Form): string => {
  const heads: Readonly<Record<SubjectKind, string>> = {
    beat: "beat(1)",
    effect: "r1",
    element: Option.getOrElse(
      Record.get(elementHeads, nameOf(form)),
      () => "m"
    ),
    scene: anchorWords.scene,
    state: "state(2)",
  };

  return heads[form.machine.subject];
};

const withPercent = (text: string): string =>
  Str.replace(percentToken, "50%")(text);

/** The spelling a form has in the fixture Scene; the behaviour of a transition is read inside `when(... >= 50%)`. */
const textOf = (form: Form): string =>
  form.kind === "progress"
    ? `${combinatorWords.when}(${spelled(headFor(form), form)} >= 50%)`
    : withPercent(spelled(headFor(form), form));

/** The other spellings the aliases give a form: `transition.50%` for `scene.transition.50%`, `scene.end`. */
const aliasTexts = (form: Form): readonly string[] => {
  const path = [headFor(form), ...form.tail];

  return Arr.flatMap(aliases, (alias) =>
    Arr.join(Arr.take(path, alias.for.length), ".") === Arr.join(alias.for, ".")
      ? [
          withPercent(
            Arr.join(
              [...alias.spelled, ...Arr.drop(path, alias.for.length)],
              "."
            )
          ),
        ]
      : []
  );
};

const nonProgress = Arr.filter(vocabulary, (form) => form.kind !== "progress");

/** An exit is an instant at the slide change: it has no window, so no percent of it and no progress to threshold. */
const isExitPercent = (form: Form): boolean =>
  form.kind !== "state" &&
  form.transition.name === "exit" &&
  (form.kind === "progress" || form.point === "percent");

/** The spelling a form has for the offsets: a window it has (an exit is an instant), where it stands in time. */
const spellingOf = (form: Form, text: string): Spelling => {
  const exit = form.kind === "edge" && form.transition.name === "exit";
  const { subject } = form.machine;

  // A state's enter is the Scene's first frame for the initial state; `scene.before.leave` is the slide change itself.
  const startsScene =
    form.kind === "state" &&
    ((form.event === "enter" && form.state.name === form.machine.initial) ||
      (subject === "scene" &&
        (form.state.name === "before" ||
          (form.state.name === "changing" && form.event === "enter"))));

  return {
    atSlide:
      exit ||
      startsScene ||
      (subject === "scene" && form.kind === "edge" && form.point === "start"),
    kind: subject,
    sign: !exit && Str.endsWith("end")(text) ? "-" : "+",
    text,
    windowed: form.kind === "edge" && !exit,
  };
};

/**
 * The spellings every verb may be put on with every offset unit: the edges of the Element, effect and Scene machines
 * (what the vocabulary generates, with the aliases), and the words of the narration. States and Beats are Moore and
 * Mealy outputs of the steps themselves, so only a `sound` may wait for them (see the next group).
 */
const forms: readonly Spelling[] = [
  ...Arr.flatMap(edges, (edge): readonly Spelling[] => [
    {
      atSlide: false,
      kind: anchorWords.word,
      sign: "+",
      text: `${anchorWords.word}("two").${edge}`,
      windowed: true,
    },
    {
      atSlide: false,
      kind: anchorWords.word,
      sign: "+",
      text: `${anchorWords.word}("one", 2).${edge}`,
      windowed: true,
    },
  ]),
  ...Arr.flatMap(nonProgress, (form): readonly Spelling[] => {
    const { subject } = form.machine;

    if (subject === "beat" || subject === "state") {
      return [];
    }

    return isExitPercent(form)
      ? []
      : [
          spellingOf(form, textOf(form)),
          ...Arr.map(aliasTexts(form), (text) => spellingOf(form, text)),
        ];
  }),
];

interface Sentence {
  /** The lines of the block before `t1` (derived events). */
  readonly lets: readonly string[];
  /** The text after `at`: the intent the Timeline prints back. */
  readonly timing: string;
  /** The unit token the sentence's offset is written in; none without an offset. */
  readonly unit: string | undefined;
  readonly verb: Verb;
}

const sentenceOf = (
  verb: Verb,
  timing: string,
  unit?: string,
  lets: readonly string[] = []
): Sentence => ({ lets, timing, unit, verb });

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
          (unit !== undefined || verb === "sound" || !form.atSlide)
      );

      return Arr.map(
        Option.toArray(
          Arr.get(
            candidates,
            (verbIndex + kindIndex + unitIndex) % candidates.length
          )
        ),
        (form): Sentence =>
          sentenceOf(
            verb,
            unit === undefined
              ? form.text
              : `${form.text} ${form.sign}${unit.stored === "percent" ? "10" : unit.example}${unit.token}`,
            unit?.token
          )
      );
    })
  )
);

/** Every spelling the machines generate (and the aliases of the Scene) once, as the event of a `sound`. */
const everySpelling: readonly Sentence[] = Arr.flatMap(
  Arr.filter(vocabulary, (form) => !isExitPercent(form)),
  (form: Form): readonly Sentence[] => [
    sentenceOf("sound", textOf(form)),
    ...(form.kind === "progress"
      ? []
      : Arr.map(aliasTexts(form), (text) => sentenceOf("sound", text))),
  ]
);

/** An absolute time for each verb, and each combinator over two sources of the Scene, with a `let` and an `until`. */
const composed: readonly Sentence[] = [
  ...Arr.map(verbs, (verb) =>
    sentenceOf(verb, `0.5${absoluteUnit.token} ${keywords.because} "a beat"`)
  ),
  sentenceOf(
    "sound",
    `${combinatorWords.last}(m.move.end, u.update.end) +0.1s`
  ),
  sentenceOf(
    "sound",
    `${combinatorWords.first}(${anchorWords.word}("two").end, ${anchorWords.scene}.end)`
  ),
  sentenceOf(
    "sound",
    `${combinatorWords.each}(${anchorWords.word}("two").end, ${anchorWords.word}("three").end, ${optionWords.stagger}=0.3s)`
  ),
  sentenceOf(
    "sound",
    `${combinatorWords.each}(${anchorWords.word}("two").end, ${anchorWords.word}("three").end, ${optionWords.throttle}=5f)`
  ),
  sentenceOf(
    "sound",
    `${combinatorWords.within}(${anchorWords.word}("three").end, ${anchorWords.state}(2))`
  ),
  sentenceOf("sound", "both +50ms", undefined, [
    `  ${keywords.let} both = ${combinatorWords.last}(m.move.end, u.update.end)`,
  ]),
  sentenceOf(
    "focus",
    `${anchorWords.word}("two").end ${keywords.until} ${combinatorWords.first}(${anchorWords.word}("three").start, ${anchorWords.scene}.end)`
  ),
];

const sentences = Arr.dedupeWith(
  [...covering, ...everySpelling, ...composed],
  (left, right) =>
    left.verb === right.verb &&
    left.timing === right.timing &&
    Arr.join(left.lets, "\n") === Arr.join(right.lets, "\n")
);

/** The story with a sentence in its block (and the hidden Element a `show` needs); `line` replaces `t1`. */
const withSentence = (sentence: Sentence, line?: string) =>
  storyOf(
    [...sentence.lets, line ?? lineFor(sentence.verb, sentence.timing)],
    sentence.verb === "show"
      ? ["Hidden {id=k cell=ml class=label visible=false}"]
      : []
  );

describe("sentences generated from the closed sets and from the machines", () => {
  it("are at most 300, more than the verbs times the anchor kinds, and cover every spelling of the vocabulary", () => {
    assert.isAtMost(sentences.length, 300);
    assert.isAbove(sentences.length, verbs.length * kinds.length);

    const timings = Arr.map(sentences, ({ timing }) => timing);

    for (const form of Arr.filter(
      vocabulary,
      (known) => !isExitPercent(known)
    )) {
      assert.include(timings, textOf(form), textOf(form));
    }
  });

  it("have no error in the fixture Scene", () => {
    for (const sentence of sentences) {
      assert.deepStrictEqual(
        collectErrors(withSentence(sentence)),
        [],
        sentence.timing
      );
    }
  });

  it.effect("resolve to a frame, for every instance", () =>
    Effect.gen(function* resolved() {
      for (const sentence of sentences) {
        const plan = yield* buildPlan(withSentence(sentence), fixtureSha256);

        const scheduled = yield* Effect.exit(
          schedule(plan, evenlySpoken(plan, 300), lifecycle)
        );

        if (Exit.isFailure(scheduled)) {
          assert.fail(`${sentence.timing}: ${Cause.pretty(scheduled.cause)}`);
        }

        assert.isAbove(
          Arr.filter(
            scheduled.value.timeline?.scenes[1]?.effects ?? [],
            (effect) => effect.effectId === "t1"
          ).length,
          0,
          sentence.timing
        );
      }
    })
  );

  it.effect(
    "write back as the canonical form, which reads as the same effect (a sugar is read, never kept)",
    () =>
      Effect.gen(function* canonicalForm() {
        for (const sentence of sentences) {
          const plan = yield* buildPlan(withSentence(sentence), fixtureSha256);

          const written = Arr.findFirst(
            plan.scenes[1]?.effects ?? [],
            (effect) => effect.id === "t1"
          );

          assert.isTrue(Option.isSome(written), sentence.timing);

          if (Option.isSome(written)) {
            const again = parseEffectLine(
              formatEffect(written.value),
              written.value.line
            );

            assert.deepStrictEqual(
              Result.isSuccess(again) ? again.success : undefined,
              written.value,
              sentence.timing
            );
          }
        }
      })
  );
});

/** The dotted path a sentence is timed by, when it is a plain anchor (not a call, not a word): its words. */
const pathOf = (timing: string): readonly string[] => {
  const first = Arr.headNonEmpty(Str.split(timing, " "));

  return /^[a-z0-9()]+(?:\.[a-z0-9()%]+)+$/u.test(first) &&
    !Str.startsWith(`${combinatorWords.when}(`)(first) &&
    !Str.startsWith(`${anchorWords.word}(`)(first)
    ? [first, ...Str.split(first, ".")]
    : [];
};

/** Every one-token mutation of a sentence: the `at` dropped, then the verb, each word of its anchor and the unit misspelt. */
const mutants = (sentence: Sentence): readonly string[] => {
  const line = lineFor(sentence.verb, sentence.timing);
  const [whole, ...words] = pathOf(sentence.timing);

  return [
    Str.replace(` ${keywords.at} `, " ")(line),
    Str.replace(`: ${sentence.verb} `, `: ${sentence.verb}x `)(line),
    ...Arr.map(words, (word, index) =>
      Str.replace(
        whole ?? "",
        Arr.join(
          Arr.map(words, (other, at) => (at === index ? `${other}x` : other)),
          "."
        )
      )(line)
    ),
    ...(sentence.unit === undefined ? [] : [`${line}x`]),
  ];
};

describe("a mutation of one token of a valid sentence", () => {
  it("is an error, for every sentence", () => {
    const all = Arr.flatMap(sentences, (sentence) =>
      Arr.map(mutants(sentence), (line) => ({ line, sentence }))
    );

    assert.isAbove(all.length, 250);

    for (const { line, sentence } of all) {
      assert.isAbove(
        collectErrors(withSentence(sentence, line)).length,
        0,
        line
      );
    }
  });
});
