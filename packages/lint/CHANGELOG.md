# @tsukuri/lint

## 0.1.0-alpha.1

### Patch Changes

- 82128a5: No package change since 0.1.0-alpha.0: the code, the manifests (homepage https://tsukuri.dev, repository, bugs) and the files are the same, only the version differs. This release exists so that publishing it validates the npm trusted-publisher configuration of each package. The release workflow fixes since alpha.0 are repository tooling, not package changes.
- Updated dependencies [82128a5]
  - @tsukuri/core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 78ef5b3: First pre-release of the compiler packages: a Fountain screenplay to a Plan, a Deck and a Video through the service seams, built for TypeScript 7 and ESM, with `effect` as a peer dependency.
- 53782eb: State machines declared as data (`machines.ts`) generate the anchor vocabulary, the parser, the linter, the grammar document and the IR's JSON Schema. New timing combinators `each` (with `throttle` and `stagger`), `first`, `last`, `within`, `let`, `until` and `when(x.progress >= N%)`; effect instances, end steps for a focus ring, and `plan --timing`. The IR is a closed, versioned graph with exact time in flicks and one structure check for the Fountain importer and the JSON codec. Breaking: `all(...)` is now `last(...)`, `fps` is 24, 30, 50 or 60, and `plan.json` changes shape (instances, `explicit`, `flicks`, `endedBy`; no stored `written`, Line `id`, Line `words` or chapter `sceneIds`).

### Patch Changes

- Updated dependencies [78ef5b3]
- Updated dependencies [53782eb]
  - @tsukuri/core@0.1.0-alpha.0
