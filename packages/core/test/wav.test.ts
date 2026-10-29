// audioClipToWav: a RIFF/WAVE header that says what the data is, 16-bit samples that are the rounded and clamped
// floats, and the same bytes for the same clip. Plain data in, plain bytes out: no I/O.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { audioClipToWav } from "../src/wav.ts";

const clip = (samples: readonly number[], sampleRate = 48_000) => ({
  sampleRate,
  samples: Float32Array.from(samples),
});

const viewOf = (wav: Uint8Array) =>
  new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

const textAt = (wav: Uint8Array, offset: number): string =>
  Arr.join(
    Arr.map(Arr.fromIterable(wav.subarray(offset, offset + 4)), (code) =>
      String.fromCodePoint(code)
    ),
    ""
  );

describe("audioClipToWav", () => {
  it("writes a 44-byte header that describes 16-bit mono PCM at the clip's rate", () => {
    const wav = audioClipToWav(clip([0, 0.5, -0.5, 1], 24_000));
    const view = viewOf(wav);

    assert.strictEqual(textAt(wav, 0), "RIFF");
    assert.strictEqual(textAt(wav, 8), "WAVE");
    assert.strictEqual(textAt(wav, 12), "fmt ");
    assert.strictEqual(textAt(wav, 36), "data");
    assert.strictEqual(view.getUint16(20, true), 1);
    assert.strictEqual(view.getUint16(22, true), 1);
    assert.strictEqual(view.getUint32(24, true), 24_000);
    assert.strictEqual(view.getUint32(28, true), 48_000);
    assert.strictEqual(view.getUint16(32, true), 2);
    assert.strictEqual(view.getUint16(34, true), 16);
    assert.strictEqual(view.getUint32(40, true), 8);
    assert.strictEqual(view.getUint32(4, true), wav.byteLength - 8);
    assert.strictEqual(wav.byteLength, 44 + 8);
  });

  it("writes each sample as the nearest 16-bit step of the float, a tie rounding up", () => {
    const view = viewOf(audioClipToWav(clip([0, 0.5, -0.5, 1, -1, 0.25])));

    assert.deepStrictEqual(
      Arr.makeBy(6, (index) => view.getInt16(44 + index * 2, true)),
      [0, 16_384, -16_383, 32_767, -32_767, 8192]
    );
  });

  it("clamps samples outside [-1, 1] to full scale instead of wrapping", () => {
    const view = viewOf(audioClipToWav(clip([1.5, -3])));

    assert.strictEqual(view.getInt16(44, true), 32_767);
    assert.strictEqual(view.getInt16(46, true), -32_767);
  });

  it("is a pure function: equal clips give equal bytes, an empty clip only the header", () => {
    assert.deepStrictEqual(
      audioClipToWav(clip([0.1, 0.2, 0.3])),
      audioClipToWav(clip([0.1, 0.2, 0.3]))
    );
    assert.strictEqual(audioClipToWav(clip([])).byteLength, 44);
  });
});
