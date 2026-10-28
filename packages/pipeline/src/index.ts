// Public surface of @reebeat/pipeline: the build program over services only. Release 1 so far: the speech stage.
export * from "./errors.ts";

export { audioName, wordsName } from "./speechAsset.ts";

export { defaultVoice, pipelineVersion, speechStage } from "./speechStage.ts";

export type { SpeechStageOptions } from "./speechStage.ts";
