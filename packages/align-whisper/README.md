# @tsukuri/align-whisper

`WordAligner` on whisper.cpp 1.9.5-dev with `ggml-base.en.bin` (local). `whisperAligner` is a `Layer`; `info.id` is `whisper.cpp@1.9.5-dev+ggml-base.en`, `info.settings` holds the model, its SHA-256, the resample flags and the whisper arguments. The clip becomes a 16 kHz mono s16 WAV through ffmpeg (`-f s16le -ar <rate> -ac 1 -i ... -ar 16000 -ac 1 -c:a pcm_s16le`), `whisper-cli -m <model> -f <wav> -ml 1 -sow -oj -np -t 4` writes one JSON entry per word, the empty segments are dropped, and `alignWords` of `@tsukuri/core` matches the heard words to the requested words (the Dice ratio is the `match`). The aligner ignores `hint`: it listens.

Configuration: `TSUKURI_WHISPER_MODEL` (required) and `TSUKURI_WHISPER_BIN` (default `whisper-cli`). On the first `align` the binary version and the model SHA-256 are checked against the pinned ones; a missing binary, model or variable, or a different version or model, is `AdapterUnavailable` then, never at layer construction and never a fallback.

`bun run test`: whisper JSON, command lines, the s16 samples, Config and the typed errors of a missing requirement. `bun run test:live` (opt-in; fails when the binary or the model is absent): the `WordAligner` contract and real speech (the committed narration of one Line) aligned to the times its asset records.
