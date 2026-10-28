// Public surface of @reebeat/deck: plan.json to deck.html, and the checks of the written page against its Plan.
// It depends on the core's types only: it never parses a screenplay (spec 0001, F11).
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

export { writeDeck } from "./write.ts";
