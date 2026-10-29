// The one-grammar gate (spec 0002, F3): `packages/core/src/grammar.ts` is the only place that spells the effects
// syntax. This scan reads the source of every package and reports a copy of it: a regular expression that names a verb,
// edge, event, unit, keyword or anchor word, a regular expression that repeats the id rule, or a string that lists
// two members of one closed set as an alternation (`start|end`). A typed use of a member (`effect.verb === "sound"`,
// an object `{ edge: "end" }`) is not a copy: the type checker holds it to the closed set. `grammar.ts` and `plan.ts`,
// which own the sets, are not scanned. Pure functions over the text of one file.
import { Array as Arr, Record, Schema } from "effect";
import { parseSync } from "oxc-parser";

/** What the syntax is made of, as the scan needs it. */
export interface Vocabulary {
  /** Words that a regular expression must not spell (verbs, edges, events, keywords, anchor words, long unit tokens). */
  readonly words: readonly string[];
  /** Sets whose members must not be listed as an alternation in a string (`start|end`). */
  readonly sets: readonly (readonly string[])[];
  /** A fragment of the id rule that a regular expression must not repeat. */
  readonly idRule: string;
}

export interface Copy {
  readonly line: number;
  readonly reason: string;
  readonly text: string;
}

// The parts of the syntax tree the scan reads, as Schemas: a node that does not have the shape is not one of them.
const NodeSchema = Schema.Struct({ start: Schema.Finite, type: Schema.String });

const RegexLiteral = Schema.Struct({
  regex: Schema.Struct({ pattern: Schema.String }),
  start: Schema.Finite,
  type: Schema.Literal("Literal"),
});

const StringLiteral = Schema.Struct({
  start: Schema.Finite,
  type: Schema.Literal("Literal"),
  value: Schema.String,
});

const TemplateLiteral = Schema.Struct({
  quasis: Schema.Array(
    Schema.Struct({ value: Schema.Struct({ raw: Schema.String }) })
  ),
  start: Schema.Finite,
  type: Schema.Literal("TemplateLiteral"),
});

const RegExpCall = Schema.Struct({
  arguments: Schema.Array(NodeSchema),
  callee: Schema.Struct({ name: Schema.Literal("RegExp") }),
  start: Schema.Finite,
  type: Schema.Literals(["NewExpression", "CallExpression"]),
});

type Node = typeof NodeSchema.Type;

const isNode = Schema.is(NodeSchema);
const isNodes = Schema.is(Schema.Array(Schema.NullOr(NodeSchema)));
const isRegexLiteral = Schema.is(RegexLiteral);
const isStringLiteral = Schema.is(StringLiteral);
const isTemplateLiteral = Schema.is(TemplateLiteral);
const isRegExpCall = Schema.is(RegExpCall);

const allValues = (node: Node): readonly unknown[] => Record.values(node);

const childrenOf = (node: Node): readonly Node[] =>
  Arr.flatMap(allValues(node), (value) => {
    if (isNode(value)) {
      return [value];
    }

    return isNodes(value) ? Arr.filter(value, isNode) : [];
  });

/** The text of a string or template literal, as written between its quotes. */
const literalText = (node: Node): string | undefined => {
  if (isStringLiteral(node)) {
    return node.value;
  }

  return isTemplateLiteral(node)
    ? Arr.join(
        Arr.map(node.quasis, (quasi) => quasi.value.raw),
        " "
      )
    : undefined;
};

const regexPattern = (node: Node): string | undefined =>
  isRegexLiteral(node) ? node.regex.pattern : undefined;

/** The first argument of `new RegExp(...)` or `RegExp(...)`, when the node is such a call. */
const constructedPattern = (node: Node): Node | undefined =>
  isRegExpCall(node) ? node.arguments[0] : undefined;

/** The letters of a pattern that stand for themselves: without escapes, group names and property classes. */
const spelledWords = (pattern: string): readonly string[] =>
  Arr.filter(
    pattern
      .replaceAll(/\\[pP]\{[^}]*\}/gu, " ")
      .replaceAll(/\(\?<[A-Za-z_]\w*>/gu, "(")
      .replaceAll(/\\./gu, " ")
      .split(/[^A-Za-z]+/u),
    (word) => word !== ""
  );

const lineOf = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

const regexCopies = (
  pattern: string,
  vocabulary: Vocabulary
): readonly string[] => [
  ...Arr.map(
    Arr.filter(spelledWords(pattern), (word) =>
      Arr.contains(vocabulary.words, word)
    ),
    (word) => `a regular expression spells "${word}"`
  ),
  ...(pattern.includes(vocabulary.idRule)
    ? ["a regular expression repeats the id rule"]
    : []),
];

const alternationCopies = (
  text: string,
  vocabulary: Vocabulary
): readonly string[] => {
  const parts = Arr.map(text.split("|"), (part) => part.trim());

  return parts.length < 2
    ? []
    : Arr.flatMap(vocabulary.sets, (set) =>
        Arr.filter(parts, (part) => Arr.contains(set, part)).length >= 2
          ? [`a string lists ${Arr.join(set, "|")} as an alternation`]
          : []
      );
};

/** Every copy of the grammar in one file's text. */
export const copiesIn = (
  text: string,
  vocabulary: Vocabulary
): readonly Copy[] => {
  const found: Copy[] = [];

  const visit = (node: Node, asPattern: boolean): void => {
    const regex = regexPattern(node);
    const literal = literalText(node);
    const argument = constructedPattern(node);

    const reasons = [
      ...(regex === undefined ? [] : regexCopies(regex, vocabulary)),
      ...(asPattern && literal !== undefined
        ? regexCopies(literal, vocabulary)
        : []),
      ...(literal === undefined ? [] : alternationCopies(literal, vocabulary)),
    ];

    for (const reason of reasons) {
      found.push({
        line: lineOf(text, node.start),
        reason,
        text: text.slice(node.start, node.start + 60).split("\n")[0] ?? "",
      });
    }

    for (const child of childrenOf(node)) {
      visit(child, argument !== undefined && child === argument);
    }
  };

  const { program } = parseSync("scan.ts", text);

  if (isNode(program)) {
    visit(program, false);
  }

  return found;
};
