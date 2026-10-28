import type { Cue, Line, PlanJson, Timeline } from "@reebeat/core";
// A Plan whose Timeline exists and agrees with its Scenes. The pure functions of this package read only this type.
import { Array as Arr, Option, Result } from "effect";

import { PlanNotScheduled } from "./errors.ts";

export type TimedPlan = PlanJson & { readonly timeline: Timeline };

const planLines = (plan: PlanJson): readonly Line[] =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines);

/** Every Line of the Plan by id. */
export const linesById = (plan: PlanJson): ReadonlyMap<string, Line> =>
  new Map(Arr.map(planLines(plan), (line): [string, Line] => [line.id, line]));

/** Every Cue of the Plan by id. */
export const cuesById = (plan: PlanJson): ReadonlyMap<string, Cue> =>
  new Map(
    Arr.map(
      Arr.flatMap(planLines(plan), (line) => line.cues),
      (cue): [string, Cue] => [cue.id, cue]
    )
  );

const notScheduled = (
  message: string
): Result.Result<never, PlanNotScheduled> =>
  Result.fail(new PlanNotScheduled({ message }));

/** The first disagreement between the Timeline and the Scenes, or undefined. */
const firstDisagreement = (
  plan: PlanJson,
  timeline: Timeline
): string | undefined => {
  const lines = linesById(plan);
  const cues = cuesById(plan);
  const sceneIds = new Set(Arr.map(plan.scenes, (scene) => scene.id));
  const chapterIds = new Set(Arr.map(plan.chapters, (chapter) => chapter.id));

  for (const scene of timeline.scenes) {
    if (!sceneIds.has(scene.sceneId)) {
      return `the Timeline has Scene ${scene.sceneId}, the Plan does not`;
    }

    for (const line of scene.lines) {
      if (!lines.has(line.lineId)) {
        return `the Timeline has Line ${line.lineId}, the Plan does not`;
      }

      const unknownCue = Arr.findFirst(
        line.cues,
        (cue) => !cues.has(cue.cueId)
      );

      if (Option.isSome(unknownCue)) {
        return `the Timeline has Cue ${unknownCue.value.cueId}, the Plan does not`;
      }
    }
  }

  const unknownChapter = Arr.findFirst(
    timeline.chapters,
    (chapter) => !chapterIds.has(chapter.chapterId)
  );

  return Option.isSome(unknownChapter)
    ? `the Timeline has chapter ${unknownChapter.value.chapterId}, the Plan does not`
    : undefined;
};

/** The Plan with its Timeline, or why it cannot be rendered. Every renderer starts here. */
export const requireTimeline = (
  plan: PlanJson
): Result.Result<TimedPlan, PlanNotScheduled> => {
  const { timeline } = plan;

  if (timeline === undefined) {
    return notScheduled("the Plan has no timeline: run the schedule first");
  }

  const disagreement = firstDisagreement(plan, timeline);

  return disagreement === undefined
    ? Result.succeed({ ...plan, timeline })
    : notScheduled(disagreement);
};
