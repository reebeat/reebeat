# @reebeat/speech

The narration of a Plan: one audio file and one list of word times per Line, from a content-addressed cache or from the local models that fill it. Spec: [`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md) (section "Speech" and the Revision "M0 measured: speech"). Depends on `@reebeat/core` (the Plan and `AlignedLine`), `effect` and `kokoro-js`; nothing is sent to a hosted service.

```text
Plan ──Speech.alignLines──▶ AlignedLine[] ──core `schedule`──▶ Timeline
        per Line: speechKey ─▶ SpeechCache.get ─┬─ hit ─────────────────────────────▶ entry
                                                └─ miss ─ SpeechCacheOnly ─▶ SpeechCacheMiss (no model is loaded)
                                                        └─ SpeechLive ─▶ Kokoro ─▶ FLAC ─▶ whisper ─▶ alignWords ─▶ put
```

| Export | What it is |
| --- | --- |
| `speechCacheOnly(cacheDir)` | `Layer<Speech>`; reads the cache, never loads a model; a missing entry fails `SpeechCacheMiss` with the Line id, a text excerpt and the key. Needs `FileSystem`, `Path`, `Crypto` |
| `speechLive(cacheDir)` | `Layer<Speech>`; a hit is as above, a miss runs the pipeline below and fills the cache. The models load on the first miss, not before. Also needs `ChildProcessSpawner` and the three `Config` names below |
| `speechFromServices` | the live behaviour over `Tts`, `Flac`, `Aligner` and `SpeechCache` services you provide (the tests use fakes) |
| `Tts`, `Flac`, `Aligner`, `SpeechCache`, `Speech` | the services; `speechCacheFiles(dir)` is the cache on a directory |
| `alignWords(lineWords, heard, durationMs)` | plain function: words of the Line to words whisper heard (longest common subsequence over normalised words; unmatched words get interpolated times; times in `[0, durationMs]`, in order); `match` is the Dice ratio, `matchThreshold` is 0.9 |
| `speechParams`, `speechKey` | the cache key: SHA-256 (Effect `Crypto`) of the canonical JSON of the parameters |
| `SpeechCacheMiss`, `AlignmentBelowThreshold`, `SpeechCacheFailed`, `SpeechToolFailed` | the tagged errors (`SpeechError` is their union) |

## The fixed pipeline

Written once in `src/pipeline.ts`; every value is part of the cache key.

1. Kokoro-82M (`onnx-community/Kokoro-82M-v1.0-ONNX`, fp32, voice `af_heart`, speed from `Line.hints.speed`) through `kokoro-js` 1.2.1 gives float32 mono samples at 24 kHz.
2. ffmpeg encodes them to **FLAC s16 24 kHz mono, level 8, bit-exact**. This FLAC is what the cache stores and what `audio.sha256` hashes.
3. ffmpeg decodes **that FLAC** to a 16 kHz mono s16 WAV (whisper's input; feeding the 24 kHz audio directly shifted words by 90 ms).
4. `whisper-cli -m <model> -f <wav> -ml 1 -sow -oj -np -t 4` (whisper.cpp 1.9.5-dev, `ggml-base.en.bin`) writes one JSON entry per word; the empty first segment is dropped.
5. `alignWords` matches the heard words to `Line.words`; below 0.9 the run fails `AlignmentBelowThreshold` and caches nothing.

Word boundaries are consistent but not accurate: the last word's end can overshoot the audible end and the first word can start early. Cues fire at the aligned time, and the checks compare against the aligned time.

## The cache

`<cacheDir>/<key>.flac` and `<cacheDir>/<key>.json`, written audio first and words last (an entry is visible only when whole). The words file is `{ audioSha256, durationMs, key, match, params, words: [{ endMs, startMs, w }] }`, keys in alphabetical order, decoded with a Schema on read; `words[i].w` is `Line.words[i]`. A read hashes the FLAC and compares it with `audioSha256`, so a truncated or swapped file is `SpeechCacheFailed`, never a hit.

The key is the SHA-256 of the canonical JSON of `{ dtype, ffmpegFlags, kokoroJs, pipelineVersion, speed, text, ttsModel, voice, whisperCpp, whisperModelSha256 }`. Each input changes the key (`test/key.test.ts`). Change anything the key does not name (the whisper arguments, the alignment rules) and you must bump `pipeline.version`.

The committed cache of the story is `stories/same-id/speech-cache/` (12 entries, 1.2 MB). `test/committed.test.ts` proves it is not stale: every Line of `story.fountain` has an entry whose words are the Line's words, the audio matches its hash, the directory holds nothing else, and the aligned Lines schedule.

## Refill the cache

Needs devenv (`ffmpeg`, `whisper-cli`), network for the first Kokoro download, and these files outside the repository:

| Config | Meaning | Default |
| --- | --- | --- |
| `REEBEAT_KOKORO_CACHE` | directory for the Hugging Face model files (311 MiB, downloaded on first use) | none, required |
| `REEBEAT_WHISPER_MODEL` | `ggml-base.en.bin` | none, required |
| `REEBEAT_WHISPER_BIN` | the whisper.cpp binary | `whisper-cli` |

```sh
M=${XDG_CACHE_HOME:-$HOME/.cache}/reebeat
mkdir -p "$M/models"
cp /path/to/ggml-base.en.bin "$M/models/"          # whisper.cpp base.en model, hash below
sha256sum "$M/models/ggml-base.en.bin"              # must print the hash below
export REEBEAT_KOKORO_CACHE="$M/kokoro" REEBEAT_WHISPER_MODEL="$M/models/ggml-base.en.bin"
devenv shell -- bun run refill                      # in packages/speech; fills stories/same-id/speech-cache
```

Prefer the CLI: `bun run reebeat build stories/same-id/story.fountain --out build/same-id --refresh-speech` (see [`packages/cli`](../cli/README.md)) fills the cache of the story the same way and builds the deck and video from it. `refill` (above) is the package-local path for the one story and needs no browser: it narrates every Line (a hit loads no model), checks that the aligned words schedule, and prints how long the video runs. Both go through `speechLive`, which checks the whisper version and the model hash against `pipeline.ts` before the first use and fails `SpeechToolFailed` if either differs. To rebuild an entry, delete its two files and run it again.

| Model file | SHA-256 |
| --- | --- |
| `ggml-base.en.bin` (whisper.cpp base.en) | `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |
| `onnx/model.onnx` of `onnx-community/Kokoro-82M-v1.0-ONNX` (fp32), as downloaded on 2026-10-28 | `8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb` |
| `voices/af_heart.bin` (ships inside the `kokoro-js` 1.2.1 package) | `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b` |

The Kokoro model is fetched by model id without a pinned revision, and the key names the id, not the file hash: if Hugging Face changes the file, old entries keep matching. `bun run test:live` regenerates one Line and compares it with the committed entry; run it after a model or tool change.

## Tests

`bun run test` (no model, no network, part of `ready`): `alignWords` cases and properties, key sensitivity, schema and cache behaviour (tampered audio, truncated words, foreign key), `speechCacheOnly` hit and miss, the live pipeline over fake models (fills the cache, a second run loads nothing, a poor alignment and a failing tool cache nothing), whisper JSON and `Config`, and the committed cache against the committed story, including the F12 control: a copy of the cache with one entry removed fails `SpeechCacheMiss` naming that Line.

`bun run test:live` (opt-in, real models, about 4 s once the models are cached): regenerates one Line of the story and requires the entry, hence the FLAC bytes, to equal the committed one.
