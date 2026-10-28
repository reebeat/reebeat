// Where on the frame a Cue's step shows: the grid cell of the Element a `next` Cue reveals or a `focus` Cue emphasises.
// F1 looks for the step there, as the spec words it ("the first frame where the target Element's pixels differ").
// The whole frame is not a good place to look: the encoder leaves a faint flicker on the hard edge of an Element that
// appeared earlier (one scanline of 288 pixels in the committed story's last Scene, once its Line is paced evenly),
// which is larger than the step threshold and would be read as a step three frames early. Elements of one cell stack
// inside it, and a focus ring and its slight scale stay within a cell of a third of the frame.
import type { Element, PlanJson, Scene } from "@reebeat/core";
import type { Box } from "@reebeat/encode-ffmpeg";
import { Array as Arr, Option } from "effect";

/** The cell of the grid as a rectangle of the frame: `tl` is the top left ninth, `mc` the middle one. */
const cellBox = (
  cell: Element["cell"],
  size: { readonly height: number; readonly width: number }
): Box => {
  const row = "tmb".indexOf(cell.charAt(0));
  const column = "lcr".indexOf(cell.charAt(1));
  const left = Math.round((column * size.width) / 3);
  const right = Math.round(((column + 1) * size.width) / 3);
  const top = Math.round((row * size.height) / 3);
  const bottom = Math.round(((row + 1) * size.height) / 3);

  return { height: bottom - top, width: right - left, x: left, y: top };
};

const sceneOf = (plan: PlanJson, cueId: string): Option.Option<Scene> =>
  Arr.findFirst(plan.scenes, (scene) =>
    Arr.some(scene.lines, (line) =>
      Arr.some(line.cues, (cue) => cue.id === cueId)
    )
  );

/**
 * The Element Cue `cueId` acts on: the one a `focus` names, or the k-th hidden Element of the Scene for the k-th
 * `next` Cue of the Scene (document order, the rule the Plan checks). None for an `sfx` Cue or an Element that is not
 * there.
 */
const targetOf = (scene: Scene, cueId: string): Option.Option<Element> => {
  const cues = Arr.flatMap(scene.lines, (line) => line.cues);
  const cue = Arr.findFirst(cues, (candidate) => candidate.id === cueId);

  if (Option.isNone(cue)) {
    return Option.none();
  }

  if (cue.value.kind === "focus") {
    return Arr.findFirst(
      scene.elements,
      (element) => element.id === cue.value.arg
    );
  }

  if (cue.value.kind !== "next") {
    return Option.none();
  }

  const position = Arr.findFirstIndex(
    Arr.filter(cues, (candidate) => candidate.kind === "next"),
    (candidate) => candidate.id === cueId
  );

  return Option.flatMap(position, (index) =>
    Arr.get(
      Arr.filter(scene.elements, (element) => element.hidden),
      index
    )
  );
};

/** The part of the frame in which the step of Cue `cueId` is looked for, or none (look at the whole frame). */
export const cueRegion = (plan: PlanJson, cueId: string): Option.Option<Box> =>
  Option.map(
    Option.flatMap(sceneOf(plan, cueId), (scene) => targetOf(scene, cueId)),
    (element) => cellBox(element.cell, plan.settings)
  );
