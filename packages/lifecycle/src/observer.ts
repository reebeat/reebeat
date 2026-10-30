import { Context } from "effect";
import type { Effect } from "effect";

import type { ObserveFailed } from "./errors.ts";
import type { AudioStats, BuildFiles, FrameImage, MediaFacts } from "./read.ts";

/**
 * What a model can use from the video of a build (spec 0016, "Binary artifacts and observation"): a frame as a small
 * image, loudness and onsets of the audio, the streams and chapters. Never media bytes: a person
 * opens the files. The tools the verifier already trusts do the work (ffmpeg, ffprobe).
 */
export class Observer extends Context.Service<
  Observer,
  {
    /** Loudness per 100 ms bucket and the onsets, between two times; never samples. */
    readonly audio: (
      files: BuildFiles,
      window: { readonly fromMs: number; readonly toMs: number }
    ) => Effect.Effect<AudioStats, ObserveFailed>;
    /** The video frame `frame` (at `seconds`, one frame lasting `frameSeconds`) as a JPEG of at most `maxBytes`. */
    readonly frame: (
      files: BuildFiles,
      request: {
        readonly frame: number;
        readonly frameSeconds: number;
        readonly maxBytes: number;
        readonly seconds: number;
      }
    ) => Effect.Effect<FrameImage, ObserveFailed>;
    /** The streams, chapters and duration of the mp4. */
    readonly media: (
      files: BuildFiles
    ) => Effect.Effect<MediaFacts, ObserveFailed>;
  }
>()("@tsukuri/lifecycle/Observer") {}
