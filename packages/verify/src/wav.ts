// Pure signal helpers: the samples of a catalogue WAV, and where a clip really starts.

const headerBytes = 44;

/**
 * The samples of a mono 16-bit PCM WAV with the 44-byte header that `@reebeat/sfx` writes, as floats in [-1, 1].
 * The sample rate is 48 kHz, the rate the mixed track is decoded at.
 */
export const wavSamples = (wav: Uint8Array): Float32Array => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const count = Math.floor((wav.byteLength - headerBytes) / 2);

  return Float32Array.from(
    { length: count },
    (_, index) => view.getInt16(headerBytes + index * 2, true) / 32_768
  );
};

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
