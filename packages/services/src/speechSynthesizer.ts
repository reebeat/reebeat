// The SpeechSynthesizer service (spec 0001, design R3): text, voice and speed to mono audio, and the provider's own
// word timings when it has them. Adapters: Kokoro (local), a silent stand-in; later a hosted provider.
import { Context } from "effect";
import type { Effect } from "effect";

import type { SpeechError } from "./errors.ts";
import type { AdapterInfo, AudioClip, WordSpan } from "./types.ts";

export interface SynthesizeRequest {
  /** Speaking rate: 1 is the voice's normal pace, 1.1 is faster. */
  readonly speed: number;
  /** What to say; never empty (`EmptyText`). */
  readonly text: string;
  readonly voice: string;
}

export interface Synthesis {
  readonly clip: AudioClip;
  /** The provider's own timings, one per whitespace-separated word of `text`, when it has them. */
  readonly words?: readonly WordSpan[];
}

/**
 * Contract: `synthesize` is deterministic for equal requests, fails `EmptyText` for text with no words, and
 * requires nothing (the layer holds the model or credential). `info` says what leaves the machine.
 */
export class SpeechSynthesizer extends Context.Service<
  SpeechSynthesizer,
  {
    readonly info: AdapterInfo;
    readonly synthesize: (
      request: SynthesizeRequest
    ) => Effect.Effect<Synthesis, SpeechError>;
  }
>()("@tsukuri/services/SpeechSynthesizer") {}
