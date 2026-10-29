// Pure signal helpers: where a clip really starts, a clip behind a stretch of silence, and where a catalogue sound
// lies in a mixed track.
import { outputSampleRate } from "@reebeat/encode-ffmpeg";
import { Array as Arr } from "effect";

/** The index of the first sample whose magnitude exceeds `threshold`; 0 when none does. */
export const onsetIndex = (
  samples: Float32Array,
  threshold: number
): number => {
  const found = samples.findIndex((sample) => Math.abs(sample) > threshold);

  return Math.max(found, 0);
};

/**
 * The lowest best correlation with which a narration Line counts as found in the track. Measured on the committed
 * story: the Line that is there matches at 0.994 to 1.000 (12 of 12, AAC included); the best match of another Line's
 * narration searched in the same window is 0.12 to 0.62 (12 trials), of the same Line searched 400 ms away 0.06 to
 * 0.62. Speech matches speech well, so the floor sits high: 0.8.
 */
export const narrationMatchFloor = 0.8;

/**
 * The lowest best correlation with which a catalogue sound counts as found in the track. Measured: a sound that is
 * mixed in matches at 0.994 (whoosh) and 1.000 (ding) on the committed story and at 0.77 on the test fixture, where
 * it starts under the last 33 ms of a loud noise narration; a wrong sound, the right sound outside the window and a
 * silent track match at 0.00 to 0.08. A sound is a sweep, noise or a bell, not speech, so the floor sits lower: 0.5.
 */
export const soundMatchFloor = 0.5;

/** The first part of a sound that is matched against the track: 200 ms. */
const matchedSamples = 9600;

const energyAt = (
  samples: Float32Array,
  from: number,
  length: number
): number => {
  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    const value = samples[from + index] ?? 0;

    sum += value * value;
  }

  return sum;
};

const dotAt = (
  track: Float32Array,
  reference: Float32Array,
  lag: number,
  length: number
): number => {
  let dot = 0;

  for (let index = 0; index < length; index += 1) {
    dot += (track[lag + index] ?? 0) * (reference[index] ?? 0);
  }

  return dot;
};

/** One catalogue sound to look for: the clip and the millisecond it should start at. */
export interface SoundToFind {
  readonly expectedMs: number;
  readonly reference: Float32Array;
}

/** Where a catalogue sound lies in the track, relative to where it should lie, and how well it matches there. */
export interface SoundFound {
  readonly offsetMs: number;
  readonly score: number;
}

/** Where one sound is assumed to lie while the others are looked for: its first sample, and how loud it is. */
interface Placement {
  gain: number;
  lag: number;
}

/** The samples of `track` from `from`, `length` of them, zero past its end. */
const segmentOf = (
  track: Float32Array,
  from: number,
  length: number
): Float32Array => {
  const segment = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    segment[index] = track[from + index] ?? 0;
  }

  return segment;
};

/** `segment` (starting at sample `from` of the track) with `gain` times `sound` placed at `lag` taken out of it. */
const withoutSound = (
  segment: Float32Array,
  from: number,
  sound: Float32Array,
  placement: Placement
): void => {
  const offset = placement.lag - from;

  for (let index = 0; index < sound.length; index += 1) {
    const at = offset + index;

    if (at >= 0 && at < segment.length) {
      segment[at] = (segment[at] ?? 0) - placement.gain * (sound[index] ?? 0);
    }
  }
};

/** Whether two sounds, looked for within `reach` samples of their places, can overlap: one can hide the other. */
const overlap = (
  first: { readonly center: number; readonly length: number },
  second: { readonly center: number; readonly length: number },
  reach: number
): boolean =>
  second.center - first.center < 2 * reach + first.length &&
  first.center - second.center < 2 * reach + second.length;

/** What is looked for: a sound, where it should start (a sample) and how long it is. */
interface Target {
  readonly center: number;
  readonly length: number;
  readonly reference: Float32Array;
}

/** One search: where `target` lies in `track` with every other sound taken out where it is thought to lie. */
const searchSound = (
  track: Float32Array,
  targets: readonly Target[],
  placements: readonly Placement[],
  index: number,
  reach: number
) => {
  const target = targets[index];

  if (target === undefined) {
    return { gain: 1, lag: 0, score: 0 };
  }

  const matched = Math.min(target.length, matchedSamples);
  const from = Math.max(0, target.center - reach);
  const last = target.center + reach - from;
  const heard = segmentOf(track, from, last + matched);

  for (const [otherIndex, other] of targets.entries()) {
    const where = placements[otherIndex];

    if (otherIndex !== index && where !== undefined) {
      withoutSound(heard, from, other.reference, where);
    }
  }

  let bestLag = target.center - from;
  let bestDot = Number.NEGATIVE_INFINITY;

  for (let lag = 0; lag <= last; lag += 1) {
    const dot = dotAt(heard, target.reference, lag, matched);

    if (dot > bestDot) {
      bestDot = dot;
      bestLag = lag;
    }
  }

  const known = energyAt(target.reference, 0, matched);
  const there = energyAt(heard, bestLag, matched);

  return {
    gain: known === 0 ? 1 : Math.max(0, bestDot / known),
    lag: from + bestLag,
    score: there === 0 || known === 0 ? 0 : bestDot / Math.sqrt(there * known),
  };
};

/**
 * Where each catalogue sound lies in the mixed track, relative to where it should lie, and how well it matches there.
 *
 * A catalogue sound is mixed at its own amplitude, so its start is the lag where the matched filter (the plain dot
 * product with the first 200 ms of the clip) is largest. The normalised correlation of `audioOffsetMs` is blind to
 * amplitude, and a decaying tone (`ding`) correlates almost as well with its own ringing 130 ms later as with itself.
 * Sounds that sound together hide each other (a ding is a loud tone in the band of a whoosh), so each is looked for in
 * the track with the others taken out where they are now thought to lie, and the search is repeated until the places
 * stop moving (three rounds; a sound with no other sound near it needs one). The score is the normalised correlation at
 * the found lag, in [-1, 1], as `audioOffsetMs` reports it, so the floor of narration applies in the same way.
 */
export const locateSounds = (
  track: Float32Array,
  sounds: readonly SoundToFind[],
  windowMs: number
): readonly SoundFound[] => {
  const reach = Math.round((windowMs * outputSampleRate) / 1000);

  const targets = Arr.map(sounds, (sound): Target => ({
    center: Math.round((sound.expectedMs * outputSampleRate) / 1000),
    length: sound.reference.length,
    reference: sound.reference,
  }));

  const placements = Arr.map(targets, (target): Placement => ({
    gain: 1,
    lag: target.center,
  }));

  const scores = Arr.map(targets, () => 0);

  const together = Arr.some(targets, (target, index) =>
    Arr.some(
      targets,
      (other, otherIndex) =>
        index !== otherIndex && overlap(target, other, reach)
    )
  );

  for (let round = 0; round < (together ? 3 : 1); round += 1) {
    for (const index of targets.keys()) {
      const found = searchSound(track, targets, placements, index, reach);

      placements[index] = { gain: found.gain, lag: found.lag };
      scores[index] = found.score;
    }
  }

  return Arr.map(targets, (target, index): SoundFound => ({
    offsetMs:
      (((placements[index]?.lag ?? target.center) - target.center) * 1000) /
      outputSampleRate,
    score: scores[index] ?? 0,
  }));
};
