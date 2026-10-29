// The drift check of skill `verify-reebeat` (spec 0010): the feature map (`.agents/skills/verify-reebeat/features.md`) is held to
// the code and to the specs by plain functions over text. The map is the one list of what a viewer can observe; a spec points
// into it with a `Verify skill:` line; the vocabulary of `@reebeat/core` must have a row for each of its members.
import { Array as Arr, Option, String as Str, pipe } from "effect";

/** A spec file: its name (`0010-review-and-verify-skills.md`) and its text. */
export interface SpecFile {
  readonly name: string;
  readonly text: string;
}

/** What the map must cover, taken from `@reebeat/core` by the caller. */
export interface Vocabulary {
  /** Every kind of anchor, written as the map's id suffix (`word`, `scene`, `transition`, `element`, `effect`, `absolute`). */
  readonly anchorKinds: readonly string[];
  /** The lifecycle events of an Element: each must be named in the `anchor-element` row. */
  readonly elementEvents: readonly string[];
  /** The sound names: each must be named in the `effect-sound` row. */
  readonly sounds: readonly string[];
  /** The slide transitions: one `transition-<name>` row each. */
  readonly transitions: readonly string[];
  /** The effect verbs: one `effect-<verb>` row each. */
  readonly verbs: readonly string[];
}

export interface FeatureRow {
  readonly cells: readonly string[];
  readonly id: string;
}

/** The first spec that must carry a `Verify skill:` line. Earlier ones are checked where the line exists. */
const firstEnforcedSpec = 10;

const cellsPerRow = 5;
const rowStart = "| `";

const cellsOf = (line: string): readonly string[] =>
  pipe(Str.split(line, "|"), Arr.drop(1), Arr.dropRight(1), Arr.map(Str.trim));

/** An id is lowercase words joined by hyphens: `anchor-word`. A path (`packages/core/**`) in the first cell is not an id. */
const idCell = /^`[a-z][a-z0-9-]*`$/u;

/** Every table row of the map whose first cell is an id in backticks. */
export const featureRows = (map: string): readonly FeatureRow[] =>
  pipe(
    Str.split(map, "\n"),
    Arr.filter(Str.startsWith(rowStart)),
    Arr.map(cellsOf),
    Arr.filter((cells) => idCell.test(cells[0] ?? "")),
    Arr.map((cells) => ({
      cells,
      id: Str.replaceAll("`", "")(cells[0] ?? ""),
    }))
  );

const rowText = (rows: readonly FeatureRow[], id: string): string =>
  pipe(
    Arr.findFirst(rows, (row) => row.id === id),
    Option.match({
      onNone: () => "",
      onSome: (row) => Arr.join(row.cells, " "),
    })
  );

const mentions = (text: string, word: string): boolean =>
  Str.includes(word)(text);

/** The row ids the vocabulary needs: one per effect verb, transition and anchor kind. */
export const requiredRows = (vocabulary: Vocabulary): readonly string[] => [
  ...Arr.map(vocabulary.verbs, (verb) => `effect-${verb}`),
  ...Arr.map(vocabulary.transitions, (name) => `transition-${name}`),
  ...Arr.map(vocabulary.anchorKinds, (kind) => `anchor-${kind}`),
];

/** What is wrong with the map against the vocabulary: empty when it is true. */
export const mapProblems = (
  map: string,
  vocabulary: Vocabulary
): readonly string[] => {
  const rows = featureRows(map);
  const ids = Arr.map(rows, (row) => row.id);

  const rowProblems = Arr.flatMap(rows, (row) => [
    ...(row.cells.length === cellsPerRow &&
    Arr.every(row.cells, (cell) => cell !== "")
      ? []
      : [`row ${row.id} must have ${cellsPerRow} non-empty cells`]),
    ...(Arr.filter(ids, (id) => id === row.id).length > 1
      ? [`row ${row.id} is listed twice`]
      : []),
  ]);

  const required = requiredRows(vocabulary);

  const missing = pipe(
    required,
    Arr.filter((id) => !Arr.contains(ids, id)),
    Arr.map((id) => `the vocabulary needs a row ${id}`)
  );

  const named = (id: string, words: readonly string[]): readonly string[] =>
    pipe(
      words,
      Arr.filter((word) => !mentions(rowText(rows, id), word)),
      Arr.map((word) => `row ${id} does not name ${word}`)
    );

  return [
    ...rowProblems,
    ...missing,
    ...named("effect-sound", vocabulary.sounds),
    ...named("anchor-element", vocabulary.elementEvents),
  ];
};

const verifyLine = (text: string): Option.Option<string> =>
  pipe(
    Str.split(text, "\n"),
    Arr.findFirst(Str.startsWith("Verify skill:")),
    Option.map((line) => Str.trim(Str.slice("Verify skill:".length)(line)))
  );

const statusLine = (text: string): string =>
  pipe(
    Str.split(text, "\n"),
    Arr.findFirst(Str.startsWith("Status:")),
    Option.getOrElse(() => "")
  );

const numberOf = (name: string): number =>
  Math.trunc(Number(Str.slice(0, 4)(name)));

/**
 * What is wrong with the `Verify skill:` lines of the specs. The line says feature ids of the map (`a, b`), or `none, <reason>`
 * (the spec changes nothing a viewer can observe), or `pending, <reason>` (only while the spec's status says `plan`).
 */
export const specProblems = (
  specs: readonly SpecFile[],
  ids: readonly string[]
): readonly string[] =>
  Arr.flatMap(specs, (spec) => {
    const line = verifyLine(spec.text);

    if (Option.isNone(line)) {
      return numberOf(spec.name) >= firstEnforcedSpec
        ? [`${spec.name} has no "Verify skill:" line`]
        : [];
    }

    const [head, ...rest] = pipe(Str.split(line.value, ","), Arr.map(Str.trim));

    const reason = pipe(rest, Arr.join(", "), Str.trim);

    if (head === "none" || head === "pending") {
      return [
        ...(reason === ""
          ? [`${spec.name}: "${head}" needs a reason after the comma`]
          : []),
        ...(head === "pending" &&
        !Str.includes("**plan**")(statusLine(spec.text))
          ? [
              `${spec.name}: "pending" is only for a spec whose status says plan`,
            ]
          : []),
      ];
    }

    return pipe(
      Arr.prepend(rest, head),
      Arr.filter((id) => !Arr.contains(ids, id)),
      Arr.map((id) => `${spec.name}: "${id}" is not a row of the feature map`)
    );
  });
