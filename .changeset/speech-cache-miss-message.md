---
"@tsukuri/pipeline": patch
---

`SpeechCacheMiss` ends with the command and flag that fill the cache (`tsukuri build <story> --refresh-speech`, with the same selection and `--cache-dir` flags) instead of pointing at a "refresh" that most commands lack (spec 0017).
