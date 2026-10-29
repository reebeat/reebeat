# @reebeat/lint

A library (design R3): pure rules that return diagnostics `{ rule, message, line?, sceneId?, index?, severity? }`. An empty
list means the rule holds; `severity` is `error` when absent and `info` for a finding that only lists. It depends on
`@reebeat/core` (types and `stepsOf`) and `effect` only. `reebeat lint <story>` prints the problems of the source (the
core's `collectErrors`) and then `lintPlan`.

| Rule | What it checks |
| --- | --- |
| `effectFragmentAgreement(plan, fragments)` | F4 of the Deck: the fragments a Rendering shows (`{ sceneId, effectId, verb, target }`, in order) equal the Plan's `show` and `focus` effects in resolved-time order (`stepsOf`), scene by scene; a `sound` is not a fragment. One diagnostic per differing Scene, at the first difference, with the effect's source line. A Renderer's reader supplies the list (`readDeck` for reveal.js) |
| `effectAgreement(plan)` | The cross-references of a decoded Plan's effects, whatever produced it: a `show` or `focus` names an Element of its Scene, a `show` names one that is `visible=false`, every `visible=false` Element is shown exactly once, a `sound` has a name and no target (a `show` or `focus` the reverse), effect ids are unique in a Scene |
| `absoluteTimesNeedReason(plan)` | Reads `Effect.when.absoluteMs`: an error for an absolute time whose reason is blank (`absolute-times-need-a-reason`), and an `info` row (`absolute-time`) for every absolute time that has one, so a reviewer sees them all |
| `contrast(pairs, minimum)` | The WCAG 2.x contrast ratio of each `{ foreground, background, label }` (`#rrggbb`) is at least `minimum`; `contrastRatio` is the formula |
| `lintPlan(plan)` | `effectAgreement` and `absoluteTimesNeedReason`: every rule that reads only the Plan |

Each rule has a control in `test/rules.test.ts`: a missing, extra, re-verbed and re-targeted fragment, a show of a visible
Element, a focus on a missing Element, a sound with a target, a repeated effect id, a blank reason, a colour pair below the
minimum.
