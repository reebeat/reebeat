// The Renderer service (spec 0001, design R3): a Plan to a Deck. reveal.js in release 1; reebeat's own motion
// engine later.
import type { PlanJson, RendererLifecycle } from "@reebeat/core";
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

/**
 * What a renderer says about itself: the adapter declaration and the `lifecycle` of its slide change (spec 0002, "plan
 * contract for effects"): when each Element event happens in the transition window. `schedule` resolves every effect
 * anchored to an event from it, and `verify` observes the events in the written video, so a wrong declaration fails.
 */
export interface RendererInfo extends AdapterInfo {
  readonly lifecycle: RendererLifecycle;
}

/**
 * Contract: `render` is a pure function of the Plan (equal Plans give equal bytes) and shows every Element id; `info`
 * declares a lifecycle with positive durations and non-negative lags.
 */
export class Renderer extends Context.Service<
  Renderer,
  {
    readonly info: RendererInfo;
    readonly render: (
      plan: PlanJson
    ) => Effect.Effect<RenderedDeck, RenderError>;
  }
>()("@reebeat/services/Renderer") {}
