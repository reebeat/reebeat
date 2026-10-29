import { Schema } from "effect";

/** A written Deck differs from its Plan. `slide` is the Scene id ("" for the page), `index` the position in the slide. */
export class DeckMismatch extends Schema.TaggedError<
  DeckMismatch,
  { readonly brand: unique symbol }
>()("DeckMismatch", {
  check: Schema.Literals([
    "F3 notes",
    "F4 fragments",
    "F5 source hash",
    "elements",
    "slides",
    "transitions",
  ]),
  index: Schema.NullOr(Schema.Int),
  message: Schema.String,
  slide: Schema.String,
}) {}

/** A package file the Deck copies is not installed. */
export class DeckAssetMissing extends Schema.TaggedError<
  DeckAssetMissing,
  { readonly brand: unique symbol }
>()("DeckAssetMissing", {
  cause: Schema.Defect(),
  message: Schema.String,
  specifier: Schema.String,
}) {}
