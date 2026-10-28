// The offline stand-ins of the services (spec 0001, design R3): each passes its own contract suite, sends nothing
// out, and has an id ending `-standin`. They let the whole pipeline run in tests with no model, browser or binary.
export { evenAligner } from "./evenAligner.ts";

export { memoryCache, memoryCacheWith } from "./memoryCache.ts";

export type { MemoryCacheOptions } from "./memoryCache.ts";

export { silentSynthesizer } from "./silentSynthesizer.ts";

export { toneSounds } from "./toneSounds.ts";
