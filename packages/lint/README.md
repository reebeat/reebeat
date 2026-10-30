# @tsukuri/lint

A library (design R3): pure rules that return diagnostics `{ rule, message, line?, sceneId?, index?, severity? }`. An empty
list means the rule holds; `severity` is `error` when absent and `info` for a finding that only lists. It depends on
`@tsukuri/core` (types and `stepsOf`) and `effect` only.

## What `tsukuri lint <story>` prints

`tsukuri lint` is the core's `collectErrors` (every problem of the screenplay, in document order: the syntax and every
cross-reference of a Scene's effects, each with its line, what was found, what was expected and the nearest valid form),
then `lintPlan` (this package: the absolute times, listed with their reasons). The cross-references (an Element that exists,
a `show` of a hidden Element, every hidden Element shown once, unique ids) are **one rule in one place**, the core's
`validate.ts`; this package holds no copy of them.

**Scope.** A scheduling error needs the speech timing: an effect that lands outside its Scene (`+30s` after a word, `-2s`
before the first word) is found when the Plan is scheduled. `lint` schedules the Plan only when the speech cache of the story
exists under the selected adapters (`--cache-dir` and the selection flags); then it reports `EffectOutsideScene`,
`EmptyWindow`, `UnresolvedAnchor` and the others with the effect's line. Without the cache it checks no timing, and says so
in its last line: `tsukuri plan --timing` or `tsukuri build` finds such an error, not `tsukuri lint`.

| Rule | What it checks |
| --- | --- |
| `effectFragmentAgreement(plan, fragments)` | F4 of the Deck: the fragments a Rendering shows (`{ sceneId, effectId, verb, target }`, in order) equal the Plan's `show` and `focus` effects in resolved-time order (`stepsOf`), scene by scene; a `sound` is not a fragment. One diagnostic per differing Scene, at the first difference, with the effect's source line. A Renderer's reader supplies the list (`readDeck` for reveal.js) |
| `absoluteTimesNeedReason(plan)` | Reads `Effect.when.absoluteMs`: an error for an absolute time whose reason is blank (`absolute-times-need-a-reason`), and an `info` row (`absolute-time`) for every absolute time that has one, so a reviewer sees them all |
| `contrast(pairs, minimum)` | The WCAG 2.x contrast ratio of each `{ foreground, background, label }` (`#rrggbb`) is at least `minimum`; `contrastRatio` is the formula |
| `lintPlan(plan)` | `absoluteTimesNeedReason`: every rule that reads only the Plan |

Each rule has a control in `test/rules.test.ts`: a missing, extra, re-verbed and re-targeted fragment, a blank reason, a
colour pair below the minimum. The `tsukuri lint` output, with and without the speech cache, is tested in
`packages/cli/test/lint.test.ts`.
