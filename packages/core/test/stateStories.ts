// The story the state-machine tests share (spec 0004): two Scenes, `intro` and `main`, whose `main` Scene has an effects
// block that each test fills. Every duration is worked out by hand at 30 fps with `support.lifecycle` (Auto-Animate
// 800 ms = 24 frames, matched Elements start 2 frames in, an unmatched Element fades in over frames 8 to 22, a `show`
// lasts 4 frames) and the default pacing (sceneLead 1 s = 30 frames, lineGap 0.5 s, sceneTail 0.5 s), with every word
// spoken in 300 ms = 9 frames:
//
//   intro   slide 0    "One two."                          words 30..39..48, ends 48 + 15 = 63
//   main    slide 63   "Alpha bravo charlie delta echo     alpha 93..102, bravo ..111, charlie ..120, delta ..129,
//                       foxtrot golf hotel."                echo ..138, foxtrot ..147, golf ..156, hotel ..165;
//                                                           the Scene ends at 165 + 15 = 180 (its last frame is 179)
//
// `main` is joined to `intro` by `> AUTO-ANIMATE`: `box` moves (cell ml to mc), `tag` updates (class label to accent),
// `fresh` enters, `gone` exits and `note` starts hidden (a `show` reveals it). The slide change runs from 63 to 87.
import { Array as Arr, Effect, Result } from "effect";

import { fountainImporter, planOf } from "../src/build.ts";
import type { RenderRate } from "../src/build.ts";
import type { PlanJson, TimedEffect, TimedScene } from "../src/plan.ts";
import { schedule } from "../src/schedule.ts";
import { asText, evenlySpoken, fixtureSha256, lifecycle } from "./support.ts";

/** The time each word takes: 300 ms, 9 frames at 30 fps. */
const wordMs = 300;

/** The steps every story of the walk has: a `show` of `note` (frames 120 to 124) and a `focus` of `box` (frame 138 to its `until` at 156). */
export const stepRows: readonly string[] = [
  'r1: show note at word("charlie").end',
  'f1: focus box at word("foxtrot").start until word("hotel").start',
];

/** The Fountain source: `rows` are the lines of the effects block of `main`, each written as the author would. */
export const statesSource = (rows: readonly string[]): string =>
  asText([
    "Title: States",
    "",
    "# Part",
    "",
    "INT. INTRO #intro#",
    "",
    "Box {id=box cell=ml class=box}",
    "Tag {id=tag cell=tl class=label}",
    "Gone {id=gone cell=mr class=box}",
    "",
    "NARRATOR",
    "One two.",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. MAIN #main#",
    "",
    "Box {id=box cell=mc class=box}",
    "Tag {id=tag cell=tl class=accent}",
    "Fresh {id=fresh cell=bc class=title}",
    "Note {id=note cell=br class=muted visible=false}",
    "",
    "[[effects",
    ...Arr.map(rows, (row) => `  ${row}`),
    "]]",
    "",
    "NARRATOR",
    "Alpha bravo charlie delta echo foxtrot golf hotel.",
    "",
  ]);

const rate30: RenderRate = { fps: 30, ntsc: false };

/** The Plan of the source at a frame rate, or the first error in document order. */
const planAt = (source: string, rate: RenderRate) =>
  Effect.fromResult(
    Result.map(
      Result.mapError(fountainImporter.import(source), Arr.headNonEmpty),
      (graph) => planOf(graph, fixtureSha256, rate)
    )
  );

/** The source, planned at `rate`, then scheduled with every word spoken in `wordMs`. */
export const scheduledAt = (source: string, rate: RenderRate = rate30) =>
  Effect.flatMap(planAt(source, rate), (plan) =>
    schedule(plan, evenlySpoken(plan, wordMs), lifecycle)
  );

/** The scheduled Scene `main` of a scheduled Plan. */
export const mainOf = (plan: PlanJson): TimedScene => {
  const found = plan.timeline?.scenes[1];

  if (found === undefined) {
    throw new Error("the Plan has no Scene main");
  }

  return found;
};

/** The instances of effect `id` in `main`, in time order. */
export const instancesOf = (
  plan: PlanJson,
  id: string
): readonly TimedEffect[] =>
  Arr.filter(mainOf(plan).effects, (timed) => timed.effectId === id);

/** The fire frames of the instances of effect `id` in `main`. */
export const firesOf = (plan: PlanJson, id: string): readonly number[] =>
  Arr.map(instancesOf(plan, id), (timed) => timed.fireFrame);
