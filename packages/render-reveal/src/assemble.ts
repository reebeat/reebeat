// The Deck as the Renderer hands it over: the page, the generated text files and the binary assets, all in memory.
// `assembleDeck` reads the page back and runs `checkDeck` on it, so a Deck that disagrees with its Plan is never
// returned (spec 0001, F4: "the generator re-reads its own output"). Writing the files is the pipeline's job.
import type { PlanJson } from "@tsukuri/core";
import type { RenderedDeck } from "@tsukuri/services";
import { Array as Arr, Effect } from "effect";

import type { DeckAssets } from "./assets.ts";
import { checkDeck } from "./check.ts";
import type { DeckBundle } from "./render.ts";

/** The path of the page, in every Deck. */
export const deckEntry = "deck.html";

/**
 * The files of `bundle` and `assets` as a `RenderedDeck`, after `checkDeck` has accepted `bundle.html` against
 * `plan`. Fails with the first `DeckMismatch`.
 */
export const assembleDeck = (
  plan: PlanJson,
  bundle: DeckBundle,
  assets: DeckAssets
) =>
  Effect.as(checkDeck(plan, bundle.html), {
    entry: deckEntry,
    files: [
      ...Arr.map(bundle.files, ({ path, text }) => ({ content: text, path })),
      { content: bundle.html, path: deckEntry },
      ...Arr.map(assets.files, ({ bytes, path }) => ({
        content: bytes,
        path,
      })),
    ],
  } satisfies RenderedDeck);
