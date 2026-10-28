// The Renderer adapter of release 1: reveal.js. ABI: the installed `reveal.js` and `@fontsource/inter` packages,
// read as files when the layer is built (the page itself is the pure `renderDeck`). Outside runtime: none; nothing
// is sent anywhere. Retirement trigger: reebeat's own motion engine replaces reveal.js behind the same Renderer.
import type { PlanJson } from "@reebeat/core";
import {
  AdapterUnavailable,
  RenderFailed,
  Renderer,
  localEgress,
} from "@reebeat/services";
import { Array as Arr, Effect, Layer, Record } from "effect";
import type { FileSystem, Path } from "effect";

import { assembleDeck } from "./assemble.ts";
import { readAssets } from "./assets.ts";
import type { DeckAssetMissing, DeckMismatch } from "./errors.ts";
import { renderDeck } from "./render.ts";
import { fontFaces, palette } from "./theme.ts";

const theme = "light";

const unavailable = (cause: DeckAssetMissing) =>
  new AdapterUnavailable({
    adapter: "reveal.js",
    message: cause.message,
    requirement: `package ${cause.specifier}`,
    service: "Renderer",
  });

/**
 * reveal.js as a `Renderer`. The layer reads the packages' files once, when it is built: a package that is not
 * installed is `AdapterUnavailable`, never a fallback to another renderer. `render` is the Plan's `renderDeck` plus
 * those files, checked against the Plan before it returns (`RenderFailed` carries the `DeckMismatch`).
 */
export const revealRenderer: Layer.Layer<
  Renderer,
  AdapterUnavailable,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  Renderer,
  Effect.gen(function* build() {
    const assets = yield* Effect.mapError(readAssets(), unavailable);
    const id = `reveal.js@${assets.revealVersion}`;

    const failed = (cause: DeckMismatch) =>
      new RenderFailed({ adapter: id, cause, message: cause.message });

    return Renderer.of({
      info: {
        egress: localEgress,
        id,
        settings: {
          fonts: Arr.join(
            Arr.map(fontFaces, ({ file }) => file),
            ","
          ),
          inter: assets.interVersion,
          theme,
          ...Record.mapKeys(palette, (name) => `palette.${name}`),
        },
      },
      render: Effect.fn("Renderer.render")(function* render(plan: PlanJson) {
        return yield* Effect.mapError(
          assembleDeck(plan, renderDeck(plan), assets),
          failed
        );
      }),
    });
  })
);
