// The SoundLibrary service (spec 0001, design R3): a sound name to audio. Release 1 synthesises its sounds in
// TypeScript; later local files or generated sounds.
import { Context } from "effect";
import type { Effect } from "effect";

import type { UnknownSound } from "./errors.ts";
import type { AdapterInfo, AudioClip } from "./types.ts";

export class SoundLibrary extends Context.Service<
  SoundLibrary,
  {
    readonly info: AdapterInfo;
    /** Every name `sound` answers; the library's whole catalogue. */
    readonly names: readonly string[];
    /** The clip of `name`; deterministic; `UnknownSound` for a name outside `names`. */
    readonly sound: (name: string) => Effect.Effect<AudioClip, UnknownSound>;
  }
>()("@reebeat/services/SoundLibrary") {}
