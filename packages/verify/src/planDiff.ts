// Where two Plans first differ, as a path (`scenes.sc3.lines.sc3.l1.text`). Plain structural comparison with
// Effect's `Equal`, field by field in document order; the Timeline is not compared (it exists only in `plan.json`).
import { placedLines } from "@tsukuri/core";
import type { Effect, Element, Line, PlanJson, Scene } from "@tsukuri/core";
import { Array as Arr, Equal, Option, Predicate, String as Str } from "effect";

/** What a field of a Plan can hold. */
type Leaf =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Leaf[]
  | { readonly [key: string]: Leaf };

const shown = (value: Leaf): string => {
  const text =
    Predicate.isString(value) ||
    Predicate.isNumber(value) ||
    Predicate.isBoolean(value)
      ? String(value)
      : "(a structure)";

  return text.length > 60 ? `${Str.slice(0, 57)(text)}...` : text;
};

/** A leaf field: undefined when equal, else a sentence with the path and both values. */
const leaf = (path: string, left: Leaf, right: Leaf): string | undefined =>
  Equal.equals(left, right)
    ? undefined
    : `${path}: plan.json has ${shown(left)}, the Plan of the source has ${shown(right)}`;

/** The first problem of a list of lazy comparisons. */
const firstOf = (
  comparisons: readonly (() => string | undefined)[]
): string | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      Arr.map(comparisons, (compare) => compare()),
      (problem) => problem !== undefined
    )
  );

/** Lists of the same length whose members are compared pairwise and named by their `id`. */
const members = <A extends { readonly id: string }>(
  path: string,
  left: readonly A[],
  right: readonly A[],
  inner: (path: string, left: A, right: A) => string | undefined
): string | undefined =>
  left.length === right.length
    ? firstOf(
        Arr.map(
          Arr.zip(left, right),
          ([a, b]) =>
            () =>
              inner(`${path}.${a.id}`, a, b)
        )
      )
    : `${path}: plan.json has ${left.length} items, the Plan of the source has ${right.length}`;

const effectDifference = (path: string, left: Effect, right: Effect) =>
  firstOf([
    () => leaf(`${path}.verb`, left.verb, right.verb),
    () => leaf(`${path}.name`, left.name, right.name),
    () => leaf(`${path}.target`, left.target, right.target),
    () => leaf(`${path}.when`, left.when, right.when),
    () => leaf(`${path}.until`, left.until, right.until),
    () => leaf(`${path}.line`, left.line, right.line),
  ]);

const lineDifference = (path: string, left: Line, right: Line) =>
  firstOf([
    () => leaf(`${path}.text`, left.text, right.text),
    () => leaf(`${path}.hints`, left.hints, right.hints),
    () => leaf(`${path}.line`, left.line, right.line),
  ]);

const elementDifference = (path: string, left: Element, right: Element) =>
  firstOf([
    () => leaf(`${path}.text`, left.text, right.text),
    () => leaf(`${path}.cell`, left.cell, right.cell),
    () => leaf(`${path}.class`, left.class, right.class),
    () => leaf(`${path}.visible`, left.visible, right.visible),
    () => leaf(`${path}.line`, left.line, right.line),
  ]);

/** The Lines of a Scene named by their derived ids, which a Plan does not store (`sc3.l1`). */
const named = (scene: Scene): readonly (Line & { readonly id: string })[] =>
  Arr.map(placedLines(scene), ({ id, line }) => ({ ...line, id }));

const sceneDifference = (path: string, left: Scene, right: Scene) =>
  firstOf([
    () => leaf(`${path}.heading`, left.heading, right.heading),
    () => leaf(`${path}.chapterId`, left.chapterId, right.chapterId),
    () => leaf(`${path}.transition`, left.transition, right.transition),
    () => leaf(`${path}.identity`, left.identity, right.identity),
    () => leaf(`${path}.line`, left.line, right.line),
    () =>
      members(
        `${path}.elements`,
        left.elements,
        right.elements,
        elementDifference
      ),
    () => members(`${path}.lines`, named(left), named(right), lineDifference),
    () =>
      members(`${path}.effects`, left.effects, right.effects, effectDifference),
  ]);

/** The path and values of the first difference between two Plans (their Timelines apart), or undefined. */
export const planDifference = (
  left: PlanJson,
  right: PlanJson
): string | undefined =>
  firstOf([
    () => leaf("schema", left.schema, right.schema),
    () => leaf("title", left.title, right.title),
    () => leaf("author", left.author, right.author),
    () => leaf("sourceSha256", left.sourceSha256, right.sourceSha256),
    () => leaf("settings", left.settings, right.settings),
    () => leaf("chapters", left.chapters, right.chapters),
    () => members("scenes", left.scenes, right.scenes, sceneDifference),
  ]);
