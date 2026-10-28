// The contract suites of the seven services: `xContract(label, layer, options?)` registers one test per clause, named
// `id: means`, for the adapter `layer` provides. Every adapter of a service runs its suite; the stand-ins run them
// here, the live adapters in their own packages. `xClauses` are the same clauses as data, for negative controls.
export { failingClauses } from "./clause.ts";

export type { Clause } from "./clause.ts";

export {
  assetCacheClauses,
  assetCacheContract,
  atomicWriteClause,
} from "./assetCache.ts";

export type { AssetCacheOptions } from "./assetCache.ts";

export { encoderClauses, encoderContract } from "./encoder.ts";

export type { EncoderOptions, MuxProbe } from "./encoder.ts";

export { contractPlan } from "./fixture.ts";

export type { PlanOptions } from "./fixture.ts";

export {
  frameCapturerClauses,
  frameCapturerContract,
} from "./frameCapturer.ts";

export { rendererClauses, rendererContract } from "./renderer.ts";

export { soundLibraryClauses, soundLibraryContract } from "./soundLibrary.ts";

export {
  speechSynthesizerClauses,
  speechSynthesizerContract,
} from "./speechSynthesizer.ts";

export type { SpeechSynthesizerOptions } from "./speechSynthesizer.ts";

export { wordAlignerClauses, wordAlignerContract } from "./wordAligner.ts";

export type { WordAlignerOptions } from "./wordAligner.ts";
