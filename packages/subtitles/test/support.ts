// A scheduled Plan built by the real core: three Lines of 500 ms a word, so every frame is a whole number and the
// expected timestamps can be worked out by hand (a Line starts `sceneLead` = 1 s after its slide frame).
import {
  buildPlan,
  lineIdOf,
  planLines,
  referenceLifecycle,
  requireTimeline,
  schedule,
  wordsOf,
} from "@tsukuri/core";
import type {
  AlignedLine,
  PlacedLine,
  PlanJson,
  TimedPlan,
} from "@tsukuri/core";
import { Array as Arr, Effect, String as Str } from "effect";

const source = Arr.join(
  [
    "Title: Subtitles",
    "",
    "# Part",
    "",
    "INT. ONE #sc1#",
    "",
    "Box {id=a cell=tl class=box}",
    "",
    "NARRATOR",
    "One two three four.",
    "",
    "INT. TWO #sc2#",
    "",
    "Box {id=a cell=br class=box}",
    "",
    "NARRATOR",
    "Five six seven.",
    "",
    "INT. THREE #sc3#",
    "",
    "Done {id=c cell=mc class=title}",
    "",
    "NARRATOR",
    "Done.",
    "",
  ],
  "\n"
);

export const hash = Str.repeat(32)("5a");

const wordMs = 500;

/** One Line as the aligner reports it: each word starts when the one before it ends, and is spoken for 450 ms. */
const alignedLine = ({ id, line }: PlacedLine): AlignedLine => ({
  audio: { file: `${hash}.flac`, sha256: hash },
  durationMs: wordMs * wordsOf(line.text).length,
  lineId: id,
  words: Arr.map(wordsOf(line.text), (w, index) => ({
    endMs: index * wordMs + 450,
    startMs: index * wordMs,
    w,
  })),
});

const alignedLines = (plan: PlanJson): readonly AlignedLine[] =>
  Arr.map(planLines(plan), alignedLine);

/** The scheduled Plan of the source above. */
export const timed = Effect.gen(function* timedPlan() {
  const plan = yield* buildPlan(source, hash);

  return yield* Effect.fromResult(
    requireTimeline(
      yield* schedule(plan, alignedLines(plan), referenceLifecycle)
    )
  );
});

/** The Plan with the narration text of one Line replaced (the Timeline is unchanged). */
export const withLineText = (
  plan: TimedPlan,
  lineId: string,
  text: string
): TimedPlan => ({
  ...plan,
  scenes: Arr.map(plan.scenes, (scene) => ({
    ...scene,
    lines: Arr.map(scene.lines, (line, index) =>
      lineIdOf(scene.id, index + 1) === lineId ? { ...line, text } : line
    ),
  })),
});

/** The narration of every Line, in order. */
export const narrationOf = (plan: TimedPlan): readonly string[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.map(scene.lines, (line) => line.text)
  );
