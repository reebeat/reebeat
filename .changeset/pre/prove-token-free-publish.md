---
"@tsukuri/core": patch
"@tsukuri/lint": patch
"@tsukuri/pipeline": patch
"@tsukuri/render-reveal": patch
"@tsukuri/services": patch
"@tsukuri/sounds-synth": patch
"@tsukuri/subtitles": patch
---

No package change since 0.1.0-alpha.1: the code, the manifests and the files are the same, only the version differs. This release exists to prove that the workflow publishes through npm trusted publishing (OIDC) without a token, and that the Tag step then points the `alpha` dist-tag at it. The release workflow changes since alpha.1 are repository tooling, not package changes.
