// What the mux needs of a scheduled Plan, as plain functions: where each narration clip and each sound starts, the
// chapters in milliseconds and the length of the Video. No I/O: the build program fetches the clips and hands the
// results to `Encoder.mux`.
import { frameToMs } from "@reebeat/core";
import type { TimedPlan } from "@reebeat/core";
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
  readonly effectId: string;
  /** The name the effect asked the `SoundLibrary` for. */
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

/** The start of each `sound` effect's sound: the effect's fire frame in milliseconds, in timeline order. */
export const sfxStarts = (plan: TimedPlan): readonly SfxStart[] => {
  const sounds = new Map(
    Arr.flatMap(plan.scenes, (scene) =>
      Arr.flatMap(scene.effects, (effect) =>
        effect.verb === "sound" && effect.name !== undefined
          ? [[effect.id, effect.name] as const]
          : []
      )
    )
  );

  return Arr.flatMap(plan.timeline.scenes, (scene) =>
    Arr.flatMap(scene.effects, (timed) => {
      const name = sounds.get(timed.effectId);

      return name === undefined
        ? []
        : [
            {
              effectId: timed.effectId,
              name,
              startMs: frameToMs(timed.fireFrame, plan.settings.fps),
            },
          ];
    })
  );
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
