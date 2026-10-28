// Public surface of @reebeat/sounds-synth: the built-in sound catalogue, as the `SoundLibrary` adapter `synthSounds`
// and as the pure functions behind it (`synthClip` for a float clip, `sfxWav` for 16-bit PCM WAV bytes).
export { synthSounds } from "./library.ts";

export { sampleRate, sfxNames, sfxWav, synthClip } from "./sfx.ts";

export type { SfxName } from "@reebeat/core";
