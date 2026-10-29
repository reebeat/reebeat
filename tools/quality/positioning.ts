// The positioning gate (spec 0011, F-pos1 and F-pos3 to F-pos7): the README, the positioning note and the how-it-works
// note keep the words, the table, the status and the vocabulary that the spec decided. Pure functions over Markdown
// text; each returns the findings as strings, and an empty array means the rule holds. The vocabulary check is a
// blocklist and partial on purpose (F-pos6): whether every use of "build" and "creating" is right stays a read check.
import { Array as Arr, Option, String as Str, pipe } from "effect";

/** A Markdown table: its header cells and the cells of each body row, trimmed. */
interface Table {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** One `## ` section of a note: its body, and the rest of the note around it. */
interface Section {
  readonly found: boolean;
  readonly inside: string;
  readonly outside: string;
}

const lineBreak = "\n";
const sectionMark = "## ";

/** The nine columns of the comparison table, in order (F-pos3). */
export const comparisonColumns: readonly string[] = [
  "Tool",
  "Authoring model",
  "How time is decided",
  "How transitions arise",
  "One source → many outputs",
  "Accessibility outputs",
  "Reproducibility",
  "Collaboration and agents",
  "Iteration loop (rebuild cost)",
];

/** The 13 tools that follow the reebeat row, in order (F-pos3). */
export const comparisonTools: readonly string[] = [
  "DaVinci Resolve",
  "Premiere Pro",
  "Final Cut Pro",
  "PowerPoint",
  "Keynote",
  "Canva",
  "Google Slides",
  "After Effects",
  "Remotion",
  "Motion Canvas",
  "Manim",
  "Rive",
  "Lottie",
];

const linesOf = (text: string): readonly string[] => Str.split(lineBreak)(text);

const isSectionMark = (line: string): boolean =>
  Str.startsWith(sectionMark)(line);

/** The section under `## heading` (up to the next `## `) and everything outside it. */
const sectionOf = (md: string, heading: string): Section => {
  const [before, rest] = Arr.span(
    linesOf(md),
    (line) => Str.trimEnd(line) !== `${sectionMark}${heading}`
  );

  const [inside, after] = Arr.span(
    Arr.drop(rest, 1),
    (line) => !isSectionMark(line)
  );

  return {
    found: Arr.isReadonlyArrayNonEmpty(rest),
    inside: Arr.join(inside, lineBreak),
    outside: Arr.join([...before, ...after], lineBreak),
  };
};

/** The lines before the first `## ` heading: the title and the opening of a README. */
export const opening = (md: string): string =>
  pipe(
    linesOf(md),
    Arr.takeWhile((line) => !isSectionMark(line)),
    Arr.join(lineBreak)
  );

const isTableLine = (line: string): boolean =>
  Str.startsWith("|")(Str.trimStart(line));

const cellsOf = (line: string): readonly string[] =>
  pipe(
    line,
    Str.trim,
    Str.replace(/^\|/u, ""),
    Str.replace(/\|$/u, ""),
    Str.split(/(?<!\\)\|/u),
    Arr.map(Str.trim)
  );

/** Runs of consecutive table lines. */
const blocksOf = (lines: readonly string[]): readonly (readonly string[])[] => {
  const skipped = Arr.dropWhile(lines, (line) => !isTableLine(line));

  if (Arr.isReadonlyArrayEmpty(skipped)) {
    return [];
  }

  const [block, after] = Arr.span(skipped, isTableLine);

  return [block, ...blocksOf(after)];
};

const tablesOf = (md: string): readonly Table[] =>
  Arr.map(blocksOf(linesOf(md)), (block) => ({
    header: cellsOf(block.at(0) ?? ""),
    rows: Arr.map(Arr.drop(block, 2), cellsOf),
  }));

const tableWithHeader = (
  md: string,
  isHeader: (header: readonly string[]) => boolean
): Option.Option<Table> =>
  Arr.findFirst(tablesOf(md), (table) => isHeader(table.header));

const sameCells = (
  left: readonly string[],
  right: readonly string[]
): boolean => Arr.join(left, " | ") === Arr.join(right, " | ");

const firstCell = (row: readonly string[]): string => row.at(0) ?? "";

const matchesOf = (rules: readonly RegExp[], text: string): readonly string[] =>
  Arr.flatMap(rules, (rule) =>
    Arr.map(Arr.fromIterable(Str.matchAll(rule)(text)), ([hit]) => hit ?? "")
  );

/** The first string between double quotes in a line, when there is one. */
const firstQuote = (line: string): Option.Option<string> =>
  pipe(
    line,
    Str.match(/"(?<quote>[^"]+)"/u),
    Option.flatMap((hit) => Option.fromNullishOr(hit.groups?.quote))
  );

const goalLabels: readonly string[] = [
  "Tagline",
  "Intent line",
  "Intent sentence",
  "Technical description",
];

const wordsFinding = (
  label: string,
  bullets: readonly string[],
  readme: string
): readonly string[] =>
  pipe(
    bullets,
    Arr.findFirst(Str.startsWith(`- **${label}`)),
    Option.flatMap(firstQuote),
    Option.match({
      onNone: () => [`the spec has no "${label}" bullet with a quoted string`],
      onSome: (words) =>
        Str.includes(words)(readme)
          ? []
          : [`the README does not contain the ${label} verbatim: "${words}"`],
    })
  );

/** F-pos1: the README holds each quoted string of the spec's Goal verbatim. */
export const missingWords = (
  readme: string,
  spec: string
): readonly string[] => {
  const bullets = linesOf(sectionOf(spec, "Goal").inside);

  return Arr.flatMap(goalLabels, (label) =>
    wordsFinding(label, bullets, readme)
  );
};

const withoutBold = (cell: string): string => Str.replaceAll("**", "")(cell);

const rowFindings = (
  rows: readonly (readonly string[])[]
): readonly string[] => {
  const firsts = Arr.map(rows, (row) => withoutBold(firstCell(row)));

  const expected = ["reebeat", ...comparisonTools];

  const misplaced = Arr.flatMap(expected, (name, index) =>
    Str.includes(name)(firsts.at(index) ?? "")
      ? []
      : [
          `row ${index + 1} should be ${name}, found "${firsts.at(index) ?? "no row"}"`,
        ]
  );

  const extra =
    rows.length > expected.length
      ? [`the table has ${rows.length} rows, expected ${expected.length}`]
      : [];

  return [...misplaced, ...extra];
};

const cellCountFindings = (
  rows: readonly (readonly string[])[]
): readonly string[] =>
  Arr.flatMap(rows, (row) =>
    row.length === comparisonColumns.length
      ? []
      : [
          `row "${withoutBold(firstCell(row))}" has ${row.length} cells, expected ${comparisonColumns.length}`,
        ]
  );

/** F-pos3: the comparison table has the agreed columns, the 13 tools after reebeat, and nine cells in every row. */
export const comparisonFindings = (md: string): readonly string[] =>
  pipe(
    tableWithHeader(md, (header) => header.at(0) === "Tool"),
    Option.match({
      onNone: () => ["there is no table whose header starts with Tool"],
      onSome: ({ header, rows }) => [
        ...(sameCells(header, comparisonColumns)
          ? []
          : [
              `the header is "${Arr.join(header, " | ")}", expected "${Arr.join(comparisonColumns, " | ")}"`,
            ]),
        ...rowFindings(rows),
        ...cellCountFindings(rows),
      ],
    })
  );

const speedClaims: readonly RegExp[] = [
  /\b(?:faster|slower|quicker|speedier) than\b/giu,
  /\b\d+(?:\.\d+)?\s?(?:x\b|×|times\b)/giu,
];

/** The text with quotations and link targets removed: what the note says in its own voice. */
const ownVoice = (text: string): string =>
  pipe(
    text,
    Str.replaceAll(/"[^"]*"/gu, " "),
    Str.replaceAll(/“[^”]*”/gu, " "),
    Str.replaceAll(/\]\([^)]*\)/gu, "]")
  );

/** F-pos4: the Performance section has no comparative or ratio claim outside a quotation. */
export const speedFindings = (md: string): readonly string[] => {
  const { found, inside } = sectionOf(md, "Performance");

  return found
    ? Arr.map(
        matchesOf(speedClaims, ownVoice(inside)),
        (claim) => `Performance: "${claim}" is an unmeasured speed claim`
      )
    : ["there is no Performance section"];
};

const statusWords: readonly string[] = [
  "real today",
  "being built",
  "being planned",
  "roadmap",
  "deferred",
];

const statusOf = (cell: string): readonly string[] =>
  Arr.filter(statusWords, (word) => Str.includes(word)(Str.toLowerCase(cell)));

const hasAny = (
  words: readonly string[],
  ...wanted: readonly string[]
): boolean => Arr.some(wanted, (word) => Arr.contains(words, word));

/** A roadmap item names its issue; an item being built or planned names its spec. */
const evidenceFindings = (
  where: string,
  row: readonly string[]
): readonly string[] => {
  const status = statusOf(row.at(1) ?? "");
  const claim = Str.toLowerCase(Arr.join(Arr.drop(row, 1), " "));

  return [
    ...(hasAny(status, "roadmap") && !/#\d+/u.test(claim)
      ? [
          `${where} row "${firstCell(row)}" is on the roadmap and names no issue`,
        ]
      : []),
    ...(hasAny(status, "being built", "being planned") &&
    !Str.includes("spec")(claim)
      ? [
          `${where} row "${firstCell(row)}" is being built or planned and names no spec`,
        ]
      : []),
  ];
};

const sameRow =
  (row: readonly string[]) =>
  (candidate: readonly string[]): boolean =>
    Str.toLowerCase(firstCell(candidate)) === Str.toLowerCase(firstCell(row));

const agreementFindings = (
  row: readonly string[],
  noteRows: readonly (readonly string[])[]
): readonly string[] =>
  pipe(
    noteRows,
    Arr.findFirst(sameRow(row)),
    Option.match({
      onNone: () => [`the note has no row for "${firstCell(row)}"`],
      onSome: (match) => {
        const readmeStatus = statusOf(row.at(1) ?? "");
        const noteStatus = statusOf(match.at(1) ?? "");

        return sameCells(readmeStatus, noteStatus)
          ? []
          : [
              `"${firstCell(row)}": the README says [${Arr.join(readmeStatus, ", ")}], the note says [${Arr.join(noteStatus, ", ")}]`,
            ];
      },
    })
  );

/** F-pos5: every row of the README status table is in the note's status table, with the same status words. */
export const statusFindings = (
  readmeMd: string,
  noteMd: string
): readonly string[] => {
  const readme = tableWithHeader(readmeMd, (header) =>
    sameCells(header, ["Part of the goal", "Status"])
  );

  const note = tableWithHeader(noteMd, (header) => header.at(0) === "Claim");

  if (Option.isNone(readme) || Option.isNone(note)) {
    return [
      ...(Option.isNone(readme)
        ? ["the README has no table headed Part of the goal | Status"]
        : []),
      ...(Option.isNone(note)
        ? ["the note has no table whose header starts with Claim"]
        : []),
    ];
  }

  return [
    ...Arr.flatMap(readme.value.rows, (row) =>
      agreementFindings(row, note.value.rows)
    ),
    ...Arr.flatMap(readme.value.rows, (row) => evidenceFindings("README", row)),
    ...Arr.flatMap(note.value.rows, (row) => evidenceFindings("note", row)),
  ];
};

const wrongVerbs: readonly RegExp[] = [
  /\breebeat\s+(?:creates|created|creating)\b/giu,
  /\byou\s+(?:build|built|building)\b/giu,
  /\breebeat\s+(?:is\s+)?(?:the\s+)?(?:author|creator)\b/giu,
];

/** F-pos6: "build" is what reebeat does and "creating" is the author's work; the blocklist reports the swapped uses. */
export const vocabularyFindings = (text: string): readonly string[] =>
  Arr.map(
    matchesOf(wrongVerbs, text),
    (phrase) => `vocabulary: "${phrase}" swaps build and creation`
  );

const dagFindings = (md: string): readonly string[] =>
  Arr.flatMap(linesOf(md), (line, index) =>
    /\bDAG\b/u.test(line) &&
    (!/build/iu.test(line) || /\b(?:Model|Plan)\b/u.test(line))
      ? [
          `line ${index + 1} uses DAG for something other than the build graph: ${Str.trim(line)}`,
        ]
      : []
  );

const externalLinks = (text: string): readonly string[] =>
  Arr.map(
    Arr.fromIterable(
      Str.matchAll(/\]\((?<url>https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/gu)(text)
    ),
    (hit) => hit.groups?.url ?? ""
  );

const ownRepository = "https://github.com/reebeat/reebeat";

const linkFindings = (md: string): readonly string[] => {
  const { found, inside, outside } = sectionOf(md, "Sources");
  const listed = externalLinks(inside);

  return found
    ? pipe(
        externalLinks(outside),
        Arr.dedupe,
        Arr.filter(
          (url) =>
            !Str.startsWith(ownRepository)(url) && !Arr.contains(listed, url)
        ),
        Arr.map((url) => `the link ${url} is not in the Sources section`)
      )
    : ["there is no Sources section"];
};

/** F-pos7: DAG names the build graph only, and every external link of the body is also in Sources. */
export const howItWorksFindings = (md: string): readonly string[] => [
  ...dagFindings(md),
  ...linkFindings(md),
];
