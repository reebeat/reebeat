# @reebeat/pipeline

The build program over services only (design R3). Release 1 so far: the speech stage. It imports `@reebeat/core` and `@reebeat/services`; it names no model, binary, directory or vendor, and the tier gate (`tools/quality/tiers.ts`) keeps it that way. The composition root (`@reebeat/cli`) picks the adapters.

```text
Plan ──speechStage(plan, { refresh })──▶ AlignedLine[] ──core `schedule`──▶ Timeline
  per Line: AssetCache.key ─▶ AssetCache.get ─┬─ hit ───────────────────────────────▶ decode `flac`, `words.json`
                                               ├─ miss, refresh: false ─▶ SpeechCacheMiss naming the Line and the key (F12)
                                               └─ miss, refresh: true ─▶ SpeechSynthesizer.synthesize
                                                    ─▶ Encoder.encodeAudio ─▶ Encoder.decodeAudio ─▶ WordAligner.align
                                                    ─▶ AssetCache.put (provenance: both adapters and their settings)
```

| Export | What it is |
| --- | --- |
| `speechStage(plan, { refresh, voice? })` | `Effect<AlignedLine[]>` over `AssetCache`, `SpeechSynthesizer`, `WordAligner`, `Encoder` and `Crypto`; one Line at a time, in order. A hit calls no model |
| `SpeechCacheMiss`, `AlignmentBelowThreshold`, `SpeechAssetInvalid` | the stage's own tagged errors; the services' errors (`AdapterUnavailable`, `SynthesisFailed`, `CacheFailed`, ...) pass through unchanged |
| `pipelineVersion`, `defaultVoice` | `speech-v2` (part of every key) and `af_heart` |

## The key and the asset

`key = AssetCache.key({ adapter: synthesizer.info, input: <narration text>, extra: { aligner: aligner.info, pipeline: 'speech-v2', speed, voice } })`: the SHA-256 of the canonical JSON of the synthesiser's id and settings, the text and that extra object. Changing the voice, the speed, the text, or any setting or id of either adapter is another key; bump `pipelineVersion` when the stage changes what it caches and no other key field names it. The encoder is not in the key: its FLAC is lossless s16 and the asset records its id.

An asset is two files, `flac` (FLAC s16 mono, bit-exact) and `words.json` (`{ durationMs, match, words: [{ endMs, startMs, w }] }`, `words[i].w` is `Line.words[i]`), and a provenance. `AlignedLine.audio.file` is `<key>.flac` and `audio.sha256` is the SHA-256 of the FLAC bytes. The aligner hears the *decoded* FLAC, that is what the cache stores. A match below 0.9 fails `AlignmentBelowThreshold` and caches nothing.

## Refill the cache

The committed cache of the story is `stories/same-id/speech-cache/`, written by `@reebeat/cache-fs` (`<key>.flac`, `<key>.words.json`, `<key>.provenance.json`). It is produced by `bun run refill:speech` in `packages/cli`, which removes the old assets and runs `speechStage(plan, { refresh: true })` with Kokoro, whisper.cpp, ffmpeg and the filesystem cache. Needs devenv (`ffmpeg`, `whisper-cli`), network for the first Kokoro download, and these files outside the repository:

| Config | Meaning | Default |
| --- | --- | --- |
| `REEBEAT_KOKORO_CACHE` | directory for the Hugging Face model files (311 MiB, downloaded on first use) | none, required |
| `REEBEAT_WHISPER_MODEL` | `ggml-base.en.bin` | none, required |
| `REEBEAT_WHISPER_BIN` | the whisper.cpp binary | `whisper-cli` |

| Model file | SHA-256 |
| --- | --- |
| `ggml-base.en.bin` (whisper.cpp base.en) | `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |
| `onnx/model.onnx` of `onnx-community/Kokoro-82M-v1.0-ONNX` (fp32), as downloaded on 2026-10-28 | `8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb` |
| `voices/af_heart.bin` (ships inside the `kokoro-js` 1.2.1 package) | `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b` |

The Kokoro model is fetched by model id without a pinned revision, and the key names the id, not the file hash: if Hugging Face changes the file, old assets keep matching. `bun run test:live` in `packages/cli` regenerates one Line and compares it with the committed asset; run it after a model or tool change.

## Tests

`bun run test` (no model, no network): the stage over the stand-ins (`silentSynthesizer`, `evenAligner`, `memoryCache`) and a tiny fake `Encoder`: a hit, a miss (F12), a refresh, a match below the threshold, an invalid words file, the provenance, key sensitivity and determinism. The committed cache against the committed story, with the real adapters' declarations, is `packages/cli/test/speechCache.test.ts`.
