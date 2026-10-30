// Public surface of @tsukuri/services: the seven service tags with their request and response types, the shared
// value types, the tagged errors, the one cache key and the one selection registry. Contract suites are
// `@tsukuri/services/contract`; offline stand-ins are `@tsukuri/services/standins`.
export { AssetCache } from "./assetCache.ts";

export type { KeyRequest } from "./assetCache.ts";

export { assetKey, rejectSecretSettings, secretLikeNames } from "./cacheKey.ts";

export { Encoder } from "./encoder.ts";

export type { MuxRequest, MuxResult } from "./encoder.ts";

export * from "./errors.ts";

export { requireOutputName } from "./outputName.ts";

export { FrameCapturer } from "./frameCapturer.ts";

export type { CaptureRequest } from "./frameCapturer.ts";

export { Renderer } from "./renderer.ts";

export type { RenderedDeck, RendererInfo } from "./renderer.ts";

export {
  choices,
  decodeSelection,
  defaults,
  SelectionSchema,
} from "./selection.ts";

export type { Selection, SelectionKey } from "./selection.ts";

export { SoundLibrary } from "./soundLibrary.ts";

export { SpeechSynthesizer } from "./speechSynthesizer.ts";

export type { Synthesis, SynthesizeRequest } from "./speechSynthesizer.ts";

export * from "./types.ts";

export { WordAligner } from "./wordAligner.ts";

export type { AlignRequest, Alignment } from "./wordAligner.ts";
