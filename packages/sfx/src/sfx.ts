// The built-in sound catalogue (spec 0001, "Cues"): original synthesis, 16-bit PCM, mono, 48 kHz, written as WAV
// bytes. Every sound is a pure function of its name: the noise of `whoosh` comes from a seeded integer
// generator, so two calls return the same bytes, and nothing reads a clock or a random source.
//
//   pop    180 ms  cosine sweep 700 Hz to 250 Hz, 1 ms attack, fast exponential decay
//   whoosh 450 ms  band-limited noise, envelope rising from 0.2 to 1 and falling back
//   ding  1200 ms  sine 880 Hz plus a 1760 Hz partial at half amplitude, exponential decay
//
// Every sound has a sample of magnitude above 0.01 within its first 2 ms and a peak of at most 0.6 full scale.

export const sfxNames = ["pop", "whoosh", "ding"] as const;

export type SfxName = (typeof sfxNames)[number];

export const sampleRate = 48_000;

const peakAmplitude = 0.55;
const headerBytes = 44;
const twoPi = 2 * Math.PI;

const samplesFor = (seconds: number): number =>
  Math.round(seconds * sampleRate);

const pop = (): Float64Array => {
  const length = samplesFor(0.18);
  const samples = new Float64Array(length);
  const attack = samplesFor(0.001);
  const startHz = 700;
  const endHz = 250;
  const sweepSeconds = 0.18;
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const hz = startHz + (endHz - startHz) * Math.min(t / sweepSeconds, 1);
    const envelope = Math.min((index + 1) / attack, 1) * Math.exp(-t / 0.04);

    samples[index] = peakAmplitude * envelope * Math.cos(phase);
    phase += (twoPi * hz) / sampleRate;
  }

  return samples;
};

const ding = (): Float64Array => {
  const length = samplesFor(1.2);
  const samples = new Float64Array(length);
  const base = 0.4;

  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.exp(-t / 0.35);

    samples[index] =
      base *
      envelope *
      (Math.sin(twoPi * 880 * t) + 0.5 * Math.sin(twoPi * 1760 * t));
  }

  return samples;
};

// A linear congruential generator (Numerical Recipes constants) over exact integers below 2^53.
const lcgModulus = 2 ** 32;

const noise = (length: number): Float64Array => {
  const samples = new Float64Array(length);
  let state = 20_251_028;

  for (let index = 0; index < length; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) % lcgModulus;
    samples[index] = (state / lcgModulus) * 2 - 1;
  }

  return samples;
};

const onePoleCoefficient = (hz: number): number =>
  1 - Math.exp((-twoPi * hz) / sampleRate);

const whoosh = (): Float64Array => {
  const length = samplesFor(0.45);
  const source = noise(length);
  const high = onePoleCoefficient(250);
  const low = onePoleCoefficient(3500);
  const filtered = new Float64Array(length);
  let lowOne = 0;
  let lowTwo = 0;
  let trackOne = 0;
  let trackTwo = 0;

  for (let index = 0; index < length; index += 1) {
    // Two low-pass poles at 3.5 kHz, then the same with a 250 Hz low-pass subtracted: a band between the two.
    lowOne += low * ((source[index] ?? 0) - lowOne);
    lowTwo += low * (lowOne - lowTwo);
    trackOne += high * (lowTwo - trackOne);
    trackTwo += high * (trackOne - trackTwo);

    const progress = index / length;
    const envelope = 0.2 + 0.8 * Math.sin(Math.PI * progress) ** 2;

    filtered[index] = (lowTwo - trackTwo) * envelope;
  }

  let peak = 0;

  for (const value of filtered) {
    peak = Math.max(peak, Math.abs(value));
  }

  return filtered.map((value) => (peakAmplitude * value) / peak);
};

const synth: Record<SfxName, () => Float64Array> = { ding, pop, whoosh };

const toWav = (samples: Float64Array): Uint8Array => {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(headerBytes + dataBytes);
  const view = new DataView(bytes.buffer);

  const tag = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.codePointAt(index) ?? 0);
    }
  };

  tag(0, "RIFF");
  view.setUint32(4, headerBytes - 8 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);

  for (const [index, sample] of samples.entries()) {
    view.setInt16(headerBytes + index * 2, Math.round(sample * 32_767), true);
  }

  return bytes;
};

/** The catalogue sound `name` as a WAV file (16-bit PCM, mono, 48 kHz). Equal names give equal bytes. */
export const sfxWav = (name: SfxName): Uint8Array => toWav(synth[name]());
