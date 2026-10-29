// Rule `effect-fragment-agreement` (spec 0002, F4 of the Deck): a Rendering shows one fragment per `show` or `focus`
// effect of a Scene, in resolved-time order, with the effect's verb and target. A `sound` is not a fragment: it rides
// along with a step or the slide (`stepsOf` and `soundsOf` of `@reebeat/core` say which). The rule compares the Plan
// with a neutral list of the fragments a Rendering shows, so any Renderer's reader can use it; for the reveal.js
// Deck, `readDeck` supplies the list.
import { stepsOf } from "@reebeat/core";
import type { PlanJson, Scene } from "@reebeat/core";
import { Array as Arr } from "effect";

import type { Diagnostic } from "./diagnostic.ts";
import { firstDifference } from "./difference.ts";

export const effectFragmentAgreementRule = "effect-fragment-agreement";

/** One fragment a Rendering shows: the Scene it is in, the effect it stands for, that effect's verb and its target. */
export interface Fragment {
  readonly effectId: string;
  readonly sceneId: string;
  readonly target: string;
  readonly verb: string;
}

interface Wanted {
  readonly effectId: string;
  readonly line: number;
  readonly target: string;
  readonly verb: string;
}

const wantedIn = (plan: PlanJson, scene: Scene): readonly Wanted[] =>
  Arr.map(stepsOf(plan, scene), ({ effect }) => ({
    effectId: effect.id,
    line: effect.line,
    target: effect.target ?? "",
    verb: effect.verb,
  }));

const describe = (
  fragment: { effectId: string; target: string; verb: string } | undefined
): string =>
  fragment === undefined
    ? "no fragment"
    : `${fragment.effectId} (${fragment.verb} ${fragment.target})`;

const same = (want: Wanted, have: Fragment): boolean =>
  want.effectId === have.effectId &&
  want.verb === have.verb &&
  want.target === have.target;

const diagnoseScene = (
  plan: PlanJson,
  scene: Scene,
  fragments: readonly Fragment[]
): readonly Diagnostic[] => {
  const wanted = wantedIn(plan, scene);
  const found = Arr.filter(fragments, ({ sceneId }) => sceneId === scene.id);
  const position = firstDifference(wanted, found, same);

  if (position === undefined) {
    return [];
  }

  const want = wanted[position];

  const diagnostic: Diagnostic = {
    index: position,
    message: `scene ${scene.id}, fragment ${position}: the Plan says ${describe(want)}, the fragments have ${describe(found[position])}`,
    rule: effectFragmentAgreementRule,
    sceneId: scene.id,
  };

  // An extra fragment has no effect, so no source line to point at.
  return [want === undefined ? diagnostic : { ...diagnostic, line: want.line }];
};

/**
 * One diagnostic per Scene whose fragments differ from its `show` and `focus` effects, at the first difference: a
 * missing, extra, swapped, re-kinded or re-targeted fragment. Fragments of a Scene the Plan does not have are ignored
 * here (a Renderer's own check reports a page with the wrong slides).
 */
export const effectFragmentAgreement = (
  plan: PlanJson,
  fragments: readonly Fragment[]
): readonly Diagnostic[] =>
  Arr.flatMap(plan.scenes, (scene) => diagnoseScene(plan, scene, fragments));
