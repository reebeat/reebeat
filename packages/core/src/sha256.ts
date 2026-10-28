/* oxlint-disable no-bitwise -- EX-0110: SHA-256 is defined on 32-bit words with rotations, shifts and xor; no Effect module offers a synchronous digest. */
// SHA-256 as specified in FIPS 180-4, written as a total plain function (decision ladder, rung 1) so that the
// Plan stage needs no service, no Promise (Web Crypto) and no Node built-in, and `buildPlan` keeps an empty
// requirement channel. Checked against the FIPS test vectors and node's digest in `test/sha256.test.ts`.
import { Array as Arr } from "effect";

const roundConstants = Uint32Array.from([
  0x42_8a_2f_98, 0x71_37_44_91, 0xb5_c0_fb_cf, 0xe9_b5_db_a5, 0x39_56_c2_5b,
  0x59_f1_11_f1, 0x92_3f_82_a4, 0xab_1c_5e_d5, 0xd8_07_aa_98, 0x12_83_5b_01,
  0x24_31_85_be, 0x55_0c_7d_c3, 0x72_be_5d_74, 0x80_de_b1_fe, 0x9b_dc_06_a7,
  0xc1_9b_f1_74, 0xe4_9b_69_c1, 0xef_be_47_86, 0x0f_c1_9d_c6, 0x24_0c_a1_cc,
  0x2d_e9_2c_6f, 0x4a_74_84_aa, 0x5c_b0_a9_dc, 0x76_f9_88_da, 0x98_3e_51_52,
  0xa8_31_c6_6d, 0xb0_03_27_c8, 0xbf_59_7f_c7, 0xc6_e0_0b_f3, 0xd5_a7_91_47,
  0x06_ca_63_51, 0x14_29_29_67, 0x27_b7_0a_85, 0x2e_1b_21_38, 0x4d_2c_6d_fc,
  0x53_38_0d_13, 0x65_0a_73_54, 0x76_6a_0a_bb, 0x81_c2_c9_2e, 0x92_72_2c_85,
  0xa2_bf_e8_a1, 0xa8_1a_66_4b, 0xc2_4b_8b_70, 0xc7_6c_51_a3, 0xd1_92_e8_19,
  0xd6_99_06_24, 0xf4_0e_35_85, 0x10_6a_a0_70, 0x19_a4_c1_16, 0x1e_37_6c_08,
  0x27_48_77_4c, 0x34_b0_bc_b5, 0x39_1c_0c_b3, 0x4e_d8_aa_4a, 0x5b_9c_ca_4f,
  0x68_2e_6f_f3, 0x74_8f_82_ee, 0x78_a5_63_6f, 0x84_c8_78_14, 0x8c_c7_02_08,
  0x90_be_ff_fa, 0xa4_50_6c_eb, 0xbe_f9_a3_f7, 0xc6_71_78_f2,
]);

const initialState = [
  0x6a_09_e6_67, 0xbb_67_ae_85, 0x3c_6e_f3_72, 0xa5_4f_f5_3a, 0x51_0e_52_7f,
  0x9b_05_68_8c, 0x1f_83_d9_ab, 0x5b_e0_cd_19,
] as const;

const rotateRight = (value: number, bits: number): number =>
  (value >>> bits) | (value << (32 - bits));

const wordAt = (words: Uint32Array, index: number): number => words[index] ?? 0;

/** The message padded to a multiple of 64 bytes: `0x80`, zeros, then the bit length as 64 big-endian bits. */
const pad = (message: Uint8Array): Uint8Array => {
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  const view = new DataView(padded.buffer);

  padded.set(message);
  padded[message.length] = 0x80;
  view.setUint32(paddedLength - 8, Math.floor(message.length / 0x20_00_00_00));
  view.setUint32(paddedLength - 4, (message.length << 3) >>> 0);

  return padded;
};

/** The 64-word message schedule of the block at `offset`. */
const expandSchedule = (block: DataView, offset: number): Uint32Array => {
  const words = new Uint32Array(64);

  for (let t = 0; t < 16; t += 1) {
    words[t] = block.getUint32(offset + t * 4);
  }

  for (let t = 16; t < 64; t += 1) {
    const w15 = wordAt(words, t - 15);
    const w2 = wordAt(words, t - 2);
    const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
    const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);

    words[t] = (wordAt(words, t - 16) + s0 + wordAt(words, t - 7) + s1) >>> 0;
  }

  return words;
};

/** Folds one 64-byte block into the eight working words. */
const compress = (
  state: readonly number[],
  block: DataView,
  offset: number
): number[] => {
  const words = expandSchedule(block, offset);
  let [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = state;

  for (let t = 0; t < 64; t += 1) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choose = (e & f) ^ (~e & g);

    const temp1 =
      (h + sum1 + choose + wordAt(roundConstants, t) + wordAt(words, t)) >>> 0;

    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);

    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + ((sum0 + majority) >>> 0)) >>> 0;
  }

  return Arr.map(
    [a, b, c, d, e, f, g, h],
    (value, index) => ((state[index] ?? 0) + value) >>> 0
  );
};

/** The SHA-256 digest of `bytes` as 64 lowercase hexadecimal digits. */
export const sha256Hex = (bytes: Uint8Array): string => {
  const padded = pad(bytes);
  const view = new DataView(padded.buffer);
  let state: readonly number[] = initialState;

  for (let offset = 0; offset < padded.length; offset += 64) {
    state = compress(state, view, offset);
  }

  return Arr.join(
    Arr.map(state, (word) => word.toString(16).padStart(8, "0")),
    ""
  );
};

/** The SHA-256 digest of the UTF-8 encoding of `text`. */
export const sha256OfText = (text: string): string =>
  sha256Hex(new TextEncoder().encode(text));
