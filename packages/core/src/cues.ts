// Cue resolution per Scene (spec 0001, "Cues"): `[[focus: id]]` must name an Element of the Scene, every
// `[[next]]` reveals the next `hidden` Element in document order, and every `hidden` Element must be revealed.
// A plain function over the Scene draft; it returns the errors in the order they are found.
import { Array as Arr } from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import type { SceneDraft } from "./story.ts";

/** The errors of one Scene's Cues and hidden Elements. */
export const resolveCues = (scene: SceneDraft): readonly PlanError[] => {
  const errors: PlanError[] = [];
  const ids = new Set(Arr.map(scene.elements, (element) => element.id));
  const unrevealed = Arr.filter(scene.elements, (element) => element.hidden);

  for (const line of scene.lines) {
    for (const cue of line.cues) {
      if (cue.kind === "focus" && cue.arg !== null && !ids.has(cue.arg)) {
        errors.push(
          planError(
            "CueTargetMissing",
            cue.line,
            `[[focus: ${cue.arg}]] names no Element of this Scene (Scene at line ${scene.line})`
          )
        );
      } else if (cue.kind === "next" && unrevealed.shift() === undefined) {
        errors.push(
          planError(
            "NextWithNothingHidden",
            cue.line,
            `[[next]] has no hidden Element left to reveal in this Scene (Scene at line ${scene.line})`
          )
        );
      }
    }
  }

  for (const element of unrevealed) {
    errors.push(
      planError(
        "HiddenNeverRevealed",
        element.line,
        `hidden Element #${element.id} is never revealed: add a [[next]] to a Line of this Scene`
      )
    );
  }

  return errors;
};
