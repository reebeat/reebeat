// The one-grammar gate on text with a negative control for each kind of copy, and on every package of this repository:
// nothing outside `packages/core/src/grammar.ts`, `plan.ts` and `machines.ts` spells a verb, edge, transition or state
// name, combinator, option, unit, keyword or anchor word in a regular expression, repeats the id rule, or lists the
// members of a closed set as an alternation or an array. The words and the sets are read from the modules that define
// them (the machines generate the anchor spellings, so their transition and state names are part of the grammar).
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  absoluteUnit,
  anchorWords,
  combinatorWords,
  edges,
  keywords,
  offsetUnits,
  optionWords,
  progressWord,
  sfxNames,
  sourceUnits,
  stateEventNames,
  stateNames,
  transitionNames,
  verbs,
} from "@reebeat/core";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  Record,
  String as Str,
} from "effect";
import type { PlatformError } from "effect";

import { copiesIn } from "../grammarCopies.ts";
import type { Vocabulary } from "../grammarCopies.ts";

const vocabulary: Vocabulary = {
  idRule: "A-Za-z0-9_-",
  sets: [
    verbs,
    edges,
    transitionNames,
    stateNames,
    stateEventNames,
    sfxNames,
    Record.values(combinatorWords),
    Record.values(optionWords),
    Record.values(anchorWords),
    offsetUnits,
    Arr.map(sourceUnits, ({ token }) => token),
  ],
  words: [
    ...verbs,
    ...edges,
    ...transitionNames,
    ...stateNames,
    ...stateEventNames,
    ...Arr.filter(
      [...Arr.map(sourceUnits, ({ token }) => token), ...offsetUnits],
      (token) => /^[a-z]{2,}$/u.test(token)
    ),
    ...Record.values(keywords),
    ...Record.values(combinatorWords),
    ...Record.values(optionWords),
    ...Record.values(anchorWords),
    progressWord,
  ],
};

const reasonsOf = (text: string): readonly string[] =>
  Arr.map(copiesIn(text, vocabulary), ({ reason }) => reason);

describe("a copy of the grammar outside grammar.ts is reported", () => {
  it("negative control: a regular expression that spells the keywords of the line", () => {
    assert.deepStrictEqual(
      reasonsOf(
        String.raw`const pattern = /^word\(\s*"(?<phrase>[^"]*)"\)\s+at\s+(?<when>.*)$/u;`
      ),
      ['a regular expression spells "word"', 'a regular expression spells "at"']
    );
  });

  it("negative control: a regular expression that spells an alternation of the closed sets", () => {
    assert.deepStrictEqual(
      reasonsOf(
        "const anchor = /^(?<id>[a-z]+)\\.(move|enter)\\.(start|end)$/u;"
      ),
      [
        'a regular expression spells "move"',
        'a regular expression spells "enter"',
        'a regular expression spells "start"',
        'a regular expression spells "end"',
      ]
    );
  });

  it("negative control: a RegExp built from a string or a template", () => {
    assert.deepStrictEqual(
      reasonsOf(
        'const a = new RegExp("^sound\\\\s"); const b = new RegExp(`^because\\\\s`, "u");'
      ),
      [
        'a regular expression spells "sound"',
        'a regular expression spells "because"',
      ]
    );
  });

  it("negative control: the id rule written again", () => {
    assert.deepStrictEqual(
      reasonsOf("const id = /^[A-Za-z][A-Za-z0-9_-]*$/u;"),
      ["a regular expression repeats the id rule"]
    );
  });

  it("negative control: a string that lists the members of a closed set", () => {
    assert.deepStrictEqual(
      reasonsOf(
        'const edge = "start|end"; const verb = "sound | show"; const unit = "ms|s|f|%";'
      ),
      [
        "a string lists start|end as an alternation",
        "a string lists sound|show|focus as an alternation",
        "a string lists ms|s|f|% as an alternation",
      ]
    );
  });

  it("negative control: an array literal that lists the members of a closed set", () => {
    assert.deepStrictEqual(reasonsOf('const v = ["sound", "show", "focus"];'), [
      "an array lists sound, show, focus of a closed set",
    ]);
  });

  it("negative control: Schema.Literals over a copy of a closed set", () => {
    assert.deepStrictEqual(
      reasonsOf('const E = Schema.Literals(["enter", "exit", "move"]);'),
      [`an array lists ${Arr.join(transitionNames, ", ")} of a closed set`]
    );
  });

  it("negative control: a regular expression that spells the combinators and their options", () => {
    assert.deepStrictEqual(
      reasonsOf(
        String.raw`const event = /^(?:last|first)\(.*throttle=(?<n>\d+)/u; const rule = /^let\s+(?<name>\w+)\s+until/u;`
      ),
      [
        'a regular expression spells "last"',
        'a regular expression spells "first"',
        'a regular expression spells "throttle"',
        'a regular expression spells "let"',
        'a regular expression spells "until"',
      ]
    );
  });

  it("negative control: a regular expression that spells a state, a transition and an anchor word of the machines", () => {
    assert.deepStrictEqual(
      reasonsOf(
        String.raw`const path = /^state\((?<n>\d+)\)\.(?:leave|enter)$/u; const run = /^r1\.run\.done$/u;`
      ),
      [
        'a regular expression spells "state"',
        'a regular expression spells "leave"',
        'a regular expression spells "enter"',
        'a regular expression spells "run"',
        'a regular expression spells "done"',
      ]
    );
  });

  it("negative control: the states of the machines and the words of the combinators listed again", () => {
    assert.deepStrictEqual(
      reasonsOf(
        'const s = ["idle", "active", "done"]; const c = ["last", "first", "each"]; const o = ["throttle", "stagger"];'
      ),
      [
        `an array lists ${Arr.join(stateNames, ", ")} of a closed set`,
        `an array lists ${Arr.join(Record.values(combinatorWords), ", ")} of a closed set`,
        `an array lists ${Arr.join(Record.values(optionWords), ", ")} of a closed set`,
      ]
    );
  });

  it("negative control: the units of an offset and of a duration, stored and written", () => {
    assert.deepStrictEqual(
      reasonsOf(
        'const stored = ["flicks", "f", "percent"]; const re = /(?:flicks|ms)$/u;'
      ),
      [
        `an array lists ${Arr.join(offsetUnits, ", ")} of a closed set`,
        'a regular expression spells "flicks"',
        'a regular expression spells "ms"',
      ]
    );
  });

  it("negative control: a regular expression built by joining a copy of a closed set", () => {
    assert.deepStrictEqual(
      reasonsOf('const r = new RegExp(["start", "end"].join("|"), "u");'),
      ["an array lists start, end of a closed set"]
    );
  });

  it("negative control: the sound names", () => {
    assert.deepStrictEqual(reasonsOf('const n = ["pop", "ding"];'), [
      "an array lists pop, whoosh, ding of a closed set",
    ]);
  });

  it("is quiet about typed uses and about regular expressions that spell no member", () => {
    assert.deepStrictEqual(
      reasonsOf(
        Arr.join(
          [
            'const sound = effect.verb === "sound";',
            'const anchor = { edge: "end", kind: "word" } as const;',
            'const one = ["start", "later"];',
            'const kinds = ["start", "start"];',
            String.raw`const tolerant = /^(?<id>[^\s:]+)\s*:\s*(?<rest>.*)$/u;`,
            String.raw`const pause = /^\(pause\s+(?<seconds>\d+(?:\.\d+)?)\)$/iu;`,
            String.raw`const letters = /[^\p{L}\p{N}]+$/gu;`,
            `const one = "a|b";`,
          ],
          "\n"
        )
      ),
      []
    );
  });
});

interface Source {
  readonly name: string;
  readonly text: string;
}

/** Every `.ts` file under `src` of every package, as `package/relative path`, with its text. */
const sources: Effect.Effect<
  readonly Source[],
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> = Effect.gen(function* sources() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const packages = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "packages"
  );

  const found = yield* Effect.forEach(
    Arr.sort(yield* fs.readDirectory(packages), Order.String),
    (name) =>
      Effect.gen(function* inPackage() {
        const src = path.join(packages, name, "src");

        const files = (yield* fs.exists(src))
          ? Arr.filter(
              yield* fs.readDirectory(src, { recursive: true }),
              (file) => Str.endsWith(".ts")(file)
            )
          : [];

        return yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(path.join(src, file)), (text) => ({
            name: `${name}/src/${file}`,
            text,
          }))
        );
      })
  );

  return Arr.flatten(found);
});

describe("this repository", () => {
  it.effect(
    "spells the effects syntax in grammar.ts, plan.ts and machines.ts only",
    () =>
      Effect.gen(function* repository() {
        const files = yield* sources;

        assert.isAbove(files.length, 100, "the scan reads the packages");
        assert.isTrue(
          Arr.some(files, ({ name }) => name === "core/src/grammar.ts"),
          "and finds the grammar"
        );

        const own = new Set([
          "core/src/grammar.ts",
          "core/src/machines.ts",
          "core/src/plan.ts",
        ]);

        const copies = Arr.flatMap(
          Arr.filter(files, (source: Source) => !own.has(source.name)),
          (source: Source) =>
            Arr.map(
              copiesIn(source.text, vocabulary),
              (copy) =>
                `${source.name}:${copy.line}: ${copy.reason}: ${copy.text}`
            )
        );

        assert.deepStrictEqual(copies, []);
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it("knows the absolute unit and the keywords it scans for", () => {
    assert.include(vocabulary.words, keywords.at);
    assert.notInclude(vocabulary.words, absoluteUnit.token);
  });
});
