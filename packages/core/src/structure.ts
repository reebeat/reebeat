// The checks of a Story as the IR declares it (spec 0004), at ONE place: `validateGraph`. Both ways into the IR go
// through it: the Fountain importer (`build.ts`) and the JSON codec (`graph.ts`, a check of `GraphSchema`), so a
// hand-written IR is held to the same rules as a screenplay. The rules:
//
//   - a Scene id is used once in the Story;
//   - an Element id is used once in its Scene; an effect id and a derived event name share one namespace in their Scene;
//   - a Chapter id is used once, every Scene names a Chapter that exists, the Scenes of a Chapter stand together in the
//     order of the Chapters, and every Chapter has a Scene;
//   - the Story has a Scene;
//   - and, for each Scene that passes the above, the references of its effects (`validate.ts`).
//
// Each error is a Plan error with the line of the construct (the source line it was read from, or the `line` the IR
// carries), what was found, what was expected and, where a name is involved, the nearest free or valid one. Plain
// functions.
import { Array as Arr, Option, Order } from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  didYouMean,
  freeName,
  oneOf,
  problem,
  reservedIds,
} from "./grammar.ts";
import { withIdentity } from "./identity.ts";
import type { Chapter, Scene } from "./plan.ts";
import { validateScene } from "./validate.ts";

/** What the checks read of the IR: its Chapters and its Scenes as declared (the identity diff is derived). */
export interface Declared {
  readonly chapters: readonly Chapter[];
  readonly scenes: readonly Omit<Scene, "identity">[];
}

/** What the reader of a foreign format already knows about the Scenes it read. */
export interface Known {
  /**
   * A Scene whose errors were reported where it was read (a line of it did not parse, or no Section holds it): its
   * references and its Chapter are not checked again, so one mistake is one error.
   */
  readonly invalid?: (index: number) => boolean;
}

/** A name with the line it stands on and what it names, for the message. */
interface Named {
  readonly line: number;
  readonly name: string;
  readonly what: string;
}

/** Every item whose name an earlier item has, with that earlier item. */
const repeats = (
  items: readonly Named[]
): readonly (readonly [Named, Named])[] =>
  Arr.flatMap(items, (item, index) =>
    Option.match(
      Arr.findFirst(
        Arr.take(items, index),
        (earlier) => earlier.name === item.name
      ),
      { onNone: () => [], onSome: (earlier) => [[item, earlier] as const] }
    )
  );

const duplicateErrors = (
  items: readonly Named[],
  expected: string,
  taken: readonly string[],
  scope = ""
): readonly PlanError[] =>
  Arr.map(repeats(items), ([item, earlier]) =>
    planError(
      "DuplicateId",
      item.line,
      problem(
        `${item.what} "${item.name}" is already used${scope} (line ${earlier.line})`,
        expected,
        freeName(taken, item.name)
      )
    )
  );

const inThisScene = " in this Scene";

/** What an id may not be: a word the grammar starts a path or a call with (`reservedIds`). */
const notReserved = `an identifier that is not ${oneOf(reservedIds)}`;

/** The ids that are words the grammar uses, each as the message of its kind says it (the tag and the text are the reader's). */
const reservedErrors = (
  items: readonly Named[],
  tag: PlanError["_tag"],
  message: (id: string) => string
): readonly PlanError[] =>
  Arr.flatMap(items, (item) =>
    Arr.contains(reservedIds, item.name)
      ? [planError(tag, item.line, message(item.name))]
      : []
  );

/** A Scene id that is a word of the grammar: it is written `#id#` in its heading, and the message says so. */
const sceneIdErrors = (
  scenes: readonly Omit<Scene, "identity">[]
): readonly PlanError[] => [
  ...reservedErrors(
    Arr.map(scenes, (scene) => ({
      line: scene.line,
      name: scene.id,
      what: "Scene id",
    })),
    "BadSceneId",
    (id) =>
      problem(
        `Scene id "#${id}#" is not usable`,
        `an identifier (a letter, then letters, digits, _ and -) that is not ${oneOf(reservedIds)}`
      )
  ),
  ...duplicateErrors(
    Arr.map(scenes, (scene) => ({
      line: scene.line,
      name: scene.id,
      what: "Scene id",
    })),
    "a different id for each Scene",
    Arr.map(scenes, (scene) => scene.id)
  ),
];

const byLine = Order.mapInput(Order.Number, (found: PlanError) => found.line);
const byItemLine = Order.mapInput(Order.Number, (item: Named) => item.line);

/** The ids of one Scene: its Elements, and its effects and derived events, which share one namespace. */
const sceneErrors = (scene: Omit<Scene, "identity">): readonly PlanError[] => {
  const names: readonly Named[] = Arr.sort(
    [
      ...Arr.map(scene.effects, (effect) => ({
        line: effect.line,
        name: effect.id,
        what: "effect id",
      })),
      ...Arr.map(scene.events, (derived) => ({
        line: derived.line,
        name: derived.name,
        what: "derived event",
      })),
    ],
    byItemLine
  );

  return [
    ...reservedErrors(
      Arr.map(scene.elements, (element) => ({
        line: element.line,
        name: element.id,
        what: "Element id",
      })),
      "BadProperty",
      (id) =>
        problem(
          `Element id "${id}" is reserved by the anchor grammar`,
          notReserved
        )
    ),
    ...reservedErrors(
      Arr.map(scene.effects, (effect) => ({
        line: effect.line,
        name: effect.id,
        what: "effect id",
      })),
      "BadEffect",
      (id) => problem(`effect id "${id}" is not usable`, notReserved)
    ),
    ...reservedErrors(
      Arr.map(scene.events, (derived) => ({
        line: derived.line,
        name: derived.name,
        what: "derived event",
      })),
      "BadEffect",
      (id) => problem(`derived event name "${id}" is not usable`, notReserved)
    ),
    ...duplicateErrors(
      Arr.map(scene.elements, (element) => ({
        line: element.line,
        name: element.id,
        what: "Element id",
      })),
      "a different id for each Element of a Scene",
      Arr.map(scene.elements, (element) => element.id),
      inThisScene
    ),
    ...duplicateErrors(
      names,
      "a different name for each effect and derived event of a Scene",
      Arr.map(names, ({ name }) => name),
      inThisScene
    ),
  ];
};

const chapterIdsOf = (graph: Declared): readonly string[] =>
  Arr.map(graph.chapters, (chapter) => chapter.id);

/** The Chapters: ids used once, every Scene in one that exists, in order and together, and no Chapter without a Scene. */
const chapterErrors = (
  graph: Declared,
  invalid: (index: number) => boolean
): readonly PlanError[] => {
  const ids = chapterIdsOf(graph);
  const placed = Arr.map(graph.scenes, (scene) => ids.indexOf(scene.chapterId));

  return [
    ...duplicateErrors(
      Arr.map(graph.chapters, (chapter) => ({
        line: chapter.line,
        name: chapter.id,
        what: "Chapter id",
      })),
      "a different id for each Chapter",
      ids
    ),
    ...Arr.flatMap(graph.scenes, (scene, index): readonly PlanError[] => {
      const at = placed[index] ?? -1;

      if (invalid(index)) {
        return [];
      }

      if (at === -1) {
        return [
          planError(
            "UnknownReference",
            scene.line,
            problem(
              `Scene ${scene.id} is in the chapter "${scene.chapterId}", which the story does not have`,
              ids.length === 0 ? "a Chapter" : oneOf(ids),
              didYouMean(scene.chapterId, ids)
            )
          ),
        ];
      }

      const before = Arr.findLast(
        Arr.take(placed, index),
        (found) => found >= 0
      );

      return Option.isSome(before) && at < before.value
        ? [
            planError(
              "BadChapter",
              scene.line,
              problem(
                `Scene ${scene.id} is in the chapter "${scene.chapterId}" but follows a Scene of the chapter "${ids[before.value] ?? ""}"`,
                `the Scenes of a chapter standing together, the chapters in their order (${Arr.join(ids, ", ")})`
              )
            ),
          ]
        : [];
    }),
    ...Arr.flatMap(graph.chapters, (chapter): readonly PlanError[] =>
      Arr.some(graph.scenes, (scene) => scene.chapterId === chapter.id)
        ? []
        : [
            planError(
              "BadChapter",
              chapter.line,
              problem(
                `Section "${chapter.title}" (${chapter.id}) has no Scene`,
                "a scene heading after each Section, or delete the Section"
              )
            ),
          ]
    ),
  ];
};

/**
 * Every error of the IR in line order (ties keep the order the rules run in). A Scene with an id error, or that
 * `known` says is already reported, is not cross-checked for its references, and neither is a Scene that Auto-Animate
 * joins to one: its references would only echo the mistake.
 */
export const validateGraph = (
  graph: Declared,
  known: Known = {}
): readonly PlanError[] => {
  const invalid = known.invalid ?? (() => false);
  const perScene = Arr.map(graph.scenes, sceneErrors);

  const unchecked = (index: number): boolean =>
    invalid(index) || (perScene[index]?.length ?? 0) > 0;

  return Arr.sort(
    [
      ...(graph.scenes.length === 0
        ? [
            planError(
              "EmptyStory",
              1,
              "the source has no Scene: write a scene heading"
            ),
          ]
        : []),
      ...sceneIdErrors(graph.scenes),
      ...chapterErrors(graph, invalid),
      ...Arr.flatten(perScene),
      ...Arr.flatMap(withIdentity(graph.scenes), (scene, index) =>
        unchecked(index) || (scene.identity !== null && unchecked(index - 1))
          ? []
          : validateScene(scene)
      ),
    ],
    byLine
  );
};
