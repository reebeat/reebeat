// The schedule: aligned word times in, a Timeline of integer frames out (spec 0001, "Time" and "The Plan
// contract"). All arithmetic is integer frames at `settings.fps`; a duration in seconds or milliseconds becomes
// frames with `Math.round` (halves round up), and every later frame is an integer sum of those, so no rounding
// error accumulates:
//
//   first Line start  = slideFrame + round(fps * (sceneLead + pauseBefore))
//   later Line start  = previous Line end + round(fps * (lineGap + pauseBefore))
//   Line end          = Line start + round(fps * durationMs / 1000)
//   word frame        = Line start + round(fps * wordMs / 1000)
//   Scene end         = last Line end + round(fps * sceneTail)
//   next slideFrame   = this Scene end; totalFrames = last Scene end
//   Cue fireFrame     = Line start + round(fps * word.endMs / 1000); the Line start for afterWord = -1; the Scene's
//                       slideFrame for a Cue anchored to the transition start (an sfx before the first word of a
//                       Scene's first Line)
//   Cue commandFrame  = fireFrame - 1 for next and focus, fireFrame for sfx
import { Array as Arr, Effect, Option, Result, Schema } from "effect";

import {
  AlignmentMismatch,
  CueOutsideLine,
  SceneLeadTooShort,
} from "./errors.ts";
import type { ScheduleError } from "./errors.ts";
import { AudioFileSchema } from "./plan.ts";
import type {
  Line,
  PlanJson,
  Scene,
  Settings,
  TimedCue,
  TimedLine,
  TimedScene,
  Timeline,
} from "./plan.ts";

const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** What speech provides for one Line: its audio and its words with aligned times; words align 1:1 to `Line.words`. */
export const AlignedLineSchema = Schema.Struct({
  audio: Schema.Struct({ file: AudioFileSchema, sha256: Schema.String }),
  durationMs: Milliseconds,
  lineId: Schema.NonEmptyString,
  words: Schema.Array(
    Schema.Struct({
      endMs: Milliseconds,
      startMs: Milliseconds,
      w: Schema.String,
    })
  ),
});

export type AlignedLine = typeof AlignedLineSchema.Type;

const secondsToFrames = (settings: Settings, seconds: number): number =>
  Math.round(settings.fps * seconds);

const millisecondsToFrames = (settings: Settings, ms: number): number =>
  Math.round((settings.fps * ms) / 1000);

const mismatch = (line: Line, message: string): AlignmentMismatch =>
  new AlignmentMismatch({ lineId: line.id, message });

/** The first problem between a Line and its aligned data, or undefined. */
const checkLine = (
  line: Line,
  aligned: AlignedLine | undefined
): ScheduleError | undefined => {
  if (aligned === undefined) {
    return mismatch(line, `no aligned data for Line ${line.id}`);
  }

  const spoken = Arr.map(aligned.words, (word) => word.w);

  if (spoken.length !== line.words.length) {
    return mismatch(
      line,
      `Line ${line.id} has ${line.words.length} words but its alignment has ${spoken.length}`
    );
  }

  const differs = Arr.findFirstIndex(
    line.words,
    (word, index) => word !== spoken[index]
  );

  if (Option.isSome(differs)) {
    return mismatch(
      line,
      `Line ${line.id} word ${differs.value + 1} is "${line.words[differs.value]}" but its alignment has "${spoken[differs.value]}"`
    );
  }

  const stray = Arr.findFirst(
    line.cues,
    (cue) => cue.afterWord < -1 || cue.afterWord >= line.words.length
  );

  return Option.isNone(stray)
    ? undefined
    : new CueOutsideLine({
        cueId: stray.value.id,
        message: `Cue ${stray.value.id} follows word ${stray.value.afterWord} but Line ${line.id} has ${line.words.length} words`,
      });
};

/** A Plan Line with its aligned data. */
interface Paired {
  readonly aligned: AlignedLine;
  readonly line: Line;
}

/** Pairs every Line of a Scene with its aligned data, or reports the first problem. */
const pairScene = (
  scene: Scene,
  aligned: ReadonlyMap<string, AlignedLine>
): Result.Result<readonly Paired[], ScheduleError> => {
  const paired: Paired[] = [];

  for (const line of scene.lines) {
    const found = aligned.get(line.id);
    const problem = checkLine(line, found);

    if (problem !== undefined) {
      return Result.fail(problem);
    }

    if (found !== undefined) {
      paired.push({ aligned: found, line });
    }
  }

  return Result.succeed(paired);
};

const timeCues = (
  { aligned, line }: Paired,
  startFrame: number,
  slideFrame: number,
  settings: Settings
): readonly TimedCue[] =>
  Arr.map(line.cues, (cue) => {
    const word = aligned.words[cue.afterWord];

    const wordFrame =
      word === undefined
        ? startFrame
        : startFrame + millisecondsToFrames(settings, word.endMs);

    const fireFrame =
      cue.anchor === "transition-start" ? slideFrame : wordFrame;

    return {
      commandFrame: cue.kind === "sfx" ? fireFrame : fireFrame - 1,
      cueId: cue.id,
      fireFrame,
    };
  });

const timeLine = (
  pair: Paired,
  startFrame: number,
  slideFrame: number,
  settings: Settings
): TimedLine => ({
  audio: pair.aligned.audio,
  cues: timeCues(pair, startFrame, slideFrame, settings),
  endFrame:
    startFrame + millisecondsToFrames(settings, pair.aligned.durationMs),
  lineId: pair.line.id,
  startFrame,
  words: Arr.map(pair.aligned.words, (word) => ({
    endFrame: startFrame + millisecondsToFrames(settings, word.endMs),
    endMs: word.endMs,
    startFrame: startFrame + millisecondsToFrames(settings, word.startMs),
    startMs: word.startMs,
    w: word.w,
  })),
});

const timeScene = (
  sceneId: string,
  pairs: readonly Paired[],
  slideFrame: number,
  settings: Settings
): TimedScene => {
  const lines: TimedLine[] = [];
  let cursor = slideFrame;

  for (const [index, pair] of pairs.entries()) {
    const gap = index === 0 ? settings.sceneLead : settings.lineGap;

    const startFrame =
      cursor + secondsToFrames(settings, gap + pair.line.hints.pauseBefore);

    const timed = timeLine(pair, startFrame, slideFrame, settings);

    lines.push(timed);
    cursor = timed.endFrame;
  }

  return {
    endFrame: cursor + secondsToFrames(settings, settings.sceneTail),
    lines,
    sceneId,
    slideFrame,
  };
};

const sceneLeadError = (settings: Settings): SceneLeadTooShort =>
  new SceneLeadTooShort({
    message: `sceneLead ${settings.sceneLead} s is shorter than the transition ${settings.transition} s: the first Line would start inside it`,
    sceneLead: settings.sceneLead,
    transition: settings.transition,
  });

/** The Timeline of a Plan, or the first reason it cannot be scheduled. */
const timelineOf = (
  plan: PlanJson,
  alignedLines: readonly AlignedLine[]
): Result.Result<Timeline, ScheduleError> => {
  if (plan.settings.sceneLead < plan.settings.transition) {
    return Result.fail(sceneLeadError(plan.settings));
  }

  const aligned = new Map(Arr.map(alignedLines, (line) => [line.lineId, line]));

  const known = new Set(
    Arr.flatMap(plan.scenes, (scene) => Arr.map(scene.lines, (line) => line.id))
  );

  const extra = Arr.findFirst(alignedLines, (line) => !known.has(line.lineId));

  if (Option.isSome(extra)) {
    return Result.fail(
      new AlignmentMismatch({
        lineId: extra.value.lineId,
        message: `aligned Line ${extra.value.lineId} is not a Line of the Plan`,
      })
    );
  }

  const scenes: TimedScene[] = [];
  let slideFrame = 0;

  for (const scene of plan.scenes) {
    const pairs = pairScene(scene, aligned);

    if (Result.isFailure(pairs)) {
      return Result.fail(pairs.failure);
    }

    const timed = timeScene(scene.id, pairs.success, slideFrame, plan.settings);

    scenes.push(timed);
    slideFrame = timed.endFrame;
  }

  return Result.succeed({
    chapters: Arr.flatMap(plan.chapters, (chapter) =>
      Option.match(
        Arr.findFirst(scenes, (timed) => timed.sceneId === chapter.sceneIds[0]),
        {
          onNone: () => [],
          onSome: (first) => [
            { chapterId: chapter.id, startFrame: first.slideFrame },
          ],
        }
      )
    ),
    scenes,
    totalFrames: slideFrame,
  });
};

/**
 * Adds the `timeline` to a Plan from the aligned Lines. Fails with `SceneLeadTooShort` when `sceneLead` is below
 * `transition`, with `AlignmentMismatch` when a Line's aligned words differ from its words (or a Line is
 * missing, or an aligned Line is not in the Plan), and with `CueOutsideLine` when a Cue follows a word the
 * Line does not have.
 */
export const schedule = Effect.fn("schedule")(
  (plan: PlanJson, aligned: readonly AlignedLine[]) =>
    Effect.fromResult(
      Result.map(timelineOf(plan, aligned), (timeline): PlanJson => ({
        ...plan,
        timeline,
      }))
    )
);
