# @tsukuri/sounds-synth

The `SoundLibrary` of release 1 (spec 0001, design R3): the built-in sounds (`pop`, `whoosh`, `ding`), synthesised in
TypeScript. Original synthesis, mono, 48 kHz; every sound is a pure function of its name (the noise of `whoosh` comes
from a seeded integer generator), so two calls return the same samples. Nothing is read or sent anywhere.

| Export | What it is |
| --- | --- |
| `synthSounds` | `Layer<SoundLibrary>`; `info.id` is `synth-sounds@<synthesis version>` (bump it when a waveform changes); `names` is the catalogue; `sound(name)` is an `AudioClip` of 32-bit floats, or `UnknownSound` |
| `synthClip(name)` | The same clip as a plain function |
| `sfxWav(name)` | The same sound as 16-bit PCM WAV bytes (what the Deck plays) |

The catalogue is core's `SfxName`: a sound the Plan can ask for without a synthesis here fails to type-check.
`test/library.test.ts` runs the SoundLibrary contract and shows a library that is not deterministic fails clause C3 only.
