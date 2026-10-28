// The Renderer service (spec 0001, design R3): a Plan to a Deck. reveal.js in release 1; reebeat's own motion
// engine later.
import type { PlanJson } from "@reebeat/core";
import { Context } from "effect";
import type { Effect } from "effect";

import type { RenderError } from "./errors.ts";
import type { AdapterInfo } from "./types.ts";

export interface RenderedDeck {
  /** The path, inside `files`, of the file a browser opens. */
  readonly entry: string;
  /** Relative paths with unique names; the caller writes them under one directory. */
  readonly files: readonly {
    readonly content: string | Uint8Array;
    readonly path: string;
  }[];
}

/** Contract: `render` is a pure function of the Plan (equal Plans give equal bytes) and shows every Element id. */
export class Renderer extends Context.Service<
  Renderer,
  {
    readonly info: AdapterInfo;
    readonly render: (
      plan: PlanJson
    ) => Effect.Effect<RenderedDeck, RenderError>;
  }
>()("@reebeat/services/Renderer") {}
