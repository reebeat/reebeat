// F6, determinism: two build directories of the same source and cache decode to the same video frames (the hash of
// every frame) and the same audio samples. The bytes of the two containers are compared and the result is recorded,
// not required. The first differing frame is named.
import { decodeMonoPcm, frameHashes } from "@reebeat/encode-ffmpeg";
import { sha256Hex } from "@reebeat/pipeline";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  String as Str,
} from "effect";

import type { BuildInvalid } from "./errors.ts";
import { guarded } from "./guard.ts";
import type { CheckServices } from "./guard.ts";
import { locateMp4 } from "./load.ts";
import { verdictOf } from "./verdict.ts";
import type { Measured, Verdict } from "./verdict.ts";

const firstDifferingSample = (
  left: Float32Array,
  right: Float32Array
): number | undefined => {
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }

  return left.length === right.length ? undefined : shared;
};

const firstDifferingFrame = (
  left: readonly string[],
  right: readonly string[]
): number | undefined =>
  Option.getOrElse(
    Option.map(
      Arr.findFirstIndex(Arr.zip(left, right), ([a, b]) => a !== b),
      (index): number | undefined => index
    ),
    () =>
      left.length === right.length
        ? undefined
        : Math.min(left.length, right.length)
  );

const pcmHash = (samples: Float32Array) =>
  sha256Hex(
    new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
  );

const observe = Effect.fnUntraced(function* compare(
  left: string,
  right: string
) {
  const fs = yield* FileSystem.FileSystem;
  const frames = [yield* frameHashes(left), yield* frameHashes(right)] as const;

  const audio = [
    yield* decodeMonoPcm(left),
    yield* decodeMonoPcm(right),
  ] as const;

  const bytes = [yield* fs.readFile(left), yield* fs.readFile(right)] as const;

  const containers = [
    yield* sha256Hex(bytes[0]),
    yield* sha256Hex(bytes[1]),
  ] as const;

  const frame = firstDifferingFrame(frames[0], frames[1]);
  const sample = firstDifferingSample(audio[0], audio[1]);
  const pcm = [yield* pcmHash(audio[0]), yield* pcmHash(audio[1])] as const;

  const problems = [
    ...(frame === undefined
      ? []
      : [
          `the first differing video frame is ${frame} (${frames[0].length} frames in the first build, ${frames[1].length} in the second)`,
        ]),
    ...(sample === undefined
      ? []
      : [
          `the first differing audio sample is ${sample} (${audio[0].length} and ${audio[1].length} samples)`,
        ]),
  ];

  const measured: Measured = [
    ["video frames", frames[0].length],
    [
      "frames with a different hash",
      frame === undefined
        ? 0
        : Arr.length(
            Arr.filter(Arr.zip(frames[0], frames[1]), ([a, b]) => a !== b)
          ),
    ],
    ["audio samples", audio[0].length],
    [
      "audio PCM sha256",
      pcm[0] === pcm[1]
        ? `${Str.slice(0, 12)(pcm[0])}... (equal)`
        : "different",
    ],
    [
      "container bytes",
      containers[0] === containers[1]
        ? `identical (${bytes[0].byteLength} bytes)`
        : `different (${bytes[0].byteLength} and ${bytes[1].byteLength} bytes)`,
    ],
  ];

  return verdictOf(
    "F6",
    `the two builds decode to the same ${frames[0].length} frames and the same audio samples; container bytes ${containers[0] === containers[1] ? "identical" : "different"}`,
    problems,
    measured
  );
});

/** F6 on two build directories. */
export const compareBuilds = (
  dirA: string,
  dirB: string
): Effect.Effect<Verdict, BuildInvalid, CheckServices> =>
  Effect.flatMap(
    Effect.all([locateMp4(dirA), locateMp4(dirB)]),
    ([left, right]) => guarded("F6", observe(left, right))
  );
