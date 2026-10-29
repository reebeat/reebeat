# @reebeat/services

The service tier (design R3, spec 0001): the seven Effect services of the build, their request and response types, the tagged errors, the one cache key and the one selection registry. It imports libraries only (`@reebeat/core`); adapters implement it, the build program (`@reebeat/pipeline`) is written over it.

| Service | What it does | Adapters |
| --- | --- | --- |
| `SpeechSynthesizer` | text, voice, speed to audio, optionally the provider's word timings | `speech-kokoro`; stand-in `silentSynthesizer` |
| `WordAligner` | audio and words to a time span per word | `align-whisper`; stand-in `evenAligner` |
| `SoundLibrary` | a catalogue sound by name | `sounds-synth`; stand-in `toneSounds` |
| `Renderer` | a Plan to a Deck | `render-reveal` |
| `FrameCapturer` | a Deck and a Plan to PNG frames | `capture-chromium` |
| `Encoder` | FLAC audio, and the mux of frames, tracks, subtitles and chapters into an mp4 | `encode-ffmpeg` |
| `AssetCache` | the content-addressed store of speech assets, with provenance | `cache-fs`; stand-in `memoryCache` |

**Contract suites** (`@reebeat/services/contract`): each service has numbered clauses (`C1`, ...) and `xContract(label, layer, options?)` registers one test per clause for an adapter. Every adapter runs its suite; live ones in their own package. `xClauses` are the same clauses as data, for negative controls (`failingClauses`). `assetCacheContract` needs `failingWriters`, stores whose `put` fails at each step: without one it registers a failing test, not a skipped one.

**Stand-ins** (`@reebeat/services/standins`): offline, local, ids end `-standin`; they run the whole pipeline with no model.

**Selection**: one registry, `src/selection.ts` (`choices`, `defaults`, `decodeSelection`). The composition root (`packages/cli`) reads `reebeat.config.json` and the flags; an unknown key or value is `UnknownSelection`, a missing requirement is `AdapterUnavailable`, and nothing falls back to another adapter.

Also here: `assetKey` (the SHA-256 cache key), `rejectSecretSettings` (a setting named like a secret is refused), `requireOutputName` (the one rule for the base name of a build's files).

`bun run test`: the key, the selection, the stand-ins against their own contracts, and negative controls that a broken adapter fails exactly the named clause.
