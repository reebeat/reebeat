// Pure signal helpers: where a clip really starts, and a clip behind a stretch of silence.

/** The index of the first sample whose magnitude exceeds `threshold`; 0 when none does. */
export const onsetIndex = (
  samples: Float32Array,
  threshold: number
): number => {
  const found = samples.findIndex((sample) => Math.abs(sample) > threshold);

  return Math.max(found, 0);
};

/** The samples preceded by `leadMs` milliseconds of silence, at 48 kHz. */
export const withSilentLead = (
  samples: Float32Array,
  leadMs: number
): Float32Array => {
  const lead = Math.round((leadMs * 48_000) / 1000);
  const padded = new Float32Array(lead + samples.length);

  padded.set(samples, lead);

  return padded;
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
