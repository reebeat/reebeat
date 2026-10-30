// The pure parts of the mux: chapter text, the audio filter graph and the ffmpeg arguments, with every expected
// string written out by hand (ported from the video package's tests for the same flags and graph).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { audioMix } from "../src/audioMix.ts";
import { ffmetadata } from "../src/ffmetadata.ts";
import { muxArgs } from "../src/mux.ts";

describe("ffmetadata", () => {
  it("writes one chapter per request chapter in milliseconds, escaping = ; # and backslash", () => {
    assert.strictEqual(
      ffmetadata([
        { endMs: 5200, startMs: 0, title: "Part one" },
        { endMs: 7300, startMs: 5200, title: "Part two; =#\\ marks" },
      ]),
      Arr.join(
        [
          ";FFMETADATA1",
          "[CHAPTER]",
          "TIMEBASE=1/1000",
          "START=0",
          "END=5200",
          "title=Part one",
          "[CHAPTER]",
          "TIMEBASE=1/1000",
          "START=5200",
          "END=7300",
          "title=Part two\\; \\=\\#\\\\ marks",
          "",
        ],
        "\n"
      )
    );
  });
});

describe("audioMix", () => {
  it("delays each input, mixes without normalising and cuts the track to the Video length", () => {
    const { durationSeconds, filterComplex } = audioMix(
      [1000, 3700, 6200, 2167],
      7300,
      1
    );

    const prepare =
      "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";

    assert.strictEqual(durationSeconds, "7.300000");
    assert.strictEqual(
      filterComplex,
      Arr.join(
        [
          `[1:a]${prepare},adelay=1000:all=1[a0]`,
          `[2:a]${prepare},adelay=3700:all=1[a1]`,
          `[3:a]${prepare},adelay=6200:all=1[a2]`,
          `[4:a]${prepare},adelay=2167:all=1[a3]`,
          "[a0][a1][a2][a3]amix=inputs=4:normalize=0:duration=longest:dropout_transition=0,apad=whole_dur=7.300000,atrim=end=7.300000[aout]",
        ],
        ";"
      )
    );
  });

  it("is silence of the video's length when there is no track", () => {
    assert.strictEqual(
      audioMix([], 400, 1).filterComplex,
      "anullsrc=r=48000:cl=stereo,atrim=end=0.400000,aformat=sample_fmts=fltp[aout]"
    );
  });
});

describe("muxArgs", () => {
  const clip = { sampleRate: 24_000, samples: new Float32Array(0) };

  const request = {
    fps: 30,
    height: 720,
    metadata: { comment: "tsukuri source-sha256 abc", title: "A small story" },
    tracks: [
      { clip, startMs: 1000 },
      { clip, startMs: 2167 },
    ],
    width: 1280,
  };

  const args = muxArgs(request, audioMix([1000, 2167], 7300, 1), {
    ffmetadata: "/s/chapters.ffmetadata",
    output: "/s/out.mp4",
    tracks: ["/s/track0.f32", "/s/track1.f32"],
    vtt: "/s/out.vtt",
  });

  /** Whether `sequence` occurs in `args` as consecutive arguments. */
  const has = (sequence: readonly string[]): boolean =>
    Arr.some(args, (_, index) =>
      Arr.every(sequence, (value, offset) => args[index + offset] === value)
    );

  it("encodes the video, audio and subtitles as specified", () => {
    assert.isTrue(
      has([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
      ])
    );
    assert.isTrue(has(["-r", "30"]));
    assert.isTrue(has(["-threads", "4"]));
    assert.isTrue(
      has(["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"])
    );
    assert.isTrue(has(["-c:s", "mov_text"]));
    assert.isTrue(has(["-movflags", "+faststart"]));
    assert.isTrue(
      has(["-vf", "scale=1280:720:out_color_matrix=bt709:out_range=tv"])
    );
  });

  it("carries the determinism flags, the title and the comment", () => {
    assert.isTrue(
      has([
        "-fflags",
        "+bitexact",
        "-flags:v",
        "+bitexact",
        "-flags:a",
        "+bitexact",
      ])
    );
    assert.isTrue(has(["-map_metadata:g", "-1"]));
    assert.isTrue(has(["-metadata", "title=A small story"]));
    assert.isTrue(has(["-metadata", "comment=tsukuri source-sha256 abc"]));
  });

  it("reads the frames from stdin first, then each track, the subtitles and the chapters", () => {
    assert.isTrue(
      has([
        "-f",
        "image2pipe",
        "-framerate",
        "30",
        "-c:v",
        "png",
        "-i",
        "pipe:0",
      ])
    );
    assert.isTrue(
      has([
        "-f",
        "f32le",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-i",
        "/s/track0.f32",
        "-f",
        "f32le",
        "-ar",
        "24000",
        "-ac",
        "1",
        "-i",
        "/s/track1.f32",
        "-i",
        "/s/out.vtt",
        "-i",
        "/s/chapters.ffmetadata",
      ])
    );
    assert.isTrue(has(["-map", "3:s", "-map_chapters", "4"]));
  });
});
