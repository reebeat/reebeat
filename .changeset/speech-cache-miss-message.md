---
"@tsukuri/pipeline": patch
---

`SpeechCacheMiss` says what is missing (the asset, the Line) and that the stage was not asked to refresh it, instead of pointing at a "refresh" that most commands lack; the CLI prints the command that fills the cache (spec 0017).
