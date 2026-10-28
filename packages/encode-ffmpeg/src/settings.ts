// The fixed ffmpeg settings of release 1 (spec 0001, "M0 measured: speech" and "video as built"). The argument lists
// are written once as arrays; the Encoder's `info.settings` and the commands are derived from the same arrays, so
// what an asset's provenance names and what ran cannot drift apart.

/** The sample rate of the mixed audio track of the video: 48 kHz stereo. */
export const outputSampleRate = 48_000;

/** The cache's audio: float mono samples to FLAC s16, level 8, bit-exact so the bytes do not depend on the ffmpeg build's encoder tag. */
export const flacArgs = [
  "-sample_fmt",
  "s16",
  "-c:a",
  "flac",
  "-compression_level",
  "8",
  "-fflags",
  "+bitexact",
  "-flags:a",
  "+bitexact",
] as const;

/** The video stream of the mp4: H.264, tagged bt709 (the colour conversion is the `scale` filter of the mux). */
export const videoArgs = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-threads",
  "4",
] as const;

/** The audio stream of the mp4: AAC, 160 kbit/s, 48 kHz stereo. */
export const audioArgs = [
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-ar",
  String(outputSampleRate),
  "-ac",
  "2",
] as const;

/** The subtitle stream: the WebVTT text as `mov_text`, English. */
export const subtitleArgs = [
  "-metadata:s:s:0",
  "language=eng",
  "-c:s",
  "mov_text",
] as const;

/** The determinism flags: no encoder tag, no global metadata of the inputs (`-map_metadata:g -1`; plain `-map_metadata -1` also drops the chapter titles with ffmpeg 9). */
export const bitexactArgs = [
  "-fflags",
  "+bitexact",
  "-flags:v",
  "+bitexact",
  "-flags:a",
  "+bitexact",
] as const;
