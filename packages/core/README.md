# @reebeat/core

Screenplay in, Plan out. Pure: it depends on `effect` and `fountain-js` only, and reads no file (the CLI reads the
`.fountain` file and passes its text). Specs: [`0001`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md) (the pipeline) and [`0002`](../../docs/specs/0002-explicit-anchors-and-syntax.md) (explicit ids, the effects block and anchors). The syntax is documented in [`docs/grammar/effects.md`](../../docs/grammar/effects.md), which is generated from `src/grammar.ts` and `src/plan.ts` (`bun tools/quality/genGrammar.ts`); a test fails when it differs and parses every example in it.

```text
source ──parseFountain──▶ tokens ──adaptTokens──▶ Story ──identityDiff, validateScene──▶ PlanJson   buildPlan
PlanJson + AlignedLine[] + RendererLifecycle ──schedule (resolveEffects)──▶ PlanJson with a timeline  schedule
PlanJson ──reviewText──▶ the text of `reebeat plan [--timing]`                                     reviewText
```

| Export | What it is |
| --- | --- |
| `buildPlan(source, sourceSha256)` | `Effect<PlanJson, PlanError>`; fails with the first error in document order. The CLI hashes the `.fountain` bytes (Effect's `Digest` service) and passes the hash in; the core copies it into `plan.sourceSha256` and computes nothing |
| `collectErrors(source)` | every `PlanError`, in document order (plain function) |
| `schedule(plan, aligned, lifecycle)` | `Effect<PlanJson, ScheduleError>`; adds `timeline`: the Lines, and each effect's `fireFrame`, `commandFrame` and `intent` (the effect's `written` text: its `when` exactly as the author wrote it, including an explicit occurrence and the offset unit). `lifecycle` is the renderer's declared `RendererLifecycle` (plain data, `info.lifecycle` of its adapter) |
| `stepsOf(plan, scene)`, `soundsOf(plan, scene)` | The fragment steps of a Scene (`show` and `focus`, in resolved-time order) and, for each `sound`, the step or slide it plays with (or `alone`). The Deck and `verify` both read them. Also the subpath `@reebeat/core/steps`, which reaches no parser (the Deck never loads the screenplay parser) |
| `grammarDocument()` | The text of `docs/grammar/effects.md` |
| `reviewText(plan, { timing })` | the review text, deterministic |
| `decodePlan(json)`, `encodePlan(plan)` | `plan.json` text in and out; keys are written in alphabetical order, so equal Plans are byte-equal |
| `...Schema`, types | the Plan contract of the spec; `src/plan.ts` is its authority |

## Notes for story authors

- **Scene ids are written**: `INT. THE NEXT SCREEN - DAY #sc4#` (a letter, then letters, digits, `_` or `-`; unique in the story; `scene`, `transition` and `word` are reserved). A heading without one is an error that suggests it.
- **Element lines are `key=value`**: `Box one {id=one cell=mc class=box}`; `visible=false` starts it hidden. `id`, `cell` and `class` are required. No sigils, no bare flags; the release-1 form `{#id @cell .class hidden}` is an error that shows its replacement.
- **Dialogue is prose** and holds no `[[...]]`: the narration text is the dialogue itself. `[[next]]`, `[[focus: id]]` and `[[sfx: name]]` are errors that say which effects line replaces them.
- **Effects live in one block per Scene**, before its first dialogue, with no blank line inside:

  ```text
  [[effects
    s1: sound whoosh at one.move.start
    r1: show  note   at word("matches").end +0.1s
    f1: focus hint   at word("slides").start -0.2s
  ]]
  ```

  An effect is `<id>: <verb> <argument> at <when>`; `<when>` is an anchor and an optional offset, or `2.5s because "<reason>"`. Every reference (an Element id of the Scene, an effect id, a phrase the narration has and that is unambiguous unless `, n` is written) is checked at plan time, with its line and a `did you mean`.
- A line that Fountain reads as something else is not an Element: an ALL-CAPS first line is a character cue, a line
  starting `#`, `=`, `~`, `>` or `.` is an outline, lyric, transition or heading. Start the line with `!` to force
  Action (`!BOX {id=a cell=mc class=box}`).
- A transition (`> AUTO-ANIMATE`, `> CUT`) applies to the **next** scene heading: it is still positional (Fountain-native, like a
  parenthetical, which applies to the dialogue after it) and names no Scene. It stands alone, between blank lines, right before the
  scene heading it leads into (a `# Section` or `= synopsis` may stand between); anywhere else is a `BadTransition`. A Scene needs
  a Section before it and at least one `NARRATOR` Line. `docs/grammar/effects.md` ends with what is not yet explicit.
- `= synopsis` lines under a `# Section` become the Chapter's `synopsis` (joined by a space); only `reebeat plan` shows it.
- No title: the Plan title is `Untitled`.
- The title page has three keys: `Title:`, `Author:` and `Speed:` (anything else is an error with its line).
- A Scene with an error on an Element or effect line is not cross-checked, so the one mistake is the one error.

## Speech rate

- `Speed: <number>` on the title page is the story's default speech rate, a multiple of the voice's natural speed from
  0.5 to 2.0. **Absent, it is 1.1.** It is written to `settings.speed` in `plan.json`.
- `(speed <number>)` before a Line sets that Line's rate absolutely (same range). `(slowly)` and `(quickly)` are
  presets relative to the story default (x 0.9 and x 1.1, rounded to four decimals, clamped to 0.5 to 2.0). `(pause N)`
  is unchanged. A Line takes one speed hint and one pause.
- The resolved rate of every Line is `Line.hints.speed` in `plan.json`; `reebeat plan` prints it only for a Line that
  differs from the default. The rate is part of the speech cache key, so changing it re-synthesises a Line and never
  reuses audio made at another rate.
- Errors name their line: `BadSpeed` (a `Speed:` or `(speed N)` that is not a number from 0.5 to 2, or a second
  `Speed:`), `BadParenthetical` (two speed hints before one Line, or `(speed)` without a value).

## When an effect fires

`schedule` resolves every anchor to an integer frame from the aligned words, the Scene's `slideFrame` and the renderer's declared `RendererLifecycle` (windows, lags, easing; the table is the header of `src/resolve.ts` and the doc comment of `RendererLifecycleSchema` in `src/plan.ts`). A sound that belongs to the slide change is anchored to `transition.start`, so it follows the motion and not the voice-over. `reebeat plan --timing` prints `s1  sound whoosh  one.move.start  ->  frame 732  (rides the slide)` for each effect (a sound's last column says where the Deck plays it: `rides the slide`, `rides step r1` or `plays alone`) and lists the absolute times with their reasons. `.end` of a `sound` or a `focus` is an `UnsupportedEdge` error (only a `show` has a window): write `<id>.start`.

An effect that resolves outside its Scene, or whose command frame would come before the slide change, is an `EffectOutsideScene` error that names the effect; a percent on a window the renderer declares an instant is `EmptyWindow`.

## Schedule arithmetic

Frames are integers; every duration is turned into frames with `Math.round` (halves up, toward +infinity: 1.5 frames is 2,
-1.5 is -1) before it is added. An `f` offset must be a whole number (`+1.5f` is an error that suggests `+2f`); `s`, `ms` and
`%` may be decimal. The formulas are in the header of `src/schedule.ts`; `test/schedule.test.ts` and `test/offsets.test.ts` work
the expected frames out by hand.

## Tests

`bun run test` in this directory. `test/fixtures/boxes.plan.json` and `boxes.review.txt` are golden outputs of
`boxes.fountain`: after a deliberate change, regenerate them from `buildPlan`, `encodePlan` and `reviewText` and read
the diff before committing it. The formatter ignores `test/fixtures`.
