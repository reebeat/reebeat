// The structure of the IR (spec 0004): ids used once, Chapters and Scenes that agree. One checker, `validateGraph`
// (`src/structure.ts`), serves both ways into the IR: the Fountain importer and the JSON codec. Each rule has a story
// or an IR that breaks exactly that rule, with the tag, the line and the message as a golden, and a valid control; for
// the rules a screenplay can break, the SAME message comes from the importer and from the codec, which is the proof
// that the check lives at one place. The base story has three Scenes in two Sections:
//
//    5  INT. ONE #one#       (Section "Part One", line 3)       Elements a, b      effect s1
//   19  INT. TWO #two#       > AUTO-ANIMATE from one            Elements a, b      let settled, effect s1
//   34  INT. THREE #three#   (Section "Part Two", line 32)      Element a
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Result, Schema, String as Str } from "effect";

import { collectErrors, fountainImporter } from "../src/build.ts";
import type { PlanError } from "../src/errors.ts";
import { freeName } from "../src/grammar.ts";
import { GraphSchema, jsonCodec } from "../src/graph.ts";
import type { Graph } from "../src/graph.ts";
import { validateGraph } from "../src/structure.ts";
import { asText, replacedOnce } from "./support.ts";

const base = asText([
  "Title: Structure",
  "",
  "# Part One",
  "",
  "INT. ONE #one#",
  "",
  "Box {id=a cell=tl class=box}",
  "Tag {id=b cell=tr class=label}",
  "",
  "[[effects",
  '  s1: sound pop at word("hello").end',
  "]]",
  "",
  "NARRATOR",
  "Hello there.",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. TWO #two#",
  "",
  "Box {id=a cell=mc class=box}",
  "Tag {id=b cell=tr class=accent}",
  "",
  "[[effects",
  "  let settled = last(a.move.end, b.update.end)",
  "  s1: sound pop at settled",
  "]]",
  "",
  "NARRATOR",
  "Moving on.",
  "",
  "# Part Two",
  "",
  "INT. THREE #three#",
  "",
  "Box {id=a cell=bc class=box}",
  "",
  "NARRATOR",
  "The end.",
  "",
]);

/** The base story with its only occurrence of `from` replaced by `to`. */
const change = (from: string, to: string): string =>
  replacedOnce(base, from, to);

const first = <A>(items: readonly A[]): A => {
  const [head] = items;

  if (head === undefined) {
    return assert.fail("the base has this member");
  }

  return head;
};

const imported = fountainImporter.import(base);

if (Result.isFailure(imported)) {
  assert.fail("the base story is valid");
}

const graph: Graph = imported.success;

const scene = (index: number): Graph["scenes"][number] => {
  const found = graph.scenes[index];

  return found ?? assert.fail(`the base has Scene ${index}`);
};

/** The base IR with Scene `index` changed. */
const withScene = (
  index: number,
  change_: (scene: Graph["scenes"][number]) => Graph["scenes"][number]
): Graph => ({
  ...graph,
  scenes: Arr.map(graph.scenes, (found, at) =>
    at === index ? change_(found) : found
  ),
});

/** What a rule must produce: the tag, the line and the message (a golden), from a story, from an IR, or from both. */
interface Case {
  readonly fountain?: { readonly line: number; readonly source: string };
  readonly ir?: { readonly line: number; readonly mutated: Graph };
  readonly message: string;
  readonly name: string;
  readonly tag: PlanError["_tag"];
}

const sceneTwo = scene(1);
const settled = first(sceneTwo.events);
const effectOne = first(sceneTwo.effects);

/** The third Scene renamed `id`, in the screenplay (its heading, line 34) and in the IR. */
const thirdNamed = (id: string): Pick<Case, "fountain" | "ir"> => ({
  fountain: { line: 34, source: change("#three#", `#${id}#`) },
  ir: { line: 34, mutated: withScene(2, (found) => ({ ...found, id })) },
});

const sceneUseOfTwo =
  "a different name for each effect and derived event of a Scene";

/** The words of the grammar no id may be, as the message lists them (a literal: a change of the list is seen here). */
const reservedWords =
  "beat, scene, state, transition, word, each, first, last, when, within or let";

const cases: readonly Case[] = [
  {
    fountain: {
      line: 23,
      source: change(
        "Tag {id=b cell=tr class=accent}\n",
        "Tag {id=b cell=tr class=accent}\nAgain {id=a cell=tr class=box}\n"
      ),
    },
    ir: {
      line: 23,
      mutated: withScene(1, (found) => ({
        ...found,
        elements: [
          ...found.elements,
          { ...first(found.elements), cell: "tr", line: 23 },
        ],
      })),
    },
    message:
      'Element id "a" is already used in this Scene (line 21); expected a different id for each Element of a Scene; did you mean a2?',
    name: "an Element id used twice in a Scene",
    tag: "DuplicateId",
  },
  {
    fountain: {
      line: 27,
      source: change(
        "  s1: sound pop at settled\n",
        "  s1: sound pop at settled\n  s1: sound ding at transition.start\n"
      ),
    },
    ir: {
      line: 27,
      mutated: withScene(1, (found) => ({
        ...found,
        effects: [...found.effects, { ...effectOne, line: 27 }],
      })),
    },
    message: `effect id "s1" is already used in this Scene (line 26); expected ${sceneUseOfTwo}; did you mean s2?`,
    name: "an effect id used twice in a Scene",
    tag: "DuplicateId",
  },
  {
    fountain: {
      line: 26,
      source: change(
        "  let settled = last(a.move.end, b.update.end)\n",
        "  let settled = last(a.move.end, b.update.end)\n  let settled = first(a.move.end, b.update.end)\n"
      ),
    },
    ir: {
      line: 26,
      mutated: withScene(1, (found) => ({
        ...found,
        events: [...found.events, { ...settled, line: 26 }],
      })),
    },
    message: `derived event "settled" is already used in this Scene (line 25); expected ${sceneUseOfTwo}; did you mean settled2?`,
    name: "a derived event name used twice in a Scene",
    tag: "DuplicateId",
  },
  {
    fountain: {
      line: 27,
      source: change(
        "  s1: sound pop at settled\n",
        "  s1: sound pop at settled\n  settled: sound ding at transition.start\n"
      ),
    },
    ir: {
      line: 27,
      mutated: withScene(1, (found) => ({
        ...found,
        effects: [...found.effects, { ...effectOne, id: "settled", line: 27 }],
      })),
    },
    message: `effect id "settled" is already used in this Scene (line 25); expected ${sceneUseOfTwo}; did you mean settled2?`,
    name: "an effect id that is the name of a derived event",
    tag: "DuplicateId",
  },
  {
    fountain: {
      line: 27,
      source: change(
        "  s1: sound pop at settled\n",
        "  s1: sound pop at settled\n  let s1 = first(a.move.end, b.update.end)\n"
      ),
    },
    ir: {
      line: 27,
      mutated: withScene(1, (found) => ({
        ...found,
        events: [...found.events, { ...settled, line: 27, name: "s1" }],
      })),
    },
    message: `derived event "s1" is already used in this Scene (line 26); expected ${sceneUseOfTwo}; did you mean s2?`,
    name: "a derived event name that is the id of an effect",
    tag: "DuplicateId",
  },
  {
    ...thirdNamed("one"),
    message:
      'Scene id "one" is already used (line 5); expected a different id for each Scene; did you mean one2?',
    name: "a Scene id used twice in the Story",
    tag: "DuplicateId",
  },
  {
    fountain: {
      line: 36,
      source: change(
        "Box {id=a cell=bc class=box}",
        "Box {id=last cell=bc class=box}"
      ),
    },
    ir: {
      line: 36,
      mutated: {
        ...graph,
        scenes: Arr.map(graph.scenes, (found, at) =>
          at === 2
            ? { ...found, elements: [{ ...first(found.elements), id: "last" }] }
            : found
        ),
      },
    },
    message: `Element id "last" is reserved by the anchor grammar; expected an identifier that is not ${reservedWords}`,
    name: "an Element id that is a word of the grammar",
    tag: "BadProperty",
  },
  {
    ...thirdNamed("state"),
    message: `Scene id "#state#" is not usable; expected an identifier (a letter, then letters, digits, _ and -) that is not ${reservedWords}`,
    name: "a Scene id that is a word of the grammar",
    tag: "BadSceneId",
  },
  {
    fountain: {
      line: 26,
      source: change(
        "  s1: sound pop at settled\n",
        "  scene: sound pop at settled\n"
      ),
    },
    ir: {
      line: 26,
      mutated: withScene(1, (found) => ({
        ...found,
        effects: Arr.map(found.effects, (effect) => ({
          ...effect,
          id: "scene",
        })),
      })),
    },
    message: `effect id "scene" is not usable; expected an identifier that is not ${reservedWords}`,
    name: "an effect id that is a word of the grammar",
    tag: "BadEffect",
  },
  {
    fountain: {
      line: 25,
      source: change("let settled =", "let first ="),
    },
    ir: {
      line: 25,
      mutated: withScene(1, (found) => ({
        ...found,
        events: [{ ...settled, name: "first" }],
      })),
    },
    message: `derived event name "first" is not usable; expected an identifier that is not ${reservedWords}`,
    name: "a derived event name that is a word of the grammar",
    tag: "BadEffect",
  },
  {
    fountain: {
      line: 41,
      source: `${base}\n# Part Three\n`,
    },
    ir: {
      line: 41,
      mutated: {
        ...graph,
        chapters: [
          ...graph.chapters,
          { id: "ch3", line: 41, title: "Part Three" },
        ],
      },
    },
    message:
      'Section "Part Three" (ch3) has no Scene; expected a scene heading after each Section, or delete the Section',
    name: "a Chapter with no Scene",
    tag: "BadChapter",
  },
  {
    ir: {
      line: 32,
      mutated: {
        ...graph,
        chapters: Arr.map(graph.chapters, (found, at) =>
          at === 1 ? { ...found, id: "ch1" } : found
        ),
        scenes: Arr.map(graph.scenes, (found) => ({
          ...found,
          chapterId: "ch1",
        })),
      },
    },
    message:
      'Chapter id "ch1" is already used (line 3); expected a different id for each Chapter; did you mean ch2?',
    name: "a Chapter id used twice",
    tag: "DuplicateId",
  },
  {
    ir: {
      line: 19,
      mutated: withScene(1, (found) => ({ ...found, chapterId: "ch9" })),
    },
    message:
      'Scene two is in the chapter "ch9", which the story does not have; expected ch1 or ch2; did you mean ch1?',
    name: "a Scene in a Chapter the Story does not have",
    tag: "UnknownReference",
  },
  {
    ir: {
      line: 34,
      mutated: {
        ...graph,
        scenes: [
          scene(0),
          { ...scene(1), chapterId: "ch2" },
          { ...scene(2), chapterId: "ch1" },
        ],
      },
    },
    message:
      'Scene three is in the chapter "ch1" but follows a Scene of the chapter "ch2"; expected the Scenes of a chapter standing together, the chapters in their order (ch1, ch2)',
    name: "the Scenes of a Chapter that do not stand together, in the order of the Chapters",
    tag: "BadChapter",
  },
];

const errorsOf = (source: string): readonly PlanError[] =>
  collectErrors(source);

/** What a list of errors says, for a golden: the tag, the line and the message. */
const full = (errors: readonly PlanError[]) =>
  Arr.map(errors, (found) => [found._tag, found.line, found.message]);

const withoutLine = (errors: readonly PlanError[]) =>
  Arr.map(errors, (found) => [found._tag, found.message]);

const placed = (errors: readonly PlanError[]) =>
  Arr.map(errors, (found) => [found._tag, found.line]);

const tagsOf = (errors: readonly PlanError[]) =>
  Arr.map(errors, (found) => found._tag);

/** What the codec says of the IR: its failure message, or `undefined` when it decodes. */
const decodeFailure = (mutated: Graph): string | undefined => {
  // The shape-only schema writes the invalid IR the codec refuses to: the way a hand-written IR reaches `decode`.
  const written = Schema.encodeResult(
    Schema.fromJsonString(GraphSchema, { space: 2 })
  )(mutated);

  if (Result.isFailure(written)) {
    return assert.fail("the shape of the mutated IR is valid");
  }

  const decoded = jsonCodec.decode(written.success);

  return Result.isFailure(decoded) ? decoded.failure.message : undefined;
};

describe("the controls: a valid story and a valid IR have no error", () => {
  it("the base story has no error, and its IR passes the one checker and the codec", () => {
    assert.deepStrictEqual(errorsOf(base), []);
    assert.deepStrictEqual(validateGraph(graph), []);
    assert.isUndefined(decodeFailure(graph));
    assert.isTrue(Result.isSuccess(jsonCodec.encode(graph)));
  });
});

describe("the controls: an id that only contains a word of the grammar is an id", () => {
  it("the ids `lasting`, `state2`, `scenes` and `firsts` of an Element, a Scene, an effect and a derived event are valid, in a story and in an IR", () => {
    const story = change(
      "  let settled = last(a.move.end, b.update.end)\n  s1: sound pop at settled\n",
      "  let firsts = last(a.move.end, b.update.end)\n  scenes: sound pop at firsts\n"
    );

    const source = Str.replace(
      "Box {id=a cell=bc class=box}",
      "Box {id=lasting cell=bc class=box}"
    )(Str.replace("#three#", "#state2#")(story));

    const twoRenamed = withScene(1, (found) => ({
      ...found,
      effects: Arr.map(found.effects, (effect) => ({
        ...effect,
        id: "scenes",
        when: { event: { kind: "ref", name: "firsts" } },
      })),
      events: Arr.map(found.events, (derived) => ({
        ...derived,
        name: "firsts",
      })),
    }));

    const renamed: Graph = {
      ...twoRenamed,
      scenes: Arr.map(twoRenamed.scenes, (found, at) =>
        at === 2
          ? {
              ...found,
              elements: [{ ...first(found.elements), id: "lasting" }],
              id: "state2",
            }
          : found
      ),
    };

    assert.deepStrictEqual(errorsOf(source), []);
    assert.deepStrictEqual(validateGraph(renamed), []);
  });
});

describe("a screenplay that breaks one rule of the structure", () => {
  for (const found of cases) {
    const { fountain } = found;

    if (fountain !== undefined) {
      it(`${found.name}: ${found.tag} at line ${fountain.line}`, () => {
        assert.deepStrictEqual(full(errorsOf(fountain.source)), [
          [found.tag, fountain.line, found.message],
        ]);
      });
    }
  }
});

describe("an IR that breaks one rule of the structure", () => {
  for (const found of cases) {
    const { ir } = found;

    if (ir !== undefined) {
      it(`${found.name}: ${found.tag} at line ${ir.line}`, () => {
        assert.deepStrictEqual(full(validateGraph(ir.mutated)), [
          [found.tag, ir.line, found.message],
        ]);
      });

      it(`${found.name}: the codec refuses to decode it, and to write it`, () => {
        assert.include(
          decodeFailure(ir.mutated),
          `line ${ir.line}, ${found.tag}: ${found.message}`
        );
        assert.isTrue(Result.isFailure(jsonCodec.encode(ir.mutated)));
      });
    }
  }
});

describe("one checker for both ways into the IR", () => {
  it("says the same thing of a screenplay and of the IR it breaks (same tag, same message, its own line)", () => {
    for (const found of cases) {
      const { fountain, ir } = found;

      if (fountain !== undefined && ir !== undefined) {
        assert.deepStrictEqual(
          withoutLine(errorsOf(fountain.source)),
          withoutLine(validateGraph(ir.mutated)),
          found.name
        );
      }
    }
  });

  it("lists every error of an IR in line order, each once", () => {
    const repeated = withScene(1, (found) => ({
      ...found,
      elements: [...found.elements, first(found.elements)],
    }));

    const broken: Graph = {
      ...repeated,
      chapters: [
        ...repeated.chapters,
        { id: "ch3", line: 41, title: "Part Three" },
      ],
      scenes: [...Arr.take(repeated.scenes, 2), { ...scene(2), id: "one" }],
    };

    assert.deepStrictEqual(placed(validateGraph(broken)), [
      ["DuplicateId", 21],
      ["DuplicateId", 34],
      ["BadChapter", 41],
    ]);
  });

  it("has no Scene, no story: an IR without a Scene is EmptyStory at line 1", () => {
    assert.deepStrictEqual(
      placed(validateGraph({ ...graph, chapters: [], scenes: [] })),
      [["EmptyStory", 1]]
    );
  });
});

const withBadReference = (source: string) =>
  Str.replace(
    "  s1: sound pop at settled\n",
    "  s1: sound pop at settled\n  s3: sound pop at nosuch.move.start\n"
  )(source);

describe("a mistake is one error: what it breaks is not checked again", () => {
  it("a Scene with a repeated id reports the repetition, and its references once it is fixed", () => {
    const repeated = withBadReference(
      Str.replace(
        "Tag {id=b cell=tr class=accent}\n",
        "Tag {id=b cell=tr class=accent}\nAgain {id=a cell=tr class=box}\n"
      )(base)
    );

    assert.deepStrictEqual(tagsOf(errorsOf(repeated)), ["DuplicateId"]);
    assert.deepStrictEqual(tagsOf(errorsOf(withBadReference(base))), [
      "UnknownReference",
    ]);
  });

  it("a Scene with no id takes a fallback id that no Scene has, so the repetition is not reported twice", () => {
    const source = Str.replace(
      "INT. TWO #two#",
      "INT. TWO"
    )(Str.replace("#one#", "#sc2#")(base));

    assert.deepStrictEqual(withoutLine(errorsOf(source)), [
      [
        "BadSceneId",
        'Scene heading "INT. TWO" has no id; expected the id between # at the end of the heading, as "INT. THE NEXT SCREEN - DAY #sc4#"; did you mean "INT. TWO #sc3#"?',
      ],
    ]);
  });
});

describe("the name a message suggests", () => {
  it("is the name itself when it is free, else the next free one: the number counted up, or a 2", () => {
    assert.strictEqual(freeName(["a"], "b"), "b");
    assert.strictEqual(freeName(["sc4"], "sc4"), "sc5");
    assert.strictEqual(freeName(["r1", "r2", "r3"], "r1"), "r4");
    assert.strictEqual(freeName(["box"], "box"), "box2");
    assert.strictEqual(freeName(["box", "box2"], "box"), "box3");
  });
});

describe("what the Effect Schema of the IR says and does not say", () => {
  it("the schema of the document accepts what the codec refuses: the JSON Schema is generated from it and has no rule of this kind", () => {
    for (const found of cases) {
      const { ir } = found;

      if (ir !== undefined) {
        assert.isTrue(Schema.is(GraphSchema)(ir.mutated), found.name);
        assert.isDefined(decodeFailure(ir.mutated), found.name);
      }
    }
  });
});

const sound = (event: string) =>
  change(
    "  s1: sound pop at settled\n",
    `  s1: sound pop at settled\n  s2: sound pop at ${event}\n`
  );

/** The base IR with an effect `s2` timed at a State or a Beat `subject` of Scene two. */
const withSecond = (subject: {
  readonly kind: "beat" | "state";
  readonly n: number;
}) =>
  withScene(1, (found) => ({
    ...found,
    effects: [
      ...found.effects,
      {
        ...effectOne,
        id: "s2",
        line: 27,
        when: {
          event: {
            anchor:
              subject.kind === "state"
                ? {
                    event: "enter",
                    kind: "occupancy",
                    state: "dwell",
                    subject: { kind: "state", n: subject.n },
                  }
                : {
                    at: "start",
                    kind: "edge",
                    subject: { kind: "beat", n: subject.n },
                    transition: "change",
                  },
            kind: "anchor",
          },
        },
      },
    ],
  }));

const message = (what: string, most: number): string =>
  `${what} in Scene two, which has at most ${most} (one State, and one more State and one Beat for each show or focus); expected a number from 1 to ${most}`;

describe("a State or a Beat is counted from 1: number 0 is refused by the same rule from both ways in", () => {
  it("refuses state(0) and beat(0) in a screenplay, with the message of the rule", () => {
    assert.deepStrictEqual(full(errorsOf(sound("state(0).enter"))), [
      ["UnknownReference", 27, message("state(0)", 1)],
    ]);
    assert.deepStrictEqual(full(errorsOf(sound("beat(0).start"))), [
      ["UnknownReference", 27, message("beat(0)", 0)],
    ]);
  });

  it("refuses the same State and Beat in an IR, with the same tag and message", () => {
    assert.deepStrictEqual(
      withoutLine(validateGraph(withSecond({ kind: "state", n: 0 }))),
      withoutLine(errorsOf(sound("state(0).enter")))
    );
    assert.deepStrictEqual(
      withoutLine(validateGraph(withSecond({ kind: "beat", n: 0 }))),
      withoutLine(errorsOf(sound("beat(0).start")))
    );
  });

  it("refuses to write and to read an IR with state(0), and takes state(1) as the control", () => {
    const control = withSecond({ kind: "state", n: 1 });

    assert.deepStrictEqual(validateGraph(control), []);

    const written = jsonCodec.encode(control);

    assert.isTrue(Result.isSuccess(written));
    assert.isTrue(
      Result.isFailure(jsonCodec.encode(withSecond({ kind: "state", n: 0 })))
    );

    if (Result.isSuccess(written)) {
      assert.include(written.success, '"n": 1');
      assert.isTrue(Result.isSuccess(jsonCodec.decode(written.success)));
      assert.isTrue(
        Result.isFailure(
          jsonCodec.decode(Str.replace('"n": 1', '"n": 0')(written.success))
        )
      );
    }
  });

  it("takes state(1) in a screenplay: the first State exists in every Scene", () => {
    assert.deepStrictEqual(errorsOf(sound("state(1).enter")), []);
  });
});
