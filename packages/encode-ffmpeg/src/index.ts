// Public surface of @tsukuri/encode-ffmpeg: the Encoder adapter on ffmpeg (lossless audio, mix, mux) and the media
// probes `@tsukuri/verify` uses to observe a written file.
export { ffmpegEncoder } from "./ffmpegEncoder.ts";

export * from "./errors.ts";

export { MediaTools } from "./mediaTools.ts";

export type { MediaTool, ToolProcess } from "./mediaTools.ts";

export * from "./probe.ts";

export { outputSampleRate } from "./settings.ts";
