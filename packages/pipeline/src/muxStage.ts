// The mux stage: the captured frames, the narration of every Line at its start, the sound of every `sfx` Cue at its
// fire frame, the WebVTT subtitles and the chapters become `<name>.mp4` (through `Encoder.mux`) and `<name>.vtt`
// beside it. The Encoder owns the scope its frame stream needs.
import type { TimedPlan } from "@reebeat/core";
import { Encoder, SoundLibrary } from "@reebeat/services";
import type { CaptureFailure } from "@reebeat/services";
import { vtt } from "@reebeat/subtitles";
import { Effect, FileSystem, Path } from "effect";
import type { Scope, Stream } from "effect";

import { outputFailed } from "./errors.ts";
import { narrationTracks } from "./narration.ts";
import { muxChapters, sfxStarts, videoMs } from "./tracks.ts";

export interface MuxTarget {
  /** The base name of `<name>.mp4` and `<name>.vtt`. */
  readonly name: string;
  /** The directory that receives both; it exists. */
  readonly outDir: string;
}

/** Writes `<name>.vtt` and `<name>.mp4` of `plan` from `frames`. Needs the speech assets of the Plan's Lines in the cache. */
export const muxStage = Effect.fn("muxStage")(function* muxStage(
  plan: TimedPlan,
  frames: Stream.Stream<Uint8Array, CaptureFailure, Scope.Scope>,
  target: MuxTarget
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const library = yield* SoundLibrary;
  const subtitles = vtt(plan);
  const vttFile = path.join(target.outDir, `${target.name}.vtt`);

  const sounds = yield* Effect.forEach(sfxStarts(plan), (sound) =>
    Effect.map(library.sound(sound.name), (clip) => ({
      clip,
      startMs: sound.startMs,
    }))
  );

  const narration = yield* narrationTracks(plan);

  yield* Effect.mapError(
    fs.writeFileString(vttFile, subtitles),
    outputFailed(vttFile, "write")
  );

  return yield* (yield* Encoder).mux({
    chapters: muxChapters(plan),
    fps: plan.settings.fps,
    frames,
    height: plan.settings.height,
    metadata: {
      comment: `reebeat source-sha256 ${plan.sourceSha256}`,
      title: plan.title,
    },
    outPath: path.join(target.outDir, `${target.name}.mp4`),
    totalMs: videoMs(plan),
    tracks: [...narration, ...sounds],
    vtt: subtitles,
    width: plan.settings.width,
  });
});
