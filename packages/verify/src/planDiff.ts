// Where two Plans first differ, as a path (`scenes.sc3.lines.sc3.l1.text`). Plain structural comparison with
// Effect's `Equal`, field by field in document order; the Timeline is not compared (it exists only in `plan.json`).
import type { Cue, Element, Line, PlanJson, Scene } from "@reebeat/core";
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

const cueDifference = (path: string, left: Cue, right: Cue) =>
  firstOf([
    () => leaf(`${path}.kind`, left.kind, right.kind),
    () => leaf(`${path}.arg`, left.arg, right.arg),
    () => leaf(`${path}.afterWord`, left.afterWord, right.afterWord),
    () => leaf(`${path}.line`, left.line, right.line),
  ]);

const lineDifference = (path: string, left: Line, right: Line) =>
  firstOf([
    () => leaf(`${path}.text`, left.text, right.text),
    () => leaf(`${path}.words`, left.words, right.words),
    () => leaf(`${path}.hints`, left.hints, right.hints),
    () => leaf(`${path}.line`, left.line, right.line),
    () => members(`${path}.cues`, left.cues, right.cues, cueDifference),
  ]);

const elementDifference = (path: string, left: Element, right: Element) =>
  firstOf([
    () => leaf(`${path}.text`, left.text, right.text),
    () => leaf(`${path}.cell`, left.cell, right.cell),
    () => leaf(`${path}.classes`, left.classes, right.classes),
    () => leaf(`${path}.hidden`, left.hidden, right.hidden),
    () => leaf(`${path}.line`, left.line, right.line),
  ]);

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
    () => members(`${path}.lines`, left.lines, right.lines, lineDifference),
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
