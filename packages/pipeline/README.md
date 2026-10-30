# @tsukuri/pipeline

The build program over services only (design R3): `buildProgram` takes a story to a finished build directory and nothing else. It imports `@tsukuri/core`, `@tsukuri/subtitles` and `@tsukuri/services`; it names no model, binary, directory or vendor, and the tier gate (`tools/quality/tiers.ts`) keeps it that way. The composition root (`@tsukuri/cli`) picks the adapters.

```text
story ─hash─▶ Plan ─speechStage─▶ aligned Lines ─schedule(…, Renderer.info.lifecycle)─▶ Timeline ─▶ plan.json
  Renderer.render ─▶ writeRenderedDeck (deck.html, assets)          SoundLibrary ─▶ assets/sfx/<name>.wav (core audioClipToWav)
  FrameCapturer.capture ─▶ muxStage: Encoder.mux { frames, tracks: narration clips (decoded from the cached FLACs) at each Line's start
                                                    + sound clips at each `sound` effect's fire frame, WebVTT, chapters, title, source hash }
  ─▶ <name>.mp4, <name>.vtt ─▶ build.json (schema 2: files, adapters with egress, provenance of every asset used) written last
```

Everything is written into `<out>.partial` and renamed to `<out>` once `build.json` is in; any failure or interrupt removes the partial directory and an earlier build at `<out>` is removed first, so nothing `check` would accept is left (F12). A non-empty `<out>` with no `build.json` is `OutputDirOccupied`. `BuildManifestSchema` (the one definition of `build.json`, read by `@tsukuri/verify`) lives here because the program writes it; a tool may import a program, a program may not import a tool.

| Export | What it is |
| --- | --- |
| `buildProgram(options)` | the build above; effects are resolved against the `lifecycle` the selected Renderer declares (`info.lifecycle`), which `build.json` records on the Renderer's adapter record; needs the seven services, `FileSystem`, `Path` and `Digest`; returns the summary (files, frames, sizes, seconds, the adapters) |
| `muxStage(plan, frames, { name, outDir })` | the narration, sounds, subtitles and chapters of a Plan muxed with a given frame stream: what the verify tests use to re-mux a changed capture |
| `writeRenderedDeck`, `writeSounds` | the Renderer's files and the sounds under one directory (a path that leaves it is refused) |
| `manifestFile`, `BuildManifestSchema`, `writeManifest` | `build.json` |
| `readSource`, `sha256Hex` | the screenplay's bytes and text, and the one SHA-256 |

## The speech stage

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
| `speechStage(plan, { refresh, voice? })` | `Effect<AlignedLine[]>` over `AssetCache`, `SpeechSynthesizer`, `WordAligner`, `Encoder` and `Digest`; one Line at a time, in order. A hit calls no model |
| `SpeechCacheMiss`, `AlignmentBelowThreshold`, `SpeechAssetInvalid` | the stage's own tagged errors; the services' errors (`AdapterUnavailable`, `SynthesisFailed`, `CacheFailed`, ...) pass through unchanged |
| `pipelineVersion`, `defaultVoice` | `speech-v2` (part of every key) and `af_heart` |

## The key and the asset

`key = AssetCache.key({ adapter: synthesizer.info, input: <narration text>, extra: { aligner: aligner.info, pipeline: 'speech-v2', speed, voice } })`: the SHA-256 of the canonical JSON of the synthesiser's id and settings, the text and that extra object. Changing the voice, the speed, the text, or any setting or id of either adapter is another key; bump `pipelineVersion` when the stage changes what it caches and no other key field names it. The encoder is not in the key: its FLAC is lossless s16 and the asset records its id.

An asset is two files, `flac` (FLAC s16 mono, bit-exact) and `words.json` (`{ durationMs, match, words: [{ endMs, startMs, w }] }`, `words[i].w` is `Line.words[i]`), and a provenance. `AlignedLine.audio.file` is `<key>.flac` and `audio.sha256` is the SHA-256 of the FLAC bytes. The aligner hears the *decoded* FLAC, that is what the cache stores. A match below 0.9 fails `AlignmentBelowThreshold` and caches nothing.

## Refill the cache

The committed cache of the story is `stories/same-id/speech-cache/`, written by `@tsukuri/cache-fs` (`<key>.flac`, `<key>.words.json`, `<key>.provenance.json`). Refill it with the build itself: remove the old assets (their keys name the adapters and settings, so a change of either leaves them stale) and build with `--refresh-speech`, for example `rm -r stories/same-id/speech-cache && bun run tsukuri build stories/same-id/story.fountain --refresh-speech --out /tmp/refill`. Needs devenv (`ffmpeg`, `whisper-cli`, Chromium), network for the first Kokoro download, and these files outside the repository:

| Config | Meaning | Default |
| --- | --- | --- |
| `TSUKURI_KOKORO_CACHE` | directory for the Hugging Face model files (311 MiB, downloaded on first use) | none, required |
| `TSUKURI_WHISPER_MODEL` | `ggml-base.en.bin` | none, required |
| `TSUKURI_WHISPER_BIN` | the whisper.cpp binary | `whisper-cli` |

| Model file | SHA-256 |
| --- | --- |
| `ggml-base.en.bin` (whisper.cpp base.en) | `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002` |
| `onnx/model.onnx` of `onnx-community/Kokoro-82M-v1.0-ONNX` (fp32), as downloaded on 2026-10-28 | `8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb` |
| `voices/af_heart.bin` (ships inside the `kokoro-js` 1.2.1 package) | `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b` |

The Kokoro model is fetched by model id without a pinned revision, and the key names the id, not the file hash: if Hugging Face changes the file, old assets keep matching. `bun run test:live` in `packages/cli` regenerates one Line and compares it with the committed asset; run it after a model or tool change.

## Tests

`bun run test` (no model, no browser, no network): the speech stage over the stand-ins (`silentSynthesizer`, `evenAligner`, `memoryCache`) and a tiny fake `Encoder`: a hit, a miss (F12), a refresh, a match below the threshold, an invalid words file, the provenance, key sensitivity and determinism. The build program over the stand-ins, a fake `Renderer`, a fake `FrameCapturer` and a recording fake `Encoder` (`buildProgram.test.ts`): the files of a finished build and `build.json` last, what `Encoder.mux` is asked (narration at each Line's start, each sound at its effect's fire frame, chapters, source hash), manifest v2 (seven adapters with egress, provenance of each asset used), a rebuild from the cache alone writing the same manifest, and F12 (a miss, a failing capture, a refused output directory, a secret-named setting) leaving no output. The committed cache against the committed story, with the real adapters' declarations, is `packages/cli/test/speechCache.test.ts`.
