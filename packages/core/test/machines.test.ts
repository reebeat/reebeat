// F2 of spec 0004, the declared machines. `machines.ts` is data and `vocabulary` is a pure function of it: this file
// checks that the data is well formed, that the generated vocabulary has exactly the forms the declarations imply, and
// that every form of every machine MEANS something: for each one a fixture anchor is written in the story of
// `stateStories.ts` and resolved to a frame worked out by hand (or to the error that says why it cannot be). The table
// of expectations must name exactly the forms of the vocabulary, so a transition or a state added to a machine fails
// here until its occurrence rule is written down.
//
// The frames (30 fps; `stateStories.ts` has the arithmetic): the slide change into `main` runs 63 to 87 and the Scene's
// last frame is 179; `box` moves 65 to 87 and `tag` updates 65 to 87 (50 percent by the declared ease is frame 71);
// `fresh` enters 71 to 85; `gone` exits at 63; `note` is shown by `r1` 120 to 124; the `focus` `f1` fires at 138. The
// engine's Beats are 120 to 124 and 138 to 138, so State 1 holds 63 to 120, State 2 124 to 138 and State 3 138 to 179 (left at 180, the first frame out).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Record, String as Str } from "effect";

import {
  aliases,
  finalStates,
  headPlaceholder,
  machines,
  percentToken,
  spelled,
  subjectKinds,
  vocabulary,
} from "../src/machines.ts";
import type { Form, Machine } from "../src/machines.ts";
import {
  firesOf,
  scheduledAt,
  statesSource,
  stepRows,
} from "./stateStories.ts";

const stateNamesOf = (machine: Machine): readonly string[] =>
  Arr.map(machine.states, ({ name }) => name);

const formsOf = (machine: Machine): readonly Form[] =>
  Arr.filter(vocabulary, (form) => form.machine === machine);

describe("the declared machines are well formed", () => {
  it("has one machine per id, each with a declared initial state", () => {
    assert.strictEqual(
      Arr.dedupe(Arr.map(machines, ({ id }) => id)).length,
      machines.length
    );

    for (const machine of machines) {
      assert.include(stateNamesOf(machine), machine.initial, machine.id);
    }
  });

  it("keeps every transition between declared states, with one name each", () => {
    for (const machine of machines) {
      const names = Arr.map(machine.transitions, ({ name }) => name);

      assert.strictEqual(Arr.dedupe(names).length, names.length, machine.id);

      for (const transition of machine.transitions) {
        for (const state of [
          transition.from,
          transition.during,
          transition.to,
        ]) {
          assert.include(
            stateNamesOf(machine),
            state,
            `${machine.id}.${transition.name}`
          );
        }
      }
    }
  });

  it("elides a name only where it is the machine's one transition or one state", () => {
    for (const machine of machines) {
      if (Arr.some(machine.transitions, ({ elide }) => elide === true)) {
        assert.strictEqual(machine.transitions.length, 1, machine.id);
      }

      if (machine.stateElided) {
        assert.strictEqual(machine.states.length, 1, machine.id);
      }
    }
  });

  it("gives every kind of subject a machine, and no machine an unknown kind", () => {
    assert.sameMembers(
      Arr.dedupe(Arr.map(machines, ({ subject }) => subject)),
      [...subjectKinds]
    );
  });

  it("aliases only spellings of the vocabulary", () => {
    const paths = Arr.map(vocabulary, (form) => [
      headPlaceholder[form.machine.subject],
      ...form.tail,
    ]);

    for (const alias of aliases) {
      assert.isTrue(
        Arr.some(paths, (path) =>
          Arr.every(alias.for, (word, index) => path[index] === word)
        ),
        `an alias for ${Arr.join(alias.for, ".")}`
      );
    }
  });
});

describe("the vocabulary is a pure function of the machines", () => {
  it("has, for each machine, three edges and a progress behaviour per transition and two events per state", () => {
    for (const machine of machines) {
      assert.strictEqual(
        formsOf(machine).length,
        4 * machine.transitions.length + 2 * machine.states.length,
        machine.id
      );
    }
  });

  it("generates start, end and percent for a transition, and enter and leave for a state", () => {
    for (const machine of machines) {
      for (const transition of machine.transitions) {
        const own = Arr.filter(
          formsOf(machine),
          (form) => form.kind !== "state" && form.transition === transition
        );

        assert.sameMembers(
          Arr.map(own, (form) =>
            form.kind === "edge" ? form.point : form.kind
          ),
          ["start", "end", "percent", "progress"]
        );
      }

      for (const state of machine.states) {
        const own = Arr.filter(
          formsOf(machine),
          (form) => form.kind === "state" && form.state === state
        );

        assert.sameMembers(
          Arr.map(own, (form) => (form.kind === "state" ? form.event : "")),
          ["enter", "leave"]
        );
      }
    }
  });

  it("writes the names of a state's events as the machine declares them", () => {
    for (const form of vocabulary) {
      if (form.kind === "state") {
        assert.strictEqual(
          form.tail.at(-1),
          form.machine.stateEvents[form.event]
        );
      }
    }
  });

  it("never gives two forms of one kind of subject the same spelling", () => {
    for (const subject of subjectKinds) {
      const spellings = Arr.map(
        Arr.filter(vocabulary, (form) => form.machine.subject === subject),
        (form) => spelled(headPlaceholder[subject], form)
      );

      assert.strictEqual(
        Arr.dedupe(spellings).length,
        spellings.length,
        subject
      );
    }
  });
});

/** What a fixture anchor is expected to do: fire at a frame from a head, or be refused with a Plan error. */
type Expectation =
  | { readonly frame: number; readonly head: string }
  | {
      readonly head: string;
      readonly includes: string;
      readonly refused: string;
    };

const at = (head: string, frame: number): Expectation => ({ frame, head });

const refused = (head: string, tag: string, includes = ""): Expectation => ({
  head,
  includes,
  refused: tag,
});

/** The first frame out of a state held to the end of the Scene is 180, the next slide change: outside this Scene. */
const outsideAt180 = (head: string): Expectation =>
  refused(head, "EffectOutsideScene", "resolves to frame 180");

/** Every form of every machine, keyed by machine and spelling (placeholder head), and where it fires. */
const expectations: Readonly<Record<string, Expectation>> = Record.fromEntries([
  // presence: `fresh` enters (unmatched: 71 to 85, linear in time), `gone` exits at the slide (an instant).
  ["presence <id>.enter.start", at("fresh", 71)],
  ["presence <id>.enter.end", at("fresh", 85)],
  ["presence <id>.enter.<N>%", at("fresh", 78)],
  ["presence <id>.enter.progress", at("fresh", 78)],
  ["presence <id>.exit.start", at("gone", 63)],
  ["presence <id>.exit.end", at("gone", 63)],
  ["presence <id>.exit.<N>%", refused("gone", "BadPercent")],
  ["presence <id>.exit.progress", refused("gone", "BadPercent")],
  ["presence <id>.absent.enter", at("fresh", 63)],
  ["presence <id>.absent.leave", at("fresh", 71)],
  ["presence <id>.entering.enter", at("fresh", 71)],
  ["presence <id>.entering.leave", at("fresh", 85)],
  ["presence <id>.present.enter", at("fresh", 85)],
  ["presence <id>.present.leave", outsideAt180("fresh")],
  ["presence <id>.exiting.enter", at("gone", 63)],
  ["presence <id>.exiting.leave", at("gone", 63)],
  // position: `box` moves 65 to 87, 50 percent of the progress by the declared ease at 65 + round(0.2933 x 22) = 71.
  ["position <id>.move.start", at("box", 65)],
  ["position <id>.move.end", at("box", 87)],
  ["position <id>.move.<N>%", at("box", 71)],
  ["position <id>.move.progress", at("box", 71)],
  ["position <id>.still.enter", at("box", 63)],
  ["position <id>.still.leave", at("box", 65)],
  ["position <id>.moving.enter", at("box", 65)],
  ["position <id>.moving.leave", at("box", 87)],
  // style: `tag` updates over the same window.
  ["style <id>.update.start", at("tag", 65)],
  ["style <id>.update.end", at("tag", 87)],
  ["style <id>.update.<N>%", at("tag", 71)],
  ["style <id>.update.progress", at("tag", 71)],
  ["style <id>.steady.enter", at("tag", 63)],
  ["style <id>.steady.leave", at("tag", 65)],
  ["style <id>.updating.enter", at("tag", 65)],
  ["style <id>.updating.leave", at("tag", 87)],
  // effect: `r1` runs 120 to 124 (a show lasts 4 frames), 50 percent is linear in time: 120 + 2.
  ["effect <id>.start", at("r1", 120)],
  ["effect <id>.end", at("r1", 124)],
  ["effect <id>.<N>%", at("r1", 122)],
  ["effect <id>.progress", at("r1", 122)],
  ["effect <id>.idle.enter", at("r1", 63)],
  ["effect <id>.idle.leave", at("r1", 120)],
  ["effect <id>.active.enter", at("r1", 120)],
  ["effect <id>.active.leave", at("r1", 124)],
  ["effect <id>.done.enter", at("r1", 124)],
  ["effect <id>.done.leave", outsideAt180("r1")],
  // slide: the slide change is 63 to 87, 50 percent at 63 + 12; the Scene is left at its last frame.
  ["slide scene.transition.start", at("scene", 63)],
  ["slide scene.transition.end", at("scene", 87)],
  ["slide scene.transition.<N>%", at("scene", 75)],
  ["slide scene.transition.progress", at("scene", 75)],
  ["slide scene.before.enter", at("scene", 63)],
  ["slide scene.before.leave", at("scene", 63)],
  ["slide scene.changing.enter", at("scene", 63)],
  ["slide scene.changing.leave", at("scene", 87)],
  ["slide scene.shown.enter", at("scene", 87)],
  ["slide scene.shown.leave", outsideAt180("scene")],
  // dwell: State 2 holds from the end of Beat 1 (124) to the start of Beat 2 (138).
  ["dwell state(<n>).enter", at("state(2)", 124)],
  ["dwell state(<n>).leave", at("state(2)", 138)],
  // beat: Beat 1 is the `show` of `r1`, 120 to 124.
  ["beat beat(<n>).start", at("beat(1)", 120)],
  ["beat beat(<n>).end", at("beat(1)", 124)],
  ["beat beat(<n>).<N>%", at("beat(1)", 122)],
  ["beat beat(<n>).progress", at("beat(1)", 122)],
  ["beat beat(<n>).waiting.enter", at("beat(1)", 63)],
  ["beat beat(<n>).waiting.leave", at("beat(1)", 120)],
  ["beat beat(<n>).changing.enter", at("beat(1)", 120)],
  ["beat beat(<n>).changing.leave", at("beat(1)", 124)],
  ["beat beat(<n>).done.enter", at("beat(1)", 124)],
  ["beat beat(<n>).done.leave", outsideAt180("beat(1)")],
]);

const keyOf = (form: Form): string =>
  `${form.machine.id} ${spelled(headPlaceholder[form.machine.subject], form)}`;

/** The anchor as an author writes it: the percent is 50, and a progress behaviour is a threshold event. */
const writtenOf = (head: string, form: Form): string =>
  form.kind === "progress"
    ? `when(${spelled(head, form)} >= 50%)`
    : Str.replace(percentToken, "50%")(spelled(head, form));

describe("every form of every machine resolves", () => {
  it("has an expectation for exactly the forms of the vocabulary", () => {
    assert.sameMembers(Record.keys(expectations), Arr.map(vocabulary, keyOf));
  });

  it.effect(
    "puts a sound at the frame worked out by hand, or refuses it with the Plan error that says why",
    () =>
      Effect.forEach(vocabulary, (form) =>
        Effect.gen(function* resolveForm() {
          const expected = expectations[keyOf(form)];

          if (expected === undefined) {
            assert.fail(`no expectation for ${keyOf(form)}`);
          }

          const source = statesSource([
            ...stepRows,
            `x1: sound pop at ${writtenOf(expected.head, form)}`,
          ]);

          if ("refused" in expected) {
            const error = yield* Effect.flip(scheduledAt(source));

            assert.strictEqual(error._tag, expected.refused, keyOf(form));
            assert.include(error.message, expected.includes, keyOf(form));
          } else {
            assert.deepStrictEqual(
              firesOf(yield* scheduledAt(source), "x1"),
              [expected.frame],
              keyOf(form)
            );
          }
        })
      )
  );
});

const finalOf = (id: string) =>
  Arr.map(
    finalStates(
      Option.getOrThrowWith(
        Arr.findFirst(machines, (machine) => machine.id === id),
        () => new Error(`no machine ${id}`)
      )
    ),
    ({ name }) => name
  );

describe("the final states are derived, never stored", () => {
  it("is the state no transition leaves: done of an effect and of a Beat, shown of the Scene, the dwell of a State", () => {
    assert.deepStrictEqual(finalOf("effect"), ["done"]);
    assert.deepStrictEqual(finalOf("beat"), ["done"]);
    assert.deepStrictEqual(finalOf("slide"), ["shown"]);
    assert.deepStrictEqual(finalOf("dwell"), ["dwell"]);
  });

  it("is no state of an Element: presence can always exit, position and style return to where they began", () => {
    assert.deepStrictEqual(finalOf("presence"), []);
    assert.deepStrictEqual(finalOf("position"), []);
    assert.deepStrictEqual(finalOf("style"), []);
  });

  it("follows the declaration: in a copy of the effect machine with a transition out of `done`, `done` is no longer final", () => {
    const effect = Option.getOrThrowWith(
      Arr.findFirst(machines, ({ id }) => id === "effect"),
      () => new Error("no effect machine")
    );

    const grown = {
      ...effect,
      states: [
        ...effect.states,
        { means: "the effect repeats", name: "again" },
      ],
      transitions: [
        ...effect.transitions,
        {
          during: "again",
          from: "done",
          means: "",
          name: "repeat",
          progress: "time",
          to: "idle",
        },
      ],
    } as const;

    assert.deepStrictEqual(
      Arr.map(finalStates(grown), ({ name }) => name),
      []
    );
  });
});
