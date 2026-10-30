// The FrameCapturer service (spec 0001, design R3): a written Deck and its Plan to a stream of PNG frames on a
// controlled clock (headless Chromium in release 1).
import type { PlanJson } from "@tsukuri/core";
import { Context } from "effect";
import type { Scope, Stream } from "effect";

import type { CaptureFailure } from "./errors.ts";
import type { AdapterInfo } from "./types.ts";

export interface CaptureRequest {
  /** The directory the Renderer's files were written to. */
  readonly deckDir: string;
  readonly plan: PlanJson;
}

/**
 * Contract: `frames(plan)` is pure; `capture` emits exactly that many PNGs of the Plan's canvas size, equal on two
 * runs. The browser or other resource lives in the stream's Scope: its consumer owns it.
 */
export class FrameCapturer extends Context.Service<
  FrameCapturer,
  {
    readonly capture: (
      request: CaptureRequest
    ) => Stream.Stream<Uint8Array, CaptureFailure, Scope.Scope>;
    /** How many frames `capture` will emit for this Plan. */
    readonly frames: (plan: PlanJson) => number;
    readonly info: AdapterInfo;
  }
>()("@tsukuri/services/FrameCapturer") {}
