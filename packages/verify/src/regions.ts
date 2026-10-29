// Where on the frame an Element is: the grid cell of the Plan as a rectangle of the 1280 x 720 frame (the three
// columns are 427, 426 and 427 pixels wide, so they tile it). F1 looks for an Element's events there, because the whole
// frame is a poor place to look: the encoder leaves a faint flicker on the hard edge of an Element that appeared
// earlier, larger than the step threshold. Elements of one cell stack inside it, and a focus ring and its slight scale
// stay within a cell of a third of the frame.
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

/** The smallest rectangle that holds both. */
export const unionBox = (first: Box, second: Box): Box => {
  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);

  return { height: bottom - top, width: right - left, x: left, y: top };
};

/** The Element `id` of a Scene. */
const elementOf = (
  scene: Scene | undefined,
  id: string
): Option.Option<Element> =>
  Option.fromNullishOr(scene).pipe(
    Option.flatMap((found) =>
      Arr.findFirst(found.elements, (element) => element.id === id)
    )
  );

/** The rectangle of Element `id` in Scene `index` of the Plan, or none when the Scene has no such Element. */
export const elementBox = (
  plan: PlanJson,
  index: number,
  id: string
): Option.Option<Box> =>
  Option.map(elementOf(plan.scenes[index], id), (element) =>
    cellBox(element.cell, plan.settings)
  );
