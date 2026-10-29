// Rule `absolute-times-need-a-reason` (design 4.4.1 rule 4; spec 0002, F5): an effect that pins an absolute time
// (`at 12.5s because "<reason>"`) must say why, because every other time in a Plan is derived from the spoken words
// and the renderer's lifecycle. The source grammar already refuses an absolute time without a reason; this rule reads
// the Plan itself (`Effect.when.absoluteMs`), so a Plan that did not come from the parser is held to it too, and it
// lists every absolute time (severity `info`) so a reviewer sees them all.
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, String as Str } from "effect";

import type { Diagnostic } from "./diagnostic.ts";

export const absoluteTimesRule = "absolute-times-need-a-reason";

export const absoluteTimesListed = "absolute-time";

/** An error for each absolute time whose reason is blank, and an `info` for each absolute time. */
export const absoluteTimesNeedReason = (
  plan: PlanJson
): readonly Diagnostic[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.flatMap(scene.effects, (effect): readonly Diagnostic[] => {
      const { when } = effect;

      if (!("absoluteMs" in when)) {
        return [];
      }

      const seconds = when.absoluteMs / 1000;

      return Str.trim(when.reason) === ""
        ? [
            {
              line: effect.line,
              message: `scene ${scene.id}, effect ${effect.id}: absolute time ${seconds}s has no reason; expected at ${seconds}s because "<why this moment is fixed>"`,
              rule: absoluteTimesRule,
              sceneId: scene.id,
            },
          ]
        : [
            {
              line: effect.line,
              message: `scene ${scene.id}, effect ${effect.id}: absolute time ${seconds}s because "${when.reason}"`,
              rule: absoluteTimesListed,
              sceneId: scene.id,
              severity: "info",
            },
          ];
    })
  );
