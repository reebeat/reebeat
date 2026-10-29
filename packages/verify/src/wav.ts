// Pure signal helpers: where a clip really starts, a clip behind a stretch of silence, and where a catalogue sound
// lies in a mixed track.
import { outputSampleRate } from "@reebeat/encode-ffmpeg";

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

/**
 * Where a catalogue sound lies in the mixed track, relative to where it should lie, and how well it matches there.
 * A catalogue sound is mixed at its own amplitude, so the lag is the one where the matched filter, the plain dot product
 * with the reference, is largest: the normalised correlation of `audioOffsetMs` is blind to amplitude, and a decaying
 * tone (`ding`) correlates almost as well with its own ringing 130 ms later, which another sound sounding before it (a
 * whoosh) hides the silence that tells the true start from it. The score is the normalised correlation at that lag, in
 * [-1, 1], as `audioOffsetMs` reports it, so the same floor applies.
 */
export const soundOffsetMs = (
  track: Float32Array,
  reference: Float32Array,
  expectedMs: number,
  windowMs: number
) => {
  const length = Math.min(reference.length, matchedSamples);
  const center = Math.round((expectedMs * outputSampleRate) / 1000);
  const reach = Math.round((windowMs * outputSampleRate) / 1000);
  let bestLag = center;
  let bestDot = Number.NEGATIVE_INFINITY;

  for (let lag = Math.max(0, center - reach); lag <= center + reach; lag += 1) {
    const dot = dotAt(track, reference, lag, length);

    if (dot > bestDot) {
      bestDot = dot;
      bestLag = lag;
    }
  }

  const heard = energyAt(track, bestLag, length);
  const known = energyAt(reference, 0, length);

  return {
    offsetMs: ((bestLag - center) * 1000) / outputSampleRate,
    score: heard === 0 || known === 0 ? 0 : bestDot / Math.sqrt(heard * known),
  };
};
