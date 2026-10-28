// What the mux needs of a scheduled Plan, as plain functions: where each narration clip and each sound starts, the
// chapters in milliseconds and the length of the Video. No I/O: the build program fetches the clips and hands the
// results to `Encoder.mux`.
import { cuesById, frameToMs } from "@reebeat/core";
import type { TimedCue, TimedPlan } from "@reebeat/core";
import type { MuxRequest } from "@reebeat/services";
import { Array as Arr } from "effect";

import { audioName } from "./speechAsset.ts";

export interface NarrationStart {
  /** The cache key of the Line's asset: its audio file is `<key>.flac`. */
  readonly key: string;
  readonly lineId: string;
  readonly startMs: number;
}

export interface SfxStart {
  readonly cueId: string;
  /** The name the Cue asked the `SoundLibrary` for. */
  readonly name: string;
  readonly startMs: number;
}

/** The start of each Line's narration: the Line's start frame in milliseconds, in timeline order. */
export const narrationStarts = (plan: TimedPlan): readonly NarrationStart[] =>
  Arr.map(
    Arr.flatMap(plan.timeline.scenes, (scene) => scene.lines),
    (line) => ({
      key: line.audio.file.slice(0, -`.${audioName}`.length),
      lineId: line.lineId,
      startMs: frameToMs(line.startFrame, plan.settings.fps),
    })
  );

/** The start of each `sfx` Cue's sound: the Cue's fire frame in milliseconds, in timeline order. */
export const sfxStarts = (plan: TimedPlan): readonly SfxStart[] => {
  const cues = cuesById(plan);

  const timedCues: readonly TimedCue[] = Arr.flatMap(
    plan.timeline.scenes,
    (scene) => Arr.flatMap(scene.lines, (line) => line.cues)
  );

  return Arr.flatMap(timedCues, (timed) => {
    const cue = cues.get(timed.cueId);

    return cue?.kind === "sfx"
      ? [
          {
            cueId: cue.id,
            name: cue.arg ?? "",
            startMs: frameToMs(timed.fireFrame, plan.settings.fps),
          },
        ]
      : [];
  });
};

/** One chapter per Section, titled with the Section's text, each ending where the next starts and the last at the end. */
export const muxChapters = (plan: TimedPlan): MuxRequest["chapters"] => {
  const { fps } = plan.settings;
  const { chapters, totalFrames } = plan.timeline;

  const titles = new Map(
    Arr.map(plan.chapters, (c): [string, string] => [c.id, c.title])
  );

  return Arr.map(chapters, (chapter, index) => ({
    endMs: frameToMs(chapters[index + 1]?.startFrame ?? totalFrames, fps),
    startMs: frameToMs(chapter.startFrame, fps),
    title: titles.get(chapter.chapterId) ?? chapter.chapterId,
  }));
};

/** The length of the Video in milliseconds: its frames over the frame rate, not rounded, so the audio is cut to it exactly. */
export const videoMs = (plan: TimedPlan): number =>
  (1000 * plan.timeline.totalFrames) / plan.settings.fps;
