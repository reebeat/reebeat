// The drift check of skill `verify-tsukuri` (spec 0010, V3 and V4): controls on text, then the real map against the real specs
// and the real vocabulary of `@tsukuri/core`. A spec from 0010 on names the map's rows on a `Verify skill:` line; every effect verb,
// sound, anchor kind, Element event and transition has a row.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  anchorWords,
  elementEvents,
  referenceLifecycle,
  sfxNames,
  verbs,
} from "@tsukuri/core";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  Record,
  String as Str,
} from "effect";

import {
  featureRows,
  mapProblems,
  requiredRows,
  specProblems,
} from "../verifyMap.ts";
import type { SpecFile, Vocabulary } from "../verifyMap.ts";

const vocabulary: Vocabulary = {
  anchorKinds: [...Record.values(anchorWords), "element", "effect", "absolute"],
  elementEvents,
  sounds: sfxNames,
  transitions: Record.keys(referenceLifecycle.transitionMs),
  verbs,
};

const header =
  "| id | Feature | Observe | Broken when | Spec |\n| --- | --- | --- | --- | --- |";

const row = (id: string, text = "x"): string =>
  `| \`${id}\` | ${text} | ${text} | ${text} | ${text} |`;

const requiredIds = requiredRows(vocabulary);

/** A map with a row for each required id; `named` gives the text of a row, `without` the rows to leave out. */
const mapOf = (
  named: Readonly<Record<string, string>>,
  without: readonly string[] = []
): string =>
  Arr.join(
    [
      header,
      ...Arr.map(
        Arr.filter(requiredIds, (id) => !Arr.contains(without, id)),
        (id) => row(id, named[id] ?? "x")
      ),
    ],
    "\n"
  );

const completeMap = mapOf({
  "anchor-element": Arr.join(vocabulary.elementEvents, " "),
  "effect-sound": Arr.join(vocabulary.sounds, " "),
});

const spec = (name: string, lines: readonly string[]): SpecFile => ({
  name,
  text: Arr.join(["# T", "", ...lines], "\n"),
});

const ids = ["anchor-word", "effect-sound"];

describe("the feature map against the vocabulary", () => {
  it("a map that has a row for every member of the vocabulary has no problem", () => {
    assert.deepStrictEqual(mapProblems(completeMap, vocabulary), []);
  });

  it("negative control: a map without the focus row", () => {
    assert.deepStrictEqual(
      mapProblems(
        mapOf(
          {
            "anchor-element": "enter exit move update",
            "effect-sound": "pop whoosh ding",
          },
          ["effect-focus"]
        ),
        vocabulary
      ),
      ["the vocabulary needs a row effect-focus"]
    );
  });

  it("negative control: rows that do not name a sound or an Element event", () => {
    assert.deepStrictEqual(mapProblems(mapOf({}), vocabulary), [
      ...Arr.map(
        sfxNames,
        (sound) => `row effect-sound does not name ${sound}`
      ),
      ...Arr.map(
        elementEvents,
        (event) => `row anchor-element does not name ${event}`
      ),
    ]);
  });

  it("negative control: a row with an empty cell and a row listed twice", () => {
    const text = `${completeMap}\n| \`effect-sound\` | a | | c | d |`;

    assert.deepStrictEqual(mapProblems(text, vocabulary), [
      "row effect-sound is listed twice",
      "row effect-sound must have 5 non-empty cells",
      "row effect-sound is listed twice",
    ]);
  });
});

describe("the Verify skill line of a spec", () => {
  it("names rows of the map, or says none with a reason", () => {
    assert.deepStrictEqual(
      specProblems(
        [
          spec("0010-a.md", ["Verify skill: anchor-word, effect-sound"]),
          spec("0011-b.md", [
            "Verify skill: none, a refactor with no visible output",
          ]),
          spec("0012-c.md", [
            "Status: **plan**",
            "Verify skill: pending, rows are written with the code",
          ]),
        ],
        ids
      ),
      []
    );
  });

  it("negative control: a spec from 0010 on without the line", () => {
    assert.deepStrictEqual(specProblems([spec("0010-a.md", [])], ids), [
      '0010-a.md has no "Verify skill:" line',
    ]);
  });

  it("an earlier spec may lack the line, and is checked when it has one", () => {
    assert.deepStrictEqual(specProblems([spec("0004-a.md", [])], ids), []);
    assert.deepStrictEqual(
      specProblems([spec("0004-a.md", ["Verify skill: nowhere"])], ids),
      ['0004-a.md: "nowhere" is not a row of the feature map']
    );
  });

  it("negative control: an id that the map lacks", () => {
    assert.deepStrictEqual(
      specProblems(
        [spec("0010-a.md", ["Verify skill: anchor-word, anchor-gone"])],
        ids
      ),
      ['0010-a.md: "anchor-gone" is not a row of the feature map']
    );
  });

  it("negative control: none or pending without a reason, and pending on a frozen spec", () => {
    assert.deepStrictEqual(
      specProblems(
        [
          spec("0010-a.md", ["Verify skill: none"]),
          spec("0011-b.md", [
            "Status: **built**",
            "Verify skill: pending, later",
          ]),
        ],
        ids
      ),
      [
        '0010-a.md: "none" needs a reason after the comma',
        '0011-b.md: "pending" is only for a spec whose status says plan',
      ]
    );
  });
});

describe("this repository", () => {
  const read = Effect.gen(function* read() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(import.meta.dirname, "..", "..", "..");
    const specs = path.join(root, "docs", "specs");

    const map = yield* fs.readFileString(
      path.join(root, ".agents", "skills", "verify-tsukuri", "features.md")
    );

    const files = yield* Effect.forEach(
      Arr.sort(
        Arr.filter(yield* fs.readDirectory(specs), Str.endsWith(".md")),
        Order.String
      ),
      (name) =>
        Effect.map(fs.readFileString(path.join(specs, name)), (text) => ({
          name,
          text,
        }))
    );

    return { files, map };
  });

  it.effect(
    "the feature map covers the vocabulary and every spec names rows that exist",
    () =>
      Effect.gen(function* repo() {
        const { files, map } = yield* read;

        assert.deepStrictEqual(mapProblems(map, vocabulary), []);

        assert.deepStrictEqual(
          specProblems(
            files,
            Arr.map(featureRows(map), (found) => found.id)
          ),
          []
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );
});
