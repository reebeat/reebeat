// F2 of spec 0004: the vocabulary is the machines. The set of anchor spellings the parser accepts is the set
// `vocabulary` generates (with its aliases), no more and no fewer: every path over the tokens of the vocabulary is
// tried, and it reads exactly when the declarations generate it. A spelling outside it is a `BadEffect` that says what
// was found, what is expected and the nearest valid spelling. The grammar document prints every spelling of the same
// declarations. (A copy of a machine cannot be run through the parser: `vocabulary`, the parser and the document read
// the one `machines` list, so what is tested is that each is a function of it, over the real list.)
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Option, Result, String as Str } from "effect";

import { formatAnchor, readAnchorPath } from "../src/anchors.ts";
import { parseEffectLine } from "../src/effects.ts";
import { anchorFormsText, anchorSpellings } from "../src/grammar.ts";
import { grammarDocument } from "../src/grammarDoc.ts";
import {
  aliases,
  headPlaceholder,
  machines,
  percentToken,
  progressToken,
  spelled,
  vocabulary,
  vocabularyOf,
} from "../src/machines.ts";
import type { Form, Machine, SubjectKind } from "../src/machines.ts";

/** The aliases that move the moment they stand for (`scene.end`). */
const shiftingAliases = Arr.filter(
  aliases,
  (alias) => alias.shift !== undefined
);

/** The heads the paths are tried with: an id (an Element or an effect), the Scene, a State, a Beat, and an alias head. */
const heads: readonly {
  readonly kinds: readonly SubjectKind[];
  readonly text: string;
}[] = [
  { kinds: ["element", "effect"], text: "box" },
  { kinds: ["scene"], text: "scene" },
  { kinds: ["state"], text: "state(2)" },
  { kinds: ["beat"], text: "beat(3)" },
  { kinds: [], text: "transition" },
];

const written = (head: string, form: Form): string =>
  Str.replace(percentToken, "50%")(spelled(head, form));

const cell = (text: string): string => Str.replaceAll("|", "\\|")(text);

const failure = (text: string) => {
  const parsed = parseEffectLine(`x1: sound pop at ${text}`, 7);

  return Result.isFailure(parsed) ? parsed.failure : undefined;
};

const prefixed = (tokens: readonly string[], prefix: readonly string[]) =>
  tokens.length >= prefix.length &&
  Arr.every(prefix, (word, index) => tokens[index] === word);

/**
 * The spelling an alias gives a canonical path, or the path itself when no alias reaches it. `shifting` says whether the
 * aliases that move the moment (`scene.end`) count: a shifting alias is another moment, so the anchor on its own never
 * writes back as one (`formatEvent` does, with the offset).
 */
const aliasedPath = (path: string, shifting = false): string => {
  const tokens = Str.split(path, ".");

  const alias = Arr.findFirst(
    aliases,
    (candidate) =>
      (shifting
        ? candidate.shift !== undefined
        : candidate.shift === undefined) && prefixed(tokens, candidate.for)
  );

  return Option.match(alias, {
    onNone: () => path,
    onSome: (found) =>
      Arr.join([...found.spelled, ...Arr.drop(tokens, found.for.length)], "."),
  });
};

/** Every path the declarations generate, for the heads above: the forms, and what the aliases spell. */
const generated = (progress: boolean): readonly string[] => {
  const canonical = Arr.flatMap(heads, ({ kinds, text }) =>
    Arr.map(
      Arr.filter(
        vocabulary,
        (form) =>
          Arr.contains(kinds, form.machine.subject) &&
          (form.kind === "progress") === progress
      ),
      (form) => written(text, form)
    )
  );

  return [
    ...canonical,
    ...Arr.map(canonical, (path) => aliasedPath(path)),
    ...Arr.map(canonical, (path) => aliasedPath(path, true)),
  ];
};

const tokens = Arr.dedupe([
  ...Arr.flatMap(vocabulary, (form) =>
    Arr.map(form.tail, (token) => Str.replace(percentToken, "50%")(token))
  ),
  ...Arr.flatMap(aliases, (alias) => alias.spelled),
]);

/** Every path of a head and up to two tokens: the paths the parser could be asked about. */
const universe: readonly string[] = Arr.flatMap(heads, ({ text }) => [
  text,
  ...Arr.map(tokens, (first) => `${text}.${first}`),
  ...Arr.flatMap(tokens, (first) =>
    Arr.map(tokens, (second) => `${text}.${first}.${second}`)
  ),
]);

describe("the parser accepts exactly the vocabulary", () => {
  for (const progress of [false, true]) {
    it(`reads a path (${progress ? "inside when(... >= N%)" : "as an anchor"}) when the declarations generate it, and only then`, () => {
      const accepted = new Set(generated(progress));

      const wrong = Arr.filter(
        universe,
        (path) =>
          Result.isSuccess(readAnchorPath(path, 1, progress)) !==
          accepted.has(path)
      );

      assert.deepStrictEqual(wrong, []);
    });
  }

  it("generates something to accept, so the comparison is not empty", () => {
    assert.isAbove(generated(false).length, 40);
    assert.isAbove(generated(true).length, 3);
  });

  it("reads each form with its head back as the spelling the declarations give it (through the aliases)", () => {
    for (const path of generated(false)) {
      const read = readAnchorPath(path, 1);

      assert.isTrue(Result.isSuccess(read), path);

      if (Result.isSuccess(read)) {
        // The anchor read from a shifting alias is the canonical one (`scene.end` reads as `scene.shown.leave`).
        const stands = Option.match(
          Arr.head(
            Arr.filter(
              shiftingAliases,
              (alias) => Arr.join(alias.spelled, ".") === path
            )
          ),
          { onNone: () => path, onSome: (alias) => Arr.join(alias.for, ".") }
        );

        assert.strictEqual(
          formatAnchor(read.success),
          aliasedPath(stands),
          path
        );
      }
    }
  });

  it("reads every generated spelling inside an effect line, for a sound", () => {
    for (const path of generated(false)) {
      assert.isTrue(
        Result.isSuccess(parseEffectLine(`x1: sound pop at ${path}`, 7)),
        path
      );
    }
  });

  it("takes any percent from 0 to 100 for the placeholder, and refuses more", () => {
    assert.isTrue(Result.isSuccess(readAnchorPath("box.move.70%", 1)));
    assert.isTrue(Result.isSuccess(readAnchorPath("box.move.0%", 1)));

    const above = readAnchorPath("box.move.150%", 9);

    assert.isTrue(Result.isFailure(above));
    assert.strictEqual(
      Result.isFailure(above) && above.failure._tag,
      "BadPercent"
    );
  });

  it("reads a decimal percent as one token, so it is the percent the author wrote", () => {
    const read = readAnchorPath("box.move.12.5%", 1);

    assert.isTrue(Result.isSuccess(read));
    assert.deepStrictEqual(Result.isSuccess(read) ? read.success : undefined, {
      at: { percent: 12.5 },
      kind: "edge",
      subject: { id: "box", kind: "element" },
      transition: "move",
    });
  });
});

describe("a spelling outside the vocabulary is a BadEffect that says what to write", () => {
  it("names the transition an Element's machines do not have, with line, found, expected and the nearest", () => {
    const found = failure("box.glide.start");

    assert.strictEqual(found?._tag, "BadEffect");
    assert.strictEqual(found?.line, 7);
    assert.strictEqual(
      found?.message,
      `"box.glide.start" names no moment of a declared machine; expected ${anchorFormsText}; did you mean box.exit.start?`
    );
  });

  it("names a state used as a transition, and a misspelt one", () => {
    assert.strictEqual(
      failure("box.moving.start")?.message,
      `"box.moving.start" names no moment of a declared machine; expected ${anchorFormsText}; did you mean box.move.start?`
    );
    assert.strictEqual(
      failure("box.movin.enter")?.message,
      `"box.movin.enter" names no moment of a declared machine; expected ${anchorFormsText}; did you mean box.moving.enter?`
    );
  });

  it("names a misspelt edge of the Scene", () => {
    assert.strictEqual(
      failure("scene.sta")?.message,
      `"scene.sta" names no moment of a declared machine; expected ${anchorFormsText}; did you mean scene.start?`
    );
  });

  it("lists the machines' own vocabulary as what is expected", () => {
    for (const machine of machines) {
      for (const transition of Arr.filter(
        machine.transitions,
        ({ elide }) => elide !== true
      )) {
        assert.include(
          anchorFormsText,
          transition.name,
          `${machine.id}: ${transition.name}`
        );
      }
    }
  });
});

describe("the grammar document prints the vocabulary", () => {
  const document = grammarDocument();

  /** The spellings the declarations imply, written without the generator: grouped by transition and by state. */
  const implied: readonly string[] = Arr.flatMap(machines, (machine) => {
    const head = headPlaceholder[machine.subject];

    return [
      ...Arr.flatMap(machine.transitions, (transition) => {
        const name = transition.elide === true ? [] : [transition.name];

        return [
          Arr.join([head, ...name, `start|end|${percentToken}`], "."),
          `when(${Arr.join([head, ...name, progressToken], ".")} >= ${percentToken})`,
        ];
      }),
      ...Arr.map(machine.states, (state) =>
        Arr.join(
          [
            head,
            ...(machine.stateElided ? [] : [state.name]),
            Arr.join(
              [machine.stateEvents.enter, machine.stateEvents.leave],
              "|"
            ),
          ],
          "."
        )
      ),
    ];
  });

  it("has a row for every spelling the machines imply", () => {
    const forms = Arr.map(anchorSpellings, ({ form }) => form);

    for (const spelling of implied) {
      assert.include(forms, spelling);
      assert.include(document, `\`${cell(spelling)}\``);
    }
  });

  it("has a row for every spelling of the generator, and for each alias", () => {
    for (const { form } of anchorSpellings) {
      assert.include(document, `\`${cell(form)}\``);
    }

    for (const alias of aliases) {
      assert.isTrue(
        Arr.some(anchorSpellings, ({ form }) =>
          Str.startsWith(Arr.join(alias.spelled, "."))(form)
        ),
        Arr.join(alias.spelled, ".")
      );
    }
  });
});

const textOf = (list: readonly Form[]) =>
  Arr.map(list, (form) => spelled(headPlaceholder[form.machine.subject], form));

// F2 of spec 0004, "add a transition to a copy of a machine": `vocabularyOf` is the generator and `vocabulary` is its
// value for the real `machines`; a COPY of the machines with one more transition (and one more state) yields the extra
// spellings and nothing else changes. The parser (`anchors.ts`), the grammar document and `anchorFormsText` read the ONE
// real list, by design (no seam in them for a test), so what is tested here is the generator they all read.
describe("the vocabulary is generated from a list of machines", () => {
  const position = Option.getOrUndefined(
    Arr.findFirst(machines, ({ id }) => id === "position")
  );

  if (position === undefined) {
    assert.fail("the machines have a position machine");
  }

  const grown: Machine = {
    ...position,
    states: [
      ...position.states,
      { means: "the Element hovers", name: "hovering" },
    ],
    transitions: [
      ...position.transitions,
      {
        during: "hovering",
        from: "still",
        means: "the Element hovers",
        name: "hover",
        progress: "time",
        to: "still",
      },
    ],
  };

  const copy = Arr.map(machines, (machine) =>
    machine === position ? grown : machine
  );

  it("is `vocabularyOf` of the real machines", () => {
    assert.deepStrictEqual(textOf(vocabularyOf(machines)), textOf(vocabulary));
  });

  it("grows by the spellings of the new transition and the new state, and by nothing else", () => {
    const added = Arr.filter(
      textOf(vocabularyOf(copy)),
      (text) => !Arr.contains(textOf(vocabulary), text)
    );

    assert.deepStrictEqual(added, [
      "<id>.hover.start",
      "<id>.hover.end",
      "<id>.hover.<N>%",
      "<id>.hover.progress",
      "<id>.hovering.enter",
      "<id>.hovering.leave",
    ]);
    assert.strictEqual(vocabularyOf(copy).length, vocabulary.length + 4 + 2);
  });

  it("is not read by the parser: the parser reads the real list, so the new spelling is refused there", () => {
    assert.isTrue(Result.isFailure(readAnchorPath("box.hover.start", 1)));
  });
});
