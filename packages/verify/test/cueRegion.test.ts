// cueRegion: where F1 looks for the step of a `next` or `focus` Cue. The k-th `next` of a Scene reveals the k-th hidden
// Element in document order, a `focus` names its Element, an `sfx` has no picture to look at, and the box is the
// Element's ninth of the 1280 x 720 frame (the three columns are 427, 426 and 427 pixels wide, so they tile it).
import { assert, it } from "@effect/vitest";
import { buildPlan } from "@reebeat/core";
import { Array as Arr, Effect, Option } from "effect";

import { cueRegion } from "../src/cueRegion.ts";

const source = Arr.join(
  [
    "# Part",
    "",
    "INT. ONE",
    "",
    "Alpha {#a @tl .box}",
    "Beta {#b @mc .box hidden}",
    "Gamma {#c @br .box hidden}",
    "",
    "NARRATOR",
    "One two. [[next]] Three four. [[focus: a]] Five six. [[next]] Seven. [[sfx: pop]]",
    "",
  ],
  "\n"
);

it.effect(
  "is the cell of the Element a Cue reveals or emphasises, and none for a sound or an unknown Cue",
  () =>
    Effect.gen(function* regions() {
      const planned = yield* buildPlan(source, "0".repeat(64));

      const region = (cue: string) =>
        Option.getOrUndefined(cueRegion(planned, cue));

      // The first `next` reveals Beta (middle centre), the second Gamma (bottom right); the focus is on Alpha (top left).
      assert.deepStrictEqual(region("sc1.l1.c1"), {
        height: 240,
        width: 426,
        x: 427,
        y: 240,
      });
      assert.deepStrictEqual(region("sc1.l1.c2"), {
        height: 240,
        width: 427,
        x: 0,
        y: 0,
      });
      assert.deepStrictEqual(region("sc1.l1.c3"), {
        height: 240,
        width: 427,
        x: 853,
        y: 480,
      });
      assert.isUndefined(region("sc1.l1.c4"));
      assert.isUndefined(region("sc9.l9.c9"));
    })
);
