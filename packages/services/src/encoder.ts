// The Encoder service (spec 0001, design R3): lossless audio encode and decode, and the mux of frames, an audio
// mix, subtitles and chapters into one media file (ffmpeg, local, in release 1).
import { Context } from "effect";
import type { Effect, Scope, Stream } from "effect";

import type { CaptureFailure, EncodeError } from "./errors.ts";
import type { AdapterInfo, AudioClip } from "./types.ts";

export interface MuxRequest {
  readonly chapters: readonly {
    readonly endMs: number;
    readonly startMs: number;
    readonly title: string;
  }[];
  readonly fps: number;
  /** PNG frames in order, as `FrameCapturer.capture` emits them; consumed once. */
  readonly frames: Stream.Stream<Uint8Array, CaptureFailure, Scope.Scope>;
  readonly height: number;
  readonly metadata: { readonly comment: string; readonly title: string };
  /** True: the rate is the 1000/1001 fraction of `fps` (`settings.ntsc`); the ffmpeg encoder refuses it for now. */
  readonly ntsc: boolean;
  readonly outPath: string;
  /** Clips mixed into one audio stream, each starting at `startMs`. */
  readonly tracks: readonly {
    readonly clip: AudioClip;
    readonly startMs: number;
  }[];
  readonly totalMs: number;
  /** WebVTT text carried verbatim as the subtitle stream. */
  readonly vtt: string;
  readonly width: number;
}

export interface MuxResult {
  readonly bytes: number;
  readonly frames: number;
  readonly path: string;
}

/**
 * Contract: `decodeAudio(encodeAudio(clip))` equals `clip` within one s16 step; `mux` writes `outPath` with the
 * frames it received, every track, the subtitles and the chapters. `mux` owns the Scope its frame stream needs and
 * releases it before it returns or fails.
 */
export class Encoder extends Context.Service<
  Encoder,
  {
    readonly decodeAudio: (
      bytes: Uint8Array
    ) => Effect.Effect<AudioClip, EncodeError>;
    readonly encodeAudio: (
      clip: AudioClip
    ) => Effect.Effect<Uint8Array, EncodeError>;
    readonly info: AdapterInfo;
    readonly mux: (
      request: MuxRequest
    ) => Effect.Effect<MuxResult, CaptureFailure | EncodeError>;
  }
>()("@reebeat/services/Encoder") {}
