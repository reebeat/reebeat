// Rule `cue-fragment-agreement` (spec 0001, F4): a Rendering shows one fragment per Cue, in the Plan's order, with
// the Cue's kind and argument. The rule compares the Plan with a neutral list of the fragments a Rendering shows,
// so any Renderer's reader can use it; for the reveal.js Deck, `readDeck` supplies the list.
import type { PlanJson, Scene } from "@reebeat/core";
import { Array as Arr, Option } from "effect";

import type { Diagnostic } from "./diagnostic.ts";

export const cueFragmentAgreementRule = "cue-fragment-agreement";

/** One fragment a Rendering shows: the Scene it is in, the Cue it stands for, and that Cue's kind and argument. */
export interface Fragment {
  readonly arg: string;
  readonly cueId: string;
  readonly kind: string;
  readonly sceneId: string;
}

interface Wanted {
  readonly arg: string;
  readonly cueId: string;
  readonly kind: string;
  readonly line: number;
}

const wantedIn = (scene: Scene): readonly Wanted[] =>
  Arr.map(
    Arr.flatMap(scene.lines, (line) => line.cues),
    (cue) => ({
      arg: cue.arg ?? "",
      cueId: cue.id,
      kind: cue.kind,
      line: cue.line,
    })
  );

const describe = (
  fragment: { arg: string; cueId: string; kind: string } | undefined
): string =>
  fragment === undefined
    ? "no fragment"
    : `${fragment.cueId} (${fragment.kind}${fragment.arg === "" ? "" : `: ${fragment.arg}`})`;

const same = (want: Wanted, have: Fragment): boolean =>
  want.cueId === have.cueId && want.kind === have.kind && want.arg === have.arg;

/** The first position at which the Scene's Cues and its fragments differ (a missing or extra member counts). */
const firstDifference = (
  wanted: readonly Wanted[],
  found: readonly Fragment[]
): number | undefined =>
  Option.match(
    Arr.findFirstIndex(
      Arr.zip(wanted, found),
      ([want, have]) => !same(want, have)
    ),
    {
      onNone: () =>
        wanted.length === found.length
          ? undefined
          : Math.min(wanted.length, found.length),
      onSome: (position) => position,
    }
  );

const diagnoseScene = (
  scene: Scene,
  fragments: readonly Fragment[]
): readonly Diagnostic[] => {
  const wanted = wantedIn(scene);
  const found = Arr.filter(fragments, ({ sceneId }) => sceneId === scene.id);
  const position = firstDifference(wanted, found);

  if (position === undefined) {
    return [];
  }

  const want = wanted[position];

  const diagnostic: Diagnostic = {
    index: position,
    message: `scene ${scene.id}, fragment ${position}: the Plan says ${describe(want)}, the fragments have ${describe(found[position])}`,
    rule: cueFragmentAgreementRule,
    sceneId: scene.id,
  };

  // An extra fragment has no Cue, so no source line to point at.
  return [want === undefined ? diagnostic : { ...diagnostic, line: want.line }];
};

/**
 * One diagnostic per Scene whose fragments differ from its Cues, at the first difference: a missing, extra,
 * swapped, re-kinded or re-argued fragment. Fragments of a Scene the Plan does not have are ignored here (a
 * Renderer's own check reports a page with the wrong slides).
 */
export const cueFragmentAgreement = (
  plan: PlanJson,
  fragments: readonly Fragment[]
): readonly Diagnostic[] =>
  Arr.flatMap(plan.scenes, (scene) => diagnoseScene(scene, fragments));
