// The catalogue is original synthesis: the same bytes every call, the documented length, a sound that starts
// within 2 ms and never exceeds 0.6 of full scale.
import { assert, describe, it } from "@effect/vitest";

import { sampleRate, sfxNames, sfxWav } from "../src/index.ts";
import type { SfxName } from "../src/index.ts";

const peakOf = (samples: Int16Array): number => {
  let peak = 0;

  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  return peak / 32_768;
};

const energy = (part: Int16Array): number => {
  let sum = 0;

  for (const sample of part) {
    sum += sample * sample;
  }

  return sum;
};

const lengthsMs: Record<SfxName, number> = {
  ding: 1200,
  pop: 180,
  whoosh: 450,
};

const samplesOf = (wav: Uint8Array): Int16Array => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const count = (wav.byteLength - 44) / 2;

  return Int16Array.from({ length: count }, (_, index) =>
    view.getInt16(44 + index * 2, true)
  );
};

describe("sfxWav", () => {
  for (const name of sfxNames) {
    it(`${name}: two calls return the same bytes`, () => {
      assert.deepStrictEqual(sfxWav(name), sfxWav(name));
    });

    it(`${name}: a 16-bit mono 48 kHz WAV of the documented length`, () => {
      const wav = sfxWav(name);
      const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

      const text = (offset: number) =>
        String.fromCodePoint(...wav.subarray(offset, offset + 4));

      assert.strictEqual(text(0), "RIFF");
      assert.strictEqual(text(8), "WAVE");
      assert.strictEqual(view.getUint16(20, true), 1);
      assert.strictEqual(view.getUint16(22, true), 1);
      assert.strictEqual(view.getUint32(24, true), sampleRate);
      assert.strictEqual(view.getUint16(34, true), 16);
      assert.strictEqual(view.getUint32(40, true), wav.byteLength - 44);
      assert.strictEqual(
        samplesOf(wav).length,
        (sampleRate * lengthsMs[name]) / 1000
      );
    });

    it(`${name}: audible within 2 ms and at most 0.6 of full scale`, () => {
      const samples = samplesOf(sfxWav(name));
      const onsetWindow = (sampleRate * 2) / 1000;

      const onset = samples
        .slice(0, onsetWindow)
        .some((sample) => Math.abs(sample) > 0.01 * 32_768);

      const peak = peakOf(samples);

      assert.isTrue(onset);
      assert.isAtMost(peak, 0.6);
      assert.isAbove(peak, 0.3);
    });
  }

  it("the three sounds differ", () => {
    const [pop, whoosh, ding] = [
      sfxWav("pop"),
      sfxWav("whoosh"),
      sfxWav("ding"),
    ];

    assert.notDeepEqual(pop, whoosh);
    assert.notDeepEqual(whoosh, ding);
    assert.notDeepEqual(pop, ding);
  });

  it("ding decays: its last tenth is quieter than its first tenth", () => {
    const samples = samplesOf(sfxWav("ding"));
    const tenth = samples.length / 10;

    assert.isBelow(
      energy(samples.slice(-tenth)) * 100,
      energy(samples.slice(0, tenth))
    );
  });
});
