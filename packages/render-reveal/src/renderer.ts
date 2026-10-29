// The Renderer adapter of release 1: reveal.js. ABI: the installed `reveal.js` and `@fontsource/inter` packages, read
// as files when the layer is built; their absence is raised on first use. The page itself is the pure `renderDeck`.
// Outside runtime: none; nothing is sent anywhere. Retirement trigger: reebeat's own motion engine replaces reveal.js
// behind the same Renderer.
import type { PlanJson } from "@reebeat/core";
import {
  AdapterUnavailable,
  RenderFailed,
  Renderer,
  localEgress,
} from "@reebeat/services";
import { Array as Arr, Effect, Exit, Layer, Record } from "effect";
import type { FileSystem, Path } from "effect";

import { assembleDeck } from "./assemble.ts";
import { readAssets } from "./assets.ts";
import type { DeckAssetMissing, DeckMismatch } from "./errors.ts";
import { revealLifecycle } from "./lifecycle.ts";
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

/** What `info` says of a package that could not be read. */
const unread = "unavailable";

/**
 * reveal.js as a `Renderer`. The layer reads the packages' files once, when it is built, and settles the outcome: a
 * package that is not installed does not stop the layer, it fails every `render` with `AdapterUnavailable` (never a
 * fallback to another renderer). `render` is the Plan's `renderDeck` plus those files, checked against the Plan before
 * it returns (`RenderFailed` carries the `DeckMismatch`).
 */
export const revealRenderer: Layer.Layer<
  Renderer,
  never,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  Renderer,
  Effect.gen(function* build() {
    const settled = yield* Effect.exit(readAssets());
    const loaded = Effect.mapError(settled, unavailable);

    const versions = Exit.match(settled, {
      onFailure: () => ({ inter: unread, reveal: unread }),
      onSuccess: ({ interVersion, revealVersion }) => ({
        inter: interVersion,
        reveal: revealVersion,
      }),
    });

    const id = `reveal.js@${versions.reveal}`;

    const failed = (cause: DeckMismatch) =>
      new RenderFailed({ adapter: id, cause, message: cause.message });

    return Renderer.of({
      info: {
        egress: localEgress,
        id,
        lifecycle: revealLifecycle,
        settings: {
          fonts: Arr.join(
            Arr.map(fontFaces, ({ file }) => file),
            ","
          ),
          inter: versions.inter,
          theme,
          ...Record.mapKeys(palette, (name) => `palette.${name}`),
        },
      },
      render: Effect.fn("Renderer.render")(function* render(plan: PlanJson) {
        const assets = yield* loaded;

        return yield* Effect.mapError(
          assembleDeck(plan, renderDeck(plan), assets),
          failed
        );
      }),
    });
  })
);
