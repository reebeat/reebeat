// The narration audio of a built Plan: for each Line, the clip its cached FLAC decodes to, started where the Timeline
// starts the Line. The mux mixes these with the sounds of the Cues.
import type { TimedPlan } from "@reebeat/core";
import { AssetCache, Encoder } from "@reebeat/services";
import { Array as Arr, Effect, Option } from "effect";

import { SpeechAssetInvalid } from "./errors.ts";
import { audioName } from "./speechAsset.ts";
import { narrationStarts } from "./tracks.ts";

/** The clip of one Line's cached audio, or `SpeechAssetInvalid` when the asset or its FLAC is gone. */
const clipOf = Effect.fn("narration.clip")(function* clipOf(
  key: string,
  lineId: string
) {
  const cache = yield* AssetCache;
  const encoder = yield* Encoder;
  const asset = yield* cache.get(key);

  const audio = Option.flatMap(asset, (found) =>
    Arr.findFirst(found.files, (file) => file.name === audioName)
  );

  if (Option.isNone(audio)) {
    return yield* new SpeechAssetInvalid({
      cause: Option.isNone(asset) ? "no asset" : `no ${audioName}`,
      key,
      lineId,
      message: `the asset ${key} of Line ${lineId} has no ${audioName}: the cache changed during the build`,
    });
  }

  return yield* encoder.decodeAudio(audio.value.bytes);
});

/** Every Line's narration clip with its start, in timeline order. */
export const narrationTracks = (plan: TimedPlan) =>
  Effect.forEach(narrationStarts(plan), ({ key, lineId, startMs }) =>
    Effect.map(clipOf(key, lineId), (clip) => ({ clip, startMs }))
  );
