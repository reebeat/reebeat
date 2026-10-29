// The positioning gate (spec 0011) on text with a negative control for each rule, and on the four real files: the
// README, the positioning note, the how-it-works note and the spec. A rule that no control can fail proves nothing
// (spec 0000), so each rule has a fixture that holds and fixtures that break it one way at a time.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path, String as Str } from "effect";
import type { PlatformError } from "effect";

import {
  comparisonColumns,
  comparisonFindings,
  comparisonTools,
  howItWorksFindings,
  missingWords,
  opening,
  speedFindings,
  statusFindings,
  vocabularyFindings,
} from "../positioning.ts";

const mentions = (findings: readonly string[], text: string): boolean =>
  Arr.some(findings, Str.includes(text));

const replaced = (text: string, from: string, to: string): string =>
  Str.replace(from, to)(text);

const row = (cells: readonly string[]): string =>
  `| ${Arr.join(cells, " | ")} |`;

const table = (
  header: readonly string[],
  rows: readonly (readonly string[])[]
): string =>
  Arr.join(
    [row(header), row(Arr.map(header, () => "---")), ...Arr.map(rows, row)],
    "\n"
  );

describe("F-pos1: the README holds the words of the spec verbatim", () => {
  const spec = Arr.join(
    [
      "# Spec",
      "",
      "## Goal",
      "",
      '- **Tagline:** "Declarative things: fast to read."',
      '- **Intent line:** "We take care of building; you focus on creating."',
      '- **Intent sentence:** "Declare your scenes. Every result is reproducible."',
      '- **Technical description (revised 2026-10-29, see Revisions):** "Beats, compiled into artifacts." The elevator version: "Short."',
      "- **Vocabulary:** creation is the work of the author.",
      "",
      "## Journey",
      '- **Tagline:** "Not from the Goal."',
    ],
    "\n"
  );

  const readme = Arr.join(
    [
      "# reebeat",
      "**Declarative things: fast to read.**",
      "*We take care of building; you focus on creating.*",
      "Declare your scenes. Every result is reproducible.",
      "**For technical readers.** Beats, compiled into artifacts.",
    ],
    "\n"
  );

  it("holds when the README has every quoted string", () => {
    assert.deepStrictEqual(missingWords(readme, spec), []);
  });

  it("control: a README with one word of the tagline changed names the Tagline", () => {
    const findings = missingWords(
      replaced(readme, "fast to read", "quick to read"),
      spec
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "Tagline"));
  });

  it("control: a README without the technical description names it", () => {
    const findings = missingWords(
      replaced(readme, "compiled into artifacts", "compiled"),
      spec
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "Technical description"));
  });

  it("control: a spec without the Intent line bullet is reported", () => {
    const findings = missingWords(
      readme,
      replaced(spec, "- **Intent line:**", "- **Line:**")
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "Intent line"));
  });

  it("control: a bullet outside the Goal section does not count", () => {
    const findings = missingWords(
      readme,
      replaced(spec, "- **Tagline:**", "- **Slogan:**")
    );

    assert.isTrue(mentions(findings, "Tagline"));
  });
});

const nine = (name: string): readonly string[] =>
  Arr.makeBy(comparisonColumns.length, (index) =>
    index === 0 ? name : `cell ${index}`
  );

const rowNames = (tools: readonly string[]): readonly string[] => [
  "**reebeat** (today)",
  ...Arr.map(tools, (tool) => `**(a) ${tool}**`),
];

const rowsOf = (tools: readonly string[]): readonly (readonly string[])[] =>
  Arr.map(rowNames(tools), nine);

describe("F-pos3: the comparison table has the agreed columns and rows", () => {
  const good = `Intro.\n\n${table(comparisonColumns, rowsOf(comparisonTools))}\n\nAfter.`;

  it("holds for the agreed columns, reebeat and the 13 tools, nine cells each", () => {
    assert.deepStrictEqual(comparisonFindings(good), []);
  });

  it("control: a missing column is reported", () => {
    const header = Arr.filter(
      comparisonColumns,
      (name) => name !== "Reproducibility"
    );

    const short = Arr.map(rowsOf(comparisonTools), (cells) =>
      Arr.filter(cells, (_, index) => index !== 6)
    );

    const findings = comparisonFindings(table(header, short));
    assert.isTrue(mentions(findings, "the header is"));
  });

  it("control: a missing tool row is reported", () => {
    const without = Arr.filter(comparisonTools, (tool) => tool !== "Keynote");

    const findings = comparisonFindings(
      table(comparisonColumns, rowsOf(without))
    );

    assert.isTrue(mentions(findings, "should be Keynote"));
  });

  it("control: a row with eight cells is reported", () => {
    const rows = Arr.map(rowNames(comparisonTools), (name) =>
      Str.includes("Premiere")(name) ? Arr.take(nine(name), 8) : nine(name)
    );

    const findings = comparisonFindings(table(comparisonColumns, rows));
    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "has 8 cells"));
  });

  it("control: a tool out of order is reported", () => {
    const moved = [
      ...Arr.filter(comparisonTools, (tool) => tool !== "Canva"),
      "Canva",
    ];

    const findings = comparisonFindings(
      table(comparisonColumns, rowsOf(moved))
    );

    assert.isAbove(findings.length, 0);
  });

  it("control: a note without the table is reported", () => {
    assert.isTrue(
      mentions(comparisonFindings("# Note\n\nNo table."), "no table")
    );
  });
});

const noteWith = (body: string): string =>
  `# Note\n\n## Performance\n\n${body}\n\n## Experience\n\nreebeat is faster than Remotion, in another section.\n`;

describe("F-pos4: the Performance section makes no unmeasured speed claim", () => {
  it("holds for qualitative text, a figure with a unit and a link target", () => {
    assert.deepStrictEqual(
      speedFindings(
        noteWith(
          "One build took 61.9 s ([spec](../specs/0001-x2-faster-than.md)). Nothing here compares two tools."
        )
      ),
      []
    );
  });

  it("control: a comparison with another tool is reported", () => {
    const findings = speedFindings(
      noteWith("reebeat is faster than Remotion.")
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "faster than"));
  });

  it("control: a ratio is reported", () => {
    const findings = speedFindings(
      noteWith("It is 3x quicker, or 2.5 times better, or 4× more.")
    );

    assert.lengthOf(findings, 3);
  });

  it("holds for the same words inside straight and curly quotations", () => {
    assert.deepStrictEqual(
      speedFindings(
        noteWith(
          'Remotion says "much faster than real-time" and “3x faster than before”.'
        )
      ),
      []
    );
  });

  it("control: a note without the section is reported", () => {
    assert.isTrue(
      mentions(
        speedFindings("# Note\n\n## Other\n\ntext"),
        "no Performance section"
      )
    );
  });
});

describe("F-pos5: the status words agree between the README and the note", () => {
  const readmeTable = table(
    ["Part of the goal", "Status"],
    [
      ["Alpha", "Real today ([spec 0001](a))"],
      ["Beta", "Being built ([spec 0004](b))"],
      ["Gamma", "Roadmap ([#9](c))"],
    ]
  );

  const noteRows = [
    ["Alpha", "Real today", "spec 0001"],
    ["Beta", "Being built", "[spec 0004](b)"],
    ["Gamma", "Roadmap; today nothing", "[#9](c)"],
    ["Delta", "Deferred investigation", "[#20](d)"],
  ];

  const noteOf = (rows: readonly (readonly string[])[]): string =>
    table(["Claim", "Status", "Evidence"], rows);

  const readme = `# reebeat\n\n${readmeTable}\n`;
  const note = noteOf(noteRows);

  it("holds when every README row is in the note with the same words, and the note adds a row", () => {
    assert.deepStrictEqual(statusFindings(readme, note), []);
  });

  it("holds when the first cells differ only in case", () => {
    assert.deepStrictEqual(
      statusFindings(readme, replaced(note, "| Alpha |", "| ALPHA |")),
      []
    );
  });

  it("control: a differing status word is reported", () => {
    const findings = statusFindings(
      readme,
      noteOf(
        Arr.map(noteRows, (cells) =>
          cells.at(0) === "Beta" ? ["Beta", "Real today", "spec 0004"] : cells
        )
      )
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "Beta"));
  });

  it("control: a missing row is reported", () => {
    const findings = statusFindings(
      readme,
      noteOf(Arr.filter(noteRows, (cells) => cells.at(0) !== "Gamma"))
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, 'no row for "Gamma"'));
  });

  it("control: a roadmap item without an issue is reported", () => {
    const findings = statusFindings(
      replaced(readme, "([#9](c))", "(soon)"),
      note
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "names no issue"));
  });

  it("control: an item being built without a spec is reported", () => {
    const findings = statusFindings(
      replaced(readme, "([spec 0004](b))", "(soon)"),
      note
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "names no spec"));
  });

  it("control: a README without the status table is reported", () => {
    assert.isTrue(
      mentions(statusFindings("# reebeat", note), "README has no table")
    );
  });
});

describe("F-pos6: the vocabulary keeps build for reebeat and creating for the author", () => {
  it("control: reebeat creates the video is reported", () => {
    assert.lengthOf(vocabularyFindings("Then reebeat creates the video."), 1);
  });

  it("control: you build the video is reported", () => {
    assert.lengthOf(vocabularyFindings("You build the video by hand."), 1);
  });

  it("control: reebeat as the author is reported", () => {
    assert.lengthOf(
      vocabularyFindings("reebeat is the author of the story."),
      1
    );
  });

  it("holds for you focus on creating and reebeat builds", () => {
    assert.deepStrictEqual(
      vocabularyFindings(
        "We take care of building; you focus on creating. reebeat builds the video and you declare the story."
      ),
      []
    );
  });
});

const howItWorksWith = (extra: string): string =>
  Arr.join(
    [
      "# How reebeat works",
      "",
      "The Build is an incremental DAG: the build graph has no cycles ([Salsa](https://example.org/salsa)).",
      "Own repository: [issue](https://github.com/reebeat/reebeat/issues/9).",
      extra,
      "",
      "## Sources",
      "",
      "- [Salsa](https://example.org/salsa)",
      "- [Statecharts](https://doi.org/10.1016/0167-6423(87)90035-9)",
    ],
    "\n"
  );

describe("F-pos7: how-it-works is sourced and uses DAG for the build graph only", () => {
  it("holds for a DAG line about the build and links that are in Sources", () => {
    assert.deepStrictEqual(
      howItWorksFindings(
        howItWorksWith(
          "A [paper](https://doi.org/10.1016/0167-6423(87)90035-9)."
        )
      ),
      []
    );
  });

  it("control: The Model is a DAG is reported", () => {
    const findings = howItWorksFindings(howItWorksWith("The Model is a DAG."));
    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "DAG"));
  });

  it("control: a DAG line that does not say build is reported", () => {
    assert.lengthOf(
      howItWorksFindings(howItWorksWith("The graph is a DAG.")),
      1
    );
  });

  it("control: an external link missing from Sources is reported", () => {
    const findings = howItWorksFindings(
      howItWorksWith("See [more](https://example.org/more).")
    );

    assert.lengthOf(findings, 1);
    assert.isTrue(mentions(findings, "https://example.org/more"));
  });

  it("control: a note without Sources is reported", () => {
    assert.isTrue(
      mentions(howItWorksFindings("# Note\n\ntext"), "no Sources section")
    );
  });
});

/** A file of the repository, by its path from the root: three levels above this directory. */
const readRepositoryFile = (
  file: string
): Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* readRepositoryFileGen() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(import.meta.dirname, "..", "..", "..");

    return yield* fs.readFileString(path.join(root, file));
  });

describe("the positioning files of this repository", () => {
  const files = Effect.all({
    howItWorks: readRepositoryFile("docs/design/how-it-works.md"),
    positioning: readRepositoryFile("docs/design/positioning.md"),
    readme: readRepositoryFile("README.md"),
    spec: readRepositoryFile("docs/specs/0011-positioning.md"),
  });

  it.effect(
    "F-pos1: the README holds the tagline, the intent and the technical description verbatim",
    () =>
      Effect.gen(function* check() {
        const { readme, spec } = yield* files;
        assert.deepStrictEqual(missingWords(readme, spec), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "F-pos3: the comparison table has the agreed columns and 14 rows of nine cells",
    () =>
      Effect.gen(function* check() {
        const { positioning } = yield* files;
        assert.deepStrictEqual(comparisonFindings(positioning), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "F-pos4: the Performance section has no unmeasured speed claim",
    () =>
      Effect.gen(function* check() {
        const { positioning } = yield* files;
        assert.deepStrictEqual(speedFindings(positioning), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "F-pos5: the README and the note agree on the status of every part",
    () =>
      Effect.gen(function* check() {
        const { positioning, readme } = yield* files;
        assert.deepStrictEqual(statusFindings(readme, positioning), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "F-pos6: the README opening and both notes keep the vocabulary",
    () =>
      Effect.gen(function* check() {
        const { howItWorks, positioning, readme } = yield* files;

        assert.deepStrictEqual(
          [
            ...vocabularyFindings(opening(readme)),
            ...vocabularyFindings(positioning),
            ...vocabularyFindings(howItWorks),
          ],
          []
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "F-pos7: how-it-works uses DAG for the build graph and lists its sources",
    () =>
      Effect.gen(function* check() {
        const { howItWorks } = yield* files;
        assert.deepStrictEqual(howItWorksFindings(howItWorks), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "reads the four files, and the README opening ends before its first section",
    () =>
      Effect.gen(function* check() {
        const { howItWorks, positioning, readme, spec } = yield* files;

        assert.isAbove(howItWorks.length + positioning.length + spec.length, 0);
        assert.isFalse(Str.includes("\n## ")(opening(readme)));
        assert.isTrue(Str.includes("Declarative multimedia")(opening(readme)));
      }).pipe(Effect.provide(NodeServices.layer))
  );
});
