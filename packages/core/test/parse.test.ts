// Token fidelity of the Fountain adapter (spec 0001, Revisions, "M0 measured: parser"): notes stay verbatim in
// dialogue, parentheticals and forced transitions are distinct tokens, boneyards vanish without moving line
// numbers, the five unsupported constructs are flagged on the right line, and a fuzz loop of mutants that insert
// blank lines and boneyards finds no wrong line number.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { collectErrors } from "../src/build.ts";
import { parseFountain } from "../src/parse.ts";
import type { FountainToken } from "../src/parse.ts";
import { asText } from "./support.ts";

/** A token as the tests compare it: type, text, source line. */
type Row = readonly [type: string, text: string, line: number];

const summary = (tokens: readonly FountainToken[]): readonly Row[] =>
  Arr.map(
    Arr.filter(
      tokens,
      (token) => token.text !== "" || token.type === "page_break"
    ),
    (token): Row => [token.type, token.text, token.line]
  );

describe("parseFountain: token fidelity", () => {
  it("keeps [[notes]] verbatim in dialogue, with the parenthetical and the lines", () => {
    const source = asText([
      "NARRATOR",
      "(slowly)",
      "Look at this [[next]] box. [[focus: a]]",
      "It stays.",
    ]);

    assert.deepStrictEqual(summary(parseFountain(source)), [
      ["character", "NARRATOR", 1],
      ["parenthetical", "(slowly)", 2],
      ["dialogue", "Look at this [[next]] box. [[focus: a]]\nIt stays.", 3],
    ]);
  });

  it("splits a dialogue block at a parenthetical in the middle", () => {
    const source = asText(["NARRATOR", "One.", "(pause 1)", "Two."]);

    assert.deepStrictEqual(summary(parseFountain(source)), [
      ["character", "NARRATOR", 1],
      ["dialogue", "One.", 2],
      ["parenthetical", "(pause 1)", 3],
      ["dialogue", "Two.", 4],
    ]);
  });

  it("reads forced transitions, sections, synopses and headings with their lines", () => {
    const source = asText([
      "# Part",
      "",
      "= outline",
      "",
      "> AUTO-ANIMATE",
      "",
      "INT. ROOM",
      "",
      "> CUT",
    ]);

    assert.deepStrictEqual(summary(parseFountain(source)), [
      ["section", "Part", 1],
      ["synopsis", "outline", 3],
      ["transition", "AUTO-ANIMATE", 5],
      ["scene_heading", "INT. ROOM", 7],
      ["transition", "CUT", 9],
    ]);
  });

  it("reads the title page only in the first block", () => {
    const source = asText(["Title: One", "Author: Me", "", "Note: later {#n}"]);

    const tokens = parseFountain(source);

    assert.deepStrictEqual(summary(tokens), [
      ["title", "One", 1],
      ["author", "Me", 2],
      ["action", "Note: later {#n}", 4],
    ]);
    assert.deepStrictEqual(
      Arr.map(tokens, (token) => token.titlePage),
      [true, true, false]
    );
  });

  it("removes boneyards and keeps the line numbers of everything after them", () => {
    const source = asText([
      "INT. A /* inline */",
      "",
      "/* one line */",
      "",
      "/*",
      "several",
      "lines",
      "*/",
      "",
      "Box {#a} /* tail */",
    ]);

    assert.deepStrictEqual(summary(parseFountain(source)), [
      ["scene_heading", "INT. A", 1],
      // fountain-js keeps the space that was in front of the boneyard.
      ["action", "Box {#a} ", 10],
    ]);
  });

  it("does not let dual dialogue leak into the block after it", () => {
    const source = asText(["NARRATOR ^", "Right.", "", "NARRATOR", "Plain."]);

    const types = new Set(
      Arr.map(parseFountain(source), (token) => token.type)
    );

    assert.isTrue(types.has("dual_dialogue_end"));
    assert.isFalse(types.has("dual_dialogue_begin"));
  });
});

describe("the five unsupported constructs are flagged on their line", () => {
  const head = ["# Part", "", "INT. ROOM", "", "Box {#a}", ""];
  const tail = ["", "NARRATOR", "Hello."];

  it.each([
    ["centred text", ">CENTRED<", 7],
    ["a page break", "===", 7],
    ["lyrics", "~la la", 7],
    ["dual dialogue", "NARRATOR ^\nRight side.", 7],
    ["a character other than NARRATOR", "BOB\nNot the narrator.", 7],
  ] as const)("%s", (_name, block, line) => {
    const source = asText([...head, block, ...tail]);
    const found = collectErrors(source);

    assert.deepStrictEqual(
      Arr.map(found, (problem) => [problem._tag, problem.line]),
      [["UnsupportedElement", line]]
    );
  });
});

// A seeded generator, so a failing mutant can be replayed: a linear congruential step that stays below 2^53.
const makeRandom = (seed: number) => {
  let state = seed;

  return (bound: number): number => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return Math.floor((state / 4_294_967_296) * bound);
  };
};

interface Chunk {
  readonly lines: readonly string[];
  /** The tokens with text this chunk must give: type, trimmed text, line offset inside the chunk. */
  readonly tokens: readonly Row[];
}

const chunks: readonly Chunk[] = [
  { lines: ["# Part one"], tokens: [["section", "Part one", 0]] },
  { lines: ["= An outline"], tokens: [["synopsis", "An outline", 0]] },
  { lines: ["INT. ROOM"], tokens: [["scene_heading", "INT. ROOM", 0]] },
  {
    lines: ["Box {#a @tl .box}", "Other {#b hidden}"],
    tokens: [["action", "Box {#a @tl .box}\nOther {#b hidden}", 0]],
  },
  {
    lines: ["NARRATOR", "(slowly)", "Hello [[next]] there.", "Second line."],
    tokens: [
      ["character", "NARRATOR", 0],
      ["parenthetical", "(slowly)", 1],
      ["dialogue", "Hello [[next]] there.\nSecond line.", 2],
    ],
  },
  {
    lines: ["NARRATOR", "One.", "(pause 1)", "Two. [[sfx: pop]]"],
    tokens: [
      ["character", "NARRATOR", 0],
      ["dialogue", "One.", 1],
      ["parenthetical", "(pause 1)", 2],
      ["dialogue", "Two. [[sfx: pop]]", 3],
    ],
  },
  { lines: ["> AUTO-ANIMATE"], tokens: [["transition", "AUTO-ANIMATE", 0]] },
  { lines: ["> CUT"], tokens: [["transition", "CUT", 0]] },
  { lines: [">CENTRED<"], tokens: [["centered", "CENTRED", 0]] },
  { lines: ["~la la"], tokens: [["lyrics", "la la", 0]] },
  { lines: ["==="], tokens: [["page_break", "", 0]] },
  {
    lines: ["NARRATOR ^", "Right side."],
    tokens: [
      ["character", "NARRATOR", 0],
      ["dialogue", "Right side.", 1],
    ],
  },
  {
    lines: ["BOB", "Not the narrator."],
    tokens: [
      ["character", "BOB", 0],
      ["dialogue", "Not the narrator.", 1],
    ],
  },
];

const titlePage: Chunk = {
  lines: ["Title: Fuzz", "Author: Mutant"],
  tokens: [
    ["title", "Fuzz", 0],
    ["author", "Mutant", 1],
  ],
};

const separators: readonly (readonly string[])[] = [
  [""],
  ["", ""],
  ["", "", ""],
  ["   "],
  ["", "\t", ""],
  ["/* one line */"],
  ["", "/* one line */", ""],
  ["/*", "a boneyard", "over three lines", "*/"],
  ["", "/* a", "b */", ""],
];

interface Mutant {
  readonly expected: readonly Row[];
  readonly source: string;
}

/** Builds a source from random chunks with random blank lines and boneyards between them. */
const mutate = (seed: number): Mutant => {
  const random = makeRandom(seed);
  const lines: string[] = [];
  const expected: Row[] = [];
  const count = 6 + random(14);

  const place = (chunk: Chunk, inline: boolean) => {
    const start = lines.length;
    // A trailing boneyard leaves a trailing space, which only Action tolerates (a page break must be exactly ===).
    const tolerant = chunk.tokens[0]?.[0] === "action";

    lines.push(
      ...Arr.map(chunk.lines, (text) =>
        inline && tolerant && random(2) === 0 ? `${text} /* inline */` : text
      )
    );
    expected.push(
      ...Arr.map(chunk.tokens, ([type, text, offset]): Row => [
        type,
        text,
        start + offset + 1,
      ])
    );
  };

  place(
    random(2) === 0 ? titlePage : (chunks[random(chunks.length)] ?? titlePage),
    false
  );

  for (let index = 0; index < count; index += 1) {
    const separator = separators[random(separators.length)] ?? [""];

    lines.push(...separator);
    place(chunks[random(chunks.length)] ?? titlePage, true);
  }

  return { expected, source: asText(lines) };
};

const normalise = (rows: readonly Row[]): readonly string[] =>
  Arr.map(
    rows,
    ([type, text, line]) =>
      `${type}|${Arr.join(
        Arr.map(text.split("\n"), (part) => part.trim()),
        "\n"
      )}|${line}`
  );

/** Every row the parser got wrong for a mutant, with every expected line moved by `shift`. */
const wrongLines = (mutant: Mutant, shift: number): readonly string[] => {
  const found = normalise(summary(parseFountain(mutant.source)));

  const expected = normalise(
    Arr.map(mutant.expected, ([type, text, line]): Row => [
      type,
      text,
      line + shift,
    ])
  );

  const different = Arr.flatMap(expected, (row, index) =>
    found[index] === row ? [] : [`${row} <> ${found[index] ?? "missing"}`]
  );

  return found.length === expected.length
    ? different
    : [...different, `count ${found.length} <> ${expected.length}`];
};

describe("line recovery: fuzz", () => {
  const mutants = 300;

  it("gives every token its source line in 300 mutants that insert blank lines and boneyards", () => {
    const failures: string[] = [];
    let tokens = 0;

    for (let seed = 1; seed <= mutants; seed += 1) {
      const mutant = mutate(seed);

      tokens += mutant.expected.length;
      failures.push(
        ...Arr.map(wrongLines(mutant, 0), (wrong) => `seed ${seed}: ${wrong}`)
      );
    }

    assert.deepStrictEqual(failures, []);
    assert.isAbove(tokens, 2000);
  });

  it("control: the same check fails when every expected line is off by one", () => {
    const failures = Arr.flatMap(Arr.range(1, 20), (seed) =>
      wrongLines(mutate(seed), 1)
    );

    assert.isAbove(failures.length, 0);
  });
});
