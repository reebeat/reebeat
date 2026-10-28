# @reebeat/lint

A library (design R3): pure rules that return diagnostics `{ rule, message, line?, sceneId?, index? }`. An empty list
means the rule holds. It depends on `@reebeat/core` (types) and `effect` only.

| Rule | What it checks |
| --- | --- |
| `cueFragmentAgreement(plan, fragments)` | F4: the fragments a Rendering shows (`{ sceneId, cueId, kind, arg }`, in order) equal the Plan's Cues, scene by scene; one diagnostic per differing Scene, at the first difference, with the Cue's source line. A Renderer's reader supplies the list (`readDeck` for reveal.js) |
| `contrast(pairs, minimum)` | The WCAG 2.x contrast ratio of each `{ foreground, background, label }` (`#rrggbb`) is at least `minimum`; `contrastRatio` is the formula |
| `absoluteTimesNeedReason(plan)` | A documented no-op in release 1: the Plan schema has no `at` field on a Cue, a Line or a Hint, so no absolute time is representable and no valid Plan can break the rule. `test/rules.test.ts` pins that by decoding a Plan with an `at` on every Cue with `onExcessProperty: "error"`, which fails. (The default decoder ignores unknown keys, so a Plan file with an `at` decodes and drops it; the rule is about what the schema can hold.) |

Each rule has a control in `test/rules.test.ts`: a missing, extra, swapped, re-kinded and re-argued fragment, a colour pair
below the minimum.
