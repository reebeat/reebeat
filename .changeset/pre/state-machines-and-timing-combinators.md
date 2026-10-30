---
"@tsukuri/core": minor
"@tsukuri/lint": minor
"@tsukuri/pipeline": minor
"@tsukuri/render-reveal": minor
"@tsukuri/services": minor
"@tsukuri/subtitles": minor
---

State machines declared as data (`machines.ts`) generate the anchor vocabulary, the parser, the linter, the grammar document and the IR's JSON Schema. New timing combinators `each` (with `throttle` and `stagger`), `first`, `last`, `within`, `let`, `until` and `when(x.progress >= N%)`; effect instances, end steps for a focus ring, and `plan --timing`. The IR is a closed, versioned graph with exact time in flicks and one structure check for the Fountain importer and the JSON codec. Breaking: `all(...)` is now `last(...)`, `fps` is 24, 30, 50 or 60, and `plan.json` changes shape (instances, `explicit`, `flicks`, `endedBy`; no stored `written`, Line `id`, Line `words` or chapter `sceneIds`).
