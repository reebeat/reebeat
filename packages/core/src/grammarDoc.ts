// The grammar document `docs/grammar/effects.md` (spec 0002, F3), generated: every production, closed set, table and
// error message of it is read from `grammar.ts` and `plan.ts`, and every example is a whole story that the parser
// reads (a valid one builds; an invalid one fails with the message printed under it, taken from the parser). A test
// compares the checked-in file with this text and parses every example of it, so the document cannot disagree with
// the parser; `tools/quality/genGrammar.ts` writes it. A plain function.
import { Array as Arr, Record, String as Str } from "effect";

import { collectErrors } from "./build.ts";
import {
  anchorForms,
  elementProperties,
  productions,
  releaseOneForms,
  reservedIds,
  sourceUnits,
  verbArguments,
} from "./grammar.ts";
import {
  cells,
  edges,
  elementClasses,
  elementEvents,
  sfxNames,
  verbs,
} from "./plan.ts";

/** One example of the document: a whole story, valid or not. */
interface Example {
  readonly source: string;
  readonly title: string;
}

const story = (rows: readonly string[]): string =>
  Arr.join(["Title: Example", "", "# Part", "", ...rows, ""], "\n");

const narrate = (text: string): readonly string[] => ["", "NARRATOR", text];

const valid: readonly Example[] = [
  {
    source: Arr.join(
      [
        "Title: Same name, new place",
        "",
        "# Two screens",
        "",
        "INT. THE FIRST SCREEN - DAY #sc3#",
        "",
        "Box one {id=one cell=ml class=box}",
        "Every box has a name {id=tag cell=tc class=label}",
        "",
        "NARRATOR",
        "A box on the first screen.",
        "",
        "> AUTO-ANIMATE",
        "",
        "INT. THE NEXT SCREEN - DAY #sc4#",
        "",
        "Box one {id=one cell=mc class=box}",
        "Every box has a name {id=tag cell=tc class=accent}",
        "Same name, so it moves {id=hint cell=bc class=muted}",
        "Matched by id {id=note cell=br class=label visible=false}",
        "",
        "[[effects",
        "  s1: sound whoosh at one.move.start",
        "  s2: sound ding   at one.move.50%",
        '  r1: show  note   at word("matches").end +0.1s',
        '  f1: focus hint   at word("slides").start -0.2s',
        "]]",
        "",
        "NARRATOR",
        "On the next screen, box one sits somewhere else. Its name matches, so it slides there.",
        "",
      ],
      "\n"
    ),
    title:
      "Two Scenes: a sound on the move, a reveal after a word, a focus before one",
  },
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY #only#",
      "",
      "A title {id=title cell=mc class=title}",
      "",
      "[[effects",
      "  w1: sound whoosh at transition.start",
      '  w2: sound ding at word("again", 2).end',
      '  w3: sound pop at 2.5s because "the music has a beat here"',
      "  w4: sound pop at w1.start +3f",
      "]]",
      ...narrate("Say it, and say it again. Then say it again."),
    ]),
    title:
      "One Scene: the slide change, the second of three words, an absolute time with its reason, a chain",
  },
];

const invalid: readonly Example[] = [
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY",
      "",
      "A title {id=title cell=mc class=title}",
      ...narrate("Hello."),
    ]),
    title: "A Scene heading without its id",
  },
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY #only#",
      "",
      "A title {#title @mc .title hidden}",
      ...narrate("Hello."),
    ]),
    title: "An Element in the release-1 form",
  },
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY #only#",
      "",
      "A title {id=title cell=mc class=title}",
      ...narrate("Hello [[focus: title]] there."),
    ]),
    title: "A note in dialogue (release 1)",
  },
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY #only#",
      "",
      "A title {id=title cell=mc class=title}",
      "A hint {id=hint cell=bc class=muted visible=false}",
      "",
      "[[effects",
      '  r1: show hint at word("hello").end',
      "  s1: sound pop at hint.entr.start",
      "]]",
      ...narrate("Hello there."),
    ]),
    title: "An unknown event, with the nearest valid one",
  },
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY #only#",
      "",
      "A title {id=title cell=mc class=title}",
      "",
      "[[effects",
      '  s1: sound pop at word("again").end',
      "]]",
      ...narrate("Again and again."),
    ]),
    title: "A phrase that occurs twice, with no occurrence number",
  },
  {
    source: story([
      "INT. THE ONLY SCREEN - DAY #only#",
      "",
      "A title {id=title cell=mc class=title}",
      "",
      "[[effects",
      "  s1: sound pop at 2.5s",
      "]]",
      ...narrate("Hello."),
    ]),
    title: "An absolute time without its reason",
  },
];

/** `|` inside a table cell. */
const cell = (text: string): string => Str.replaceAll("|", "\\|")(text);

const code = (text: string): string => `\`${text}\``;

const list = (words: readonly string[]): string =>
  Arr.join(Arr.map(words, code), ", ");

const table = (
  head: readonly string[],
  rows: readonly (readonly string[])[]
): readonly string[] => [
  `| ${Arr.join(head, " | ")} |`,
  `| ${Arr.join(
    Arr.map(head, () => "---"),
    " | "
  )} |`,
  ...Arr.map(rows, (row) => `| ${Arr.join(Arr.map(row, cell), " | ")} |`),
  "",
];

const block = (language: string, text: string): readonly string[] => [
  `\`\`\`${language}`,
  Str.trimEnd(text),
  "```",
  "",
];

const errorLine = (source: string): string => {
  const [first] = collectErrors(source);

  return first === undefined
    ? "(no error: this example no longer fails)"
    : `> line ${first.line}, ${first._tag}: ${first.message}`;
};

const propertyRows = Arr.map(elementProperties, (property) => [
  code(property.key),
  property.required ? "yes" : "no",
  property.default === undefined ? "" : code(property.default),
  property.values.length === 0 ? property.form : list(property.values),
  property.summary,
]);

const widest = Arr.reduce(productions, 0, (width, { name }) =>
  Math.max(width, name.length + 1)
);

/** The text of `docs/grammar/effects.md`. */
export const grammarDocument = (): string =>
  Arr.join(
    [
      "# The effects syntax",
      "",
      "<!-- Generated by tools/quality/genGrammar.ts from packages/core/src/grammar.ts and plan.ts. Do not edit: a test fails when this file differs from its generator, and parses every example below. -->",
      "",
      'One story is one `.fountain` file. Dialogue is prose, byte for byte what is spoken and subtitled; every Element and every effect is written once, with its id, in the Scene it belongs to (spec 0002). Nothing is positional: no `next`, no "the Element above", no bare flag.',
      "",
      "## A Scene, in one view",
      "",
      ...Arr.flatMap(valid, (example) => [
        `**${example.title}**`,
        "",
        ...block("fountain", example.source),
      ]),
      "## The Scene heading",
      "",
      `The id sits between \`#\` at the end of the heading: \`INT. THE NEXT SCREEN - DAY #sc4#\`. It is required, unique in the story, and starts with a letter followed by letters, digits, \`_\` or \`-\`; ${list(reservedIds)} are reserved by the anchor grammar (no Scene, Element or effect may carry one).`,
      "",
      "## Element lines",
      "",
      "One Action line is one Element: its text, then `{key=value ...}`. Every property is named; there are no sigils and no bare flags.",
      "",
      ...table(
        ["key", "required", "default", "values", "meaning"],
        propertyRows
      ),
      `Cells: ${list(cells)}. Classes: ${list(elementClasses)}.`,
      "",
      "## The effects block",
      "",
      "One `[[effects` block per Scene, before its first dialogue, with no blank line inside. Each line is one effect: its id, a verb with its argument, and when it happens.",
      "",
      "```text",
      ...Arr.map(
        productions,
        ({ name, rule }) => `${Str.padEnd(widest)(name)}::= ${rule}`
      ),
      "```",
      "",
      "### Verbs",
      "",
      ...table(
        ["verb", "argument", "meaning"],
        Arr.map(verbs, (verb) => [
          code(verb),
          verbArguments[verb].argument,
          verbArguments[verb].summary,
        ])
      ),
      "### Anchors",
      "",
      "An anchor names a moment of the Plan. It resolves to a frame in the schedule stage, from the aligned words and the renderer's declared lifecycle; `tsukuri plan` prints `intent -> frame` for each effect.",
      "",
      ...table(
        ["anchor", "points at"],
        Arr.map(Record.values(anchorForms), ({ form, meaning }) => [
          code(form),
          meaning,
        ])
      ),
      `Edges: ${list(edges)}. Element events: ${list(elementEvents)}. A percent is only valid on an anchor that has a window (a move, an update, a show, the transition of a Scene that is not \`> CUT\`, a word); an instant (an exit, \`scene.start\`, a sound) has none.`,
      "",
      "### Offsets",
      "",
      "After an anchor: a sign, a number and a unit.",
      "",
      ...table(
        ["unit", "means"],
        Arr.map(sourceUnits, ({ factor, stored, token }) => [
          code(token),
          stored === "percent"
            ? "a share of the anchored window (only with an anchor that has one)"
            : `${stored === "f" ? "frames" : "milliseconds"}${factor === 1 ? "" : `, written in seconds (x ${factor})`}`,
        ])
      ),
      "### Absolute times",
      "",
      'An effect may be pinned to a time from the slide change, `at 2.5s because "<reason>"`. The reason is mandatory; `tsukuri lint` and `tsukuri plan` list every absolute time.',
      "",
      "### Sounds",
      "",
      `The catalogue: ${list(sfxNames)}.`,
      "",
      "## What is rejected, and what the message says",
      "",
      "Each form below is an error that names its line, what was found, what was expected and the nearest valid form.",
      "",
      ...Arr.flatMap(invalid, (example) => [
        `**${example.title}**`,
        "",
        ...block("fountain-invalid", example.source),
        errorLine(example.source),
        "",
      ]),
      "### The release-1 forms",
      "",
      ...table(
        ["release 1", "now"],
        Arr.map(releaseOneForms, ({ old, replacement }) => [old, replacement])
      ),
      "",
      "## What is not yet explicit",
      "",
      "Two kinds of line are still read by where they stand, because that is how Fountain itself writes them. Everything else in this document is written once, with its id.",
      "",
      "- **A transition line applies to the NEXT scene heading.** `> AUTO-ANIMATE` and `> CUT` stand alone, between blank lines, right before the heading they lead into (a `# Section` or `= synopsis` may stand between); they name no Scene and carry no id. A transition anywhere else is a `BadTransition` error that says so.",
      "- **A parenthetical applies to the dialogue right after it**: `(slowly)`, `(quickly)`, `(pause N)` and `(speed N)` set the delivery of the NARRATOR Line that follows.",
      "",
      "A later spec may give both an explicit form (for example a transition written on the heading it belongs to); until then the position is the rule.",
    ],
    "\n"
  );
