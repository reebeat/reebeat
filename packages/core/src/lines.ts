// The id of a Line (`sc4.l2`), derived and never stored: it is the id of its Scene, a dot, an `l` and the Line's 1-based
// place in the Scene. A Line of the Plan and a TimedLine of the Timeline are addressed by their Scene and their place;
// every label, key and message that names a Line writes it with `lineIdOf`, the one place that says how. Plain functions.
import { Array as Arr } from "effect";

import type { Line, Scene, TimedLine, TimedScene } from "./plan.ts";

/** The id of the Line at `position` (1-based) of the Scene `sceneId`: `sc4.l3`. */
export const lineIdOf = (sceneId: string, position: number): string =>
  `${sceneId}.l${position}`;

/** A Line with the id its Scene and place give it. */
export interface PlacedLine {
  readonly id: string;
  readonly line: Line;
  /** 1-based. */
  readonly position: number;
}

/** The Lines of a Scene with their derived ids, in order. */
export const placedLines = (
  scene: Pick<Scene, "id" | "lines">
): readonly PlacedLine[] =>
  Arr.map(scene.lines, (line, index) => ({
    id: lineIdOf(scene.id, index + 1),
    line,
    position: index + 1,
  }));

/** Every Line of the Plan with its derived id, in story order. */
export const planLines = (plan: {
  readonly scenes: readonly Pick<Scene, "id" | "lines">[];
}): readonly PlacedLine[] => Arr.flatMap(plan.scenes, placedLines);

/** A timed Line with the id its Scene and place give it. */
export interface PlacedTimedLine {
  readonly id: string;
  /** 1-based. */
  readonly position: number;
  readonly timed: TimedLine;
}

/** Every timed Line of a Timeline in order, with its derived id: the Timeline stores none. */
export const timedLines = (timeline: {
  readonly scenes: readonly Pick<TimedScene, "lines" | "sceneId">[];
}): readonly PlacedTimedLine[] =>
  Arr.flatMap(timeline.scenes, (scene) =>
    Arr.map(scene.lines, (timed, index) => ({
      id: lineIdOf(scene.sceneId, index + 1),
      position: index + 1,
      timed,
    }))
  );
