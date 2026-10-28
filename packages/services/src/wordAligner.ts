// The WordAligner service (spec 0001, design R3): audio and the words it should contain to one time span per
// word and a match ratio. Adapters: whisper.cpp (local); the even stand-in; later the provider's own timings.
import { Context } from "effect";
import type { Effect } from "effect";

import type { AlignError } from "./errors.ts";
import type { AdapterInfo, AudioClip, WordSpan } from "./types.ts";

export interface AlignRequest {
  readonly clip: AudioClip;
  /** The timings a synthesiser supplied, if any; an aligner may use them instead of listening. */
  readonly hint?: readonly WordSpan[];
  /** The words the clip should contain, in order. */
  readonly words: readonly string[];
}

export interface Alignment {
  /** In [0, 1]: how much of what was expected was found; 1 when `hint` is the truth. */
  readonly match: number;
  /** One span per word of the request: monotonic and inside the clip. */
  readonly spans: readonly WordSpan[];
}

export class WordAligner extends Context.Service<
  WordAligner,
  {
    readonly align: (
      request: AlignRequest
    ) => Effect.Effect<Alignment, AlignError>;
    readonly info: AdapterInfo;
  }
>()("@reebeat/services/WordAligner") {}
