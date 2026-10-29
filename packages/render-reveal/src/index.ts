// Public surface of @reebeat/render-reveal: the reveal.js `Renderer` adapter, the pure page generator behind it, and
// the reader and checker of a written page (`readDeck`, `checkDeck`, used by the build's own check and by verify).
// It depends on the core's types only: it never parses a screenplay (spec 0001, F11). Writing the files of a
// `RenderedDeck` is the pipeline's file-system work, not this package's.
export { assembleDeck, deckEntry } from "./assemble.ts";

export { readAssets } from "./assets.ts";

export type { DeckAsset, DeckAssets } from "./assets.ts";

export { checkDeck } from "./check.ts";

export { DeckAssetMissing, DeckMismatch } from "./errors.ts";

export { readDeck } from "./read.ts";

export type {
  DeckElement,
  DeckFragment,
  DeckModel,
  DeckSlide,
} from "./read.ts";

export { renderDeck } from "./render.ts";

export type { DeckBundle, DeckFile } from "./render.ts";

export { revealRenderer } from "./renderer.ts";
