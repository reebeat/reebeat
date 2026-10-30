// Public surface of @tsukuri/pipeline: the build program over services only (speech stage, schedule, render, capture,
// encode, manifest), the files it writes and the manifest's schema. No outside runtime.
export { buildProgram } from "./buildProgram.ts";

export type { BuildOptions, BuildSummary } from "./buildProgram.ts";

export * from "./errors.ts";

export { sha256Hex } from "./hash.ts";

export {
  AdapterRecordSchema,
  BuildManifestSchema,
  decodeBuildManifest,
  encodeBuildManifest,
  manifestFile,
  writeManifest,
} from "./manifest.ts";

export type { AdapterRecord, BuildManifest } from "./manifest.ts";

export { readSource } from "./source.ts";

export type { Source } from "./source.ts";

export { audioName, wordsName } from "./speechAsset.ts";

export { defaultVoice, pipelineVersion, speechStage } from "./speechStage.ts";

export type { SpeechStageOptions } from "./speechStage.ts";

export { muxChapters, narrationStarts, sfxStarts, videoMs } from "./tracks.ts";

export { writeRenderedDeck, writeSounds } from "./writeDeck.ts";

export { muxStage } from "./muxStage.ts";

export type { MuxTarget } from "./muxStage.ts";
