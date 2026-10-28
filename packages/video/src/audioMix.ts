import type { TimedCue } from "@reebeat/core";
import { sfxNames } from "@reebeat/sfx";
import type { SfxName } from "@reebeat/sfx";
// The audio track: every narration FLAC at its Line's start and every `sfx` Cue's sound at its fire frame, mixed
// without normalisation, padded or cut to the exact length of the Video and encoded as 48 kHz stereo.
import { Array as Arr, Option } from "effect";

import { frameToMs } from "./time.ts";
import { cuesById } from "./timedPlan.ts";
import type { TimedPlan } from "./timedPlan.ts";

export type AudioInput =
  | {
      readonly kind: "narration";
      /** The cache FLAC, relative to the speech cache directory. */
      readonly file: string;
      readonly lineId: string;
      readonly startMs: number;
    }
  | {
      readonly kind: "sfx";
      readonly cueId: string;
      readonly name: SfxName;
      readonly startMs: number;
    };

export interface AudioMixPlan {
  /** The audio inputs in ffmpeg input order, narration first. */
  readonly inputs: readonly AudioInput[];
  /** The `-filter_complex` graph; the mixed track is the pad `[aout]`. */
  readonly filterComplex: string;
  /** The length the track is padded or cut to, in seconds with six decimals. */
  readonly durationSeconds: string;
}

export const sampleRateHz = 48_000;

const sfxNameOf = (arg: string | null): SfxName | undefined =>
  Option.getOrUndefined(Arr.findFirst(sfxNames, (name) => name === arg));

const delayChain = (
  input: AudioInput,
  ffmpegIndex: number,
  label: number
): string =>
  `[${ffmpegIndex}:a]aresample=${sampleRateHz},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${input.startMs}:all=1[a${label}]`;

/**
 * The inputs and the filter graph of a scheduled Plan. `firstInputIndex` is the ffmpeg input index of the first
 * audio input (the capture's frames are input 0).
 */
export const audioMixPlan = (
  plan: TimedPlan,
  firstInputIndex = 1
): AudioMixPlan => {
  const { fps } = plan.settings;
  const cues = cuesById(plan);
  const timedLines = Arr.flatMap(plan.timeline.scenes, (scene) => scene.lines);

  const narration = Arr.map(timedLines, (line): AudioInput => ({
    file: line.audio.file,
    kind: "narration",
    lineId: line.lineId,
    startMs: frameToMs(line.startFrame, fps),
  }));

  const sounds = Arr.flatMap(
    Arr.flatMap(timedLines, (line) => line.cues),
    (timed: TimedCue): AudioInput[] => {
      const cue = cues.get(timed.cueId);
      const name = sfxNameOf(cue?.arg ?? null);

      return cue?.kind === "sfx" && name !== undefined
        ? [
            {
              cueId: timed.cueId,
              kind: "sfx",
              name,
              startMs: frameToMs(timed.fireFrame, fps),
            },
          ]
        : [];
    }
  );

  const inputs = [...narration, ...sounds];
  const durationSeconds = (plan.timeline.totalFrames / fps).toFixed(6);

  const delayed = Arr.map(inputs, (input, index) =>
    delayChain(input, firstInputIndex + index, index)
  );

  const labels = Arr.join(
    Arr.map(inputs, (_, index) => `[a${index}]`),
    ""
  );

  const mix = `${labels}amix=inputs=${inputs.length}:normalize=0:duration=longest:dropout_transition=0,apad=whole_dur=${durationSeconds},atrim=end=${durationSeconds}[aout]`;

  return {
    durationSeconds,
    filterComplex: Arr.join([...delayed, mix], ";"),
    inputs,
  };
};
