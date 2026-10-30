// The Lines and timed Lines of a Plan as flat lists: one place for the nested `flatMap`s that the checks share.
import type { Line, PlanJson, TimedLine, Timeline } from "@tsukuri/core";
import { Array as Arr } from "effect";

/** Every Line of the Plan in document order. */
export const planLines = (plan: PlanJson): readonly Line[] =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines);

/** Every timed Line of the Timeline in order. */
export const timedLines = (timeline: Timeline): readonly TimedLine[] =>
  Arr.flatMap(timeline.scenes, (scene) => scene.lines);
