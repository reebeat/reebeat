// The audio track: every track delayed to its start, mixed without normalisation, padded or cut to the exact length
// of the video and encoded as 48 kHz stereo. Plain function over the start times; the clips travel as raw inputs.
import { Array as Arr } from "effect";

import { outputSampleRate } from "./settings.ts";

export interface AudioMixPlan {
  /** The length the track is padded or cut to, in seconds with six decimals. */
  readonly durationSeconds: string;
  /** The `-filter_complex` graph; the mixed track is the pad `[aout]`. */
  readonly filterComplex: string;
}

const delayChain = (
  startMs: number,
  ffmpegIndex: number,
  label: number
): string =>
  `[${ffmpegIndex}:a]aresample=${outputSampleRate},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${startMs}:all=1[a${label}]`;

/**
 * The filter graph that mixes the tracks starting at `startsMs` (ffmpeg inputs `firstInputIndex`, `firstInputIndex + 1`,
 * and so on, in order) and cuts the mix to `totalMs`. With no track the result is silence of that length.
 */
export const audioMix = (
  startsMs: readonly number[],
  totalMs: number,
  firstInputIndex: number
): AudioMixPlan => {
  const durationSeconds = (totalMs / 1000).toFixed(6);

  if (startsMs.length === 0) {
    return {
      durationSeconds,
      filterComplex: `anullsrc=r=${outputSampleRate}:cl=stereo,atrim=end=${durationSeconds},aformat=sample_fmts=fltp[aout]`,
    };
  }

  const delayed = Arr.map(startsMs, (startMs, index) =>
    delayChain(startMs, firstInputIndex + index, index)
  );

  const labels = Arr.join(
    Arr.map(startsMs, (_, index) => `[a${index}]`),
    ""
  );

  const mix = `${labels}amix=inputs=${startsMs.length}:normalize=0:duration=longest:dropout_transition=0,apad=whole_dur=${durationSeconds},atrim=end=${durationSeconds}[aout]`;

  return {
    durationSeconds,
    filterComplex: Arr.join([...delayed, mix], ";"),
  };
};
