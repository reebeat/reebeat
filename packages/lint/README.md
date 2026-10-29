# @reebeat/lint

A library (design R3): pure rules that return diagnostics `{ rule, message, line?, sceneId?, index?, severity? }`. An empty
list means the rule holds; `severity` is `error` when absent and `info` for a finding that only lists. It depends on
`@reebeat/core` (types and `stepsOf`) and `effect` only.

## What `reebeat lint <story>` prints

`reebeat lint` is the core's `collectErrors` (every problem of the screenplay, in document order: the syntax and every
cross-reference of a Scene's effects, each with its line, what was found, what was expected and the nearest valid form;
it runs the Fountain importer, `fountainImporter`, and the validation of the IR it reads), then `lintPlan` (this package:
the absolute times, listed with their reasons, and the two event rules below). The cross-references (an Element that
exists, an anchor that names an edge of a declared machine, a `show` of a hidden Element, every hidden Element shown once,
unique ids, cycles) are **one rule in one place**, the core's `validate.ts`; this package holds no copy of them.

**Scope.** A scheduling error needs the speech timing: an effect that lands outside its Scene (`+30s` after a word, `-2s`
before the first word) is found when the Plan is scheduled. `lint` schedules the Plan only when the speech cache of the story
exists under the selected adapters (`--cache-dir` and the selection flags); then it reports `EffectOutsideScene`,
`EmptyWindow`, `UnresolvedAnchor` and the others with the effect's line. Without the cache it checks no timing, and says so
in its last line: `reebeat plan --timing` or `reebeat build` finds such an error, not `reebeat lint`.

| Rule | What it checks |
| --- | --- |
| `effectFragmentAgreement(plan, fragments)` | F4 of the Deck: the fragments a Rendering shows (`{ sceneId, effectId, edge, verb, target }`, in order) equal the Plan's steps in resolved-time order (`stepsOf`), scene by scene: a `start` fragment for each `show` and `focus`, and an `end` fragment (the ring is taken off) for each `focus` that ends by its own `until` before the Scene does (`timed.endCommandFrame !== null`, so only a Plan with a Timeline has them); a `sound` is not a fragment. One diagnostic per differing Scene, at the first difference, with the effect's source line. A Renderer's reader supplies the list (`readDeck` for reveal.js) |
| `absoluteTimesNeedReason(plan)` | Reads `Effect.when.absoluteFlicks` (exact time, 705,600,000 flicks to the second; printed in seconds): an error for an absolute time whose reason is blank (`absolute-times-need-a-reason`), and an `info` row (`absolute-time`) for every absolute time that has one, so a reviewer sees them all |
| `derivedEventsNeverUsed(plan)` | `derived-event-never-used`: an error, at the `let` line, for each derived event that no effect names in its `at` or `until`, directly or through another `let` that some effect names |
| `untilsOfTheirOwnFire(plan)` | `until-is-its-own-fire`: an error, at the effect's line, for an `until` whose event is written the same as the event the effect fires at (compared in the canonical form of `formatEvent`, a `let` name by its name): `until` is the first occurrence strictly after the fire frame, so such an end never comes and the ring lasts to the end of the Scene. An equal event spelled differently (`+0s`) is not recognised |
| `contrast(pairs, minimum)` | The WCAG 2.x contrast ratio of each `{ foreground, background, label }` (`#rrggbb`) is at least `minimum`; `contrastRatio` is the formula |
| `lintPlan(plan)` | `absoluteTimesNeedReason`, `derivedEventsNeverUsed` and `untilsOfTheirOwnFire`: every rule that reads only the Plan |

Each rule has a control in `test/rules.test.ts`: a missing, extra, re-verbed, re-targeted and re-edged fragment (a ring with
no end step, an end step without a ring), a blank reason, an unused `let` (also one only another unused `let` uses), an
`until` equal to its own fire (also through a `let`), a colour pair below the minimum. The `reebeat lint` output, with and
without the speech cache, is tested in
`packages/cli/test/lint.test.ts`.
