import type { TimedCue } from "@reebeat/core";
import { sampleRate, sfxNames } from "@reebeat/sfx";
import type { SfxName } from "@reebeat/sfx";
// The audio track: every narration FLAC at its Line's start and every `sfx` Cue's sound at its fire frame, mixed
// without normalisation, padded or cut to the exact length of the Video and encoded as 48 kHz stereo.
import { Array as Arr, Option, Result } from "effect";

import { UnknownSfx } from "./errors.ts";
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

const sfxNameOf = (arg: string | null): SfxName | undefined =>
  Option.getOrUndefined(Arr.findFirst(sfxNames, (name) => name === arg));

const delayChain = (
  input: AudioInput,
  ffmpegIndex: number,
  label: number
): string =>
  `[${ffmpegIndex}:a]aresample=${sampleRate},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${input.startMs}:all=1[a${label}]`;

/** The filter graph of `inputs`, cut to the length of the Video. */
const mixOf = (
  plan: TimedPlan,
  inputs: readonly AudioInput[],
  firstInputIndex: number
): AudioMixPlan => {
  const { fps } = plan.settings;
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

/**
 * The inputs and the filter graph of a scheduled Plan. `firstInputIndex` is the ffmpeg input index of the first
 * audio input (the capture's frames are input 0).
 */
export const audioMixPlan = (
  plan: TimedPlan,
  firstInputIndex = 1
): Result.Result<AudioMixPlan, UnknownSfx> => {
  const { fps } = plan.settings;
  const cues = cuesById(plan);
  const timedLines = Arr.flatMap(plan.timeline.scenes, (scene) => scene.lines);

  const narration = Arr.map(timedLines, (line): AudioInput => ({
    file: line.audio.file,
    kind: "narration",
    lineId: line.lineId,
    startMs: frameToMs(line.startFrame, fps),
  }));

  const sound = (timed: TimedCue): Result.Result<AudioInput[], UnknownSfx> => {
    const cue = cues.get(timed.cueId);

    if (cue?.kind !== "sfx") {
      return Result.succeed([]);
    }

    const name = sfxNameOf(cue.arg);

    return name === undefined
      ? Result.fail(
          new UnknownSfx({
            cueId: timed.cueId,
            message: `the Cue ${timed.cueId} asks for the sound ${cue.arg ?? "(none)"}, which the catalogue does not have`,
            sound: cue.arg,
          })
        )
      : Result.succeed([
          {
            cueId: timed.cueId,
            kind: "sfx",
            name,
            startMs: frameToMs(timed.fireFrame, fps),
          },
        ]);
  };

  return Result.map(
    Result.all(
      Arr.map(
        Arr.flatMap(timedLines, (line) => line.cues),
        sound
      )
    ),
    (found) =>
      mixOf(plan, [...narration, ...Arr.flatten(found)], firstInputIndex)
  );
};
