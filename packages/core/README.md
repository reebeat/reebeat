# @reebeat/core

Screenplay in, Plan out. Pure: it depends on `effect` and `fountain-js` only, and reads no file (the CLI reads the
`.fountain` file and passes its text). Specs: [`0001`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md) (the pipeline), [`0002`](../../docs/specs/0002-explicit-anchors-and-syntax.md) (explicit ids, the effects block and anchors) and [`0004`](../../docs/specs/0004-explicit-state-machines-and-timing-combinators.md) (the state machines, the event algebra, the IR, exact time). The syntax is documented in [`docs/grammar/effects.md`](../../docs/grammar/effects.md), which is generated from `src/grammar.ts`, `src/machines.ts` and `src/plan.ts` (`bun tools/quality/genGrammar.ts`); a test fails when it differs and parses every example in it.

```text
source ──fountainImporter (parseFountain, adaptTokens, validateScene)──▶ Graph (the IR)
Graph ──planOf (identity diff, settings)──▶ PlanJson                                              buildPlan = both
PlanJson + AlignedLine[] + RendererLifecycle ──schedule (resolveEffects)──▶ PlanJson with a timeline schedule
PlanJson ──reviewText──▶ the text of `reebeat plan [--timing]`                                    reviewText
```

## The modules

| Module | What it is |
| --- | --- |
| `machines.ts` | The state machines, declared once as data (`presence`, `position`, `style` of an Element; `effect`; `slide`, the Scene; `dwell`, a State; `beat`) and `vocabulary`, every anchor spelling GENERATED from them: each transition gives `.start`, `.end`, `.<N>%` and a progress behaviour, each state `.enter` and `.leave`; three aliases (`transition.<point>`, `scene.start`, `scene.end`) are the only hand-written spellings. Nothing else lists an anchor |
| `anchors.ts` | Reads a dotted path as an `Anchor` through `vocabulary` (`word`, `edge`, `occupancy`) and writes one back (`formatAnchor`); a path that is in no machine is an error with `did you mean` over the generated spellings |
| `expr.ts` | The event expressions (`last`, `first`, `each` with `throttle`/`stagger`, `within`, `when(x.progress >= N%)`, offsets, `let` names): a recursive-descent reader and `formatEvent`, the canonical form (`one.move.50%` is `when(one.move.progress >= 50%)`) |
| `effects.ts` | One line of an `[[effects]]` block: `<id>: <verb> <argument> at <when> [until <event>]` and `let <name> = <event>`, read and written (`parseEffectLine`, `formatEffect`, `parseLetLine`, `formatLet`, `formatTiming`). What is written back is derived from the expression: an effect stores no text of its own |
| `combinators.ts` | The algebra of events: a finite list of occurrences in strictly increasing frames, each with the window of what it came from; `last`, `first`, `each`, `within`, `throttle`, `stagger`, `endsAfter` as total functions. Marble fixtures in `test/combinators.test.ts` |
| `evaluate.ts` | Applies the algebra to an `EventExpr` with the SOURCES left to the caller (`Sources<E>`): `schedule` supplies the frames the Timeline resolves, the verifier the frames it observed in the video and the audio, so one definition of every combinator serves both. Also `anchorsOf`, `refsOf`, `statesOf` |
| `occupancy.ts` | The intervals during which a machine is in each of its states in one Scene, from the transitions that happen and their windows (the slide change leaves every state); `enter` and `leave` are read from them |
| `time.ts` | Exact time: the IR holds a whole number of flicks (1/705,600,000 s), never a float and never a frame; `framesOfFlicks` gives the nearest frame at the Plan's rate (`floor(t x rate + 1/2)`, a half to the later frame, in integers); `lifecycleFrames` gives the renderer's declared lags in frames at the Plan's rate (a lag measured at `measuredFps` is the same time at any rate) |
| `graph.ts` | The IR: `GraphSchema`, an Effect Schema, closed and versioned; `jsonCodec` is its canonical encoding and `graphJsonSchema()` the JSON Schema generated from it. Three kinds of format are kept apart in the types: an `IrCodec` (encode and decode, lossless), an `Importer` (a foreign format into the IR, one way, reviewed; `fountainImporter` is one) and an `ArtifactRenderer` (the IR out to an artifact, never read back) |
| `build.ts` | `fountainImporter`, `planOf` (the Plan is a function of the IR, a hash and a frame rate) and `buildPlan` |
| `resolve.ts`, `schedule.ts` | Every event becomes integer frames; `schedule` adds the Timeline |
| `steps.ts` | The fragment steps and the carrier of every sound instance |
| `review.ts` | The review text of `reebeat plan` |

| Export | What it is |
| --- | --- |
| `buildPlan(source, sourceSha256)` | `Effect<PlanJson, PlanError>`; fails with the first error in document order. The CLI hashes the `.fountain` bytes (Effect's `Digest` service) and passes the hash in; the core copies it into `plan.sourceSha256` and computes nothing |
| `fountainImporter`, `planOf(graph, sourceSha256, rate?)` | The two halves of `buildPlan`: the Fountain text into the IR (every error, in document order), and the IR into the Plan (30 fps unless a `{ fps, ntsc }` preset is given) |
| `collectErrors(source)` | every `PlanError`, in document order (plain function) |
| `schedule(plan, aligned, lifecycle)` | `Effect<PlanJson, ScheduleError>`; adds `timeline`: the Lines, for every Scene its derived events (`events`: the name and the frames of each `let`) and its effects, one `TimedEffect` for each INSTANCE: `instance` (1-based; an `each` makes a `sound` run once for each occurrence), `fireFrame`, `commandFrame`, and for an effect with a window `endFrame`, `endedBy` (`until`, `slide-change` or `window`) and, for a `focus` that ends by its own `until`, `endCommandFrame`. `lifecycle` is the renderer's declared `RendererLifecycle` (plain data, `info.lifecycle` of its adapter) |
| `stepsOf(plan, scene)`, `soundsOf(plan, scene)` | The fragment steps of a Scene (a start for each `show` and `focus`, an END for each `focus` that ends by its own `until`, in resolved-time order) and, for each `sound` instance, the step or slide it plays with (or `alone`). The Deck and `verify` both read them. Also the subpath `@reebeat/core/steps`, which reaches no parser (the Deck never loads the screenplay parser) |
| `machines`, `vocabulary`, `formatAnchor`, `formatEvent`, `evaluator`, `occupancies`, `rateOf`, `framesOfFlicks`, `lifecycleFrames` | The machines and what is generated from them, the canonical writers, the algebra and exact time, for the verifier and the tools |
| `grammarDocument()` | The text of `docs/grammar/effects.md` |
| `reviewText(plan, { timing })` | the review text, deterministic |
| `decodePlan(json)`, `encodePlan(plan)` | `plan.json` text in and out; keys are written in alphabetical order, so equal Plans are byte-equal |
| `...Schema`, types | the Plan contract of the spec; `src/plan.ts` is its authority |
| `wordsOf(text)`, `sceneIdsOfChapter(plan, chapterId)`, `formatTiming(effect)` | What the Plan does not store, derived: a Line's words (its text split on single spaces), the Scenes of a Chapter (from `Scene.chapterId`) and the timing of an effect as it is written |

### One fact, one home

The IR and the Plan store a fact once and derive the rest. A Line has its `text` and no list of words (`wordsOf(text)`: the speech cache keys and the aligner read the same split); a Scene has its `chapterId` and a Chapter lists no Scenes (`sceneIdsOfChapter`); an effect, an `until` and a `let` have their expression and no text of their own (`formatEvent`: the canonical form; a sugar such as `one.move.50%` is read, never kept); the Timeline stores frames and no text. An identifier is `IdSchema`, built from `idPattern` once (the generated JSON Schema carries its `pattern`); a Line id (`sc4.l2`) has a dot, so it is a `LineIdSchema` and not an identifier.

## Notes for story authors

- **Scene ids are written**: `INT. THE NEXT SCREEN - DAY #sc4#` (a letter, then letters, digits, `_` or `-`; unique in the story; `beat`, `scene`, `state`, `transition`, `word`, `each`, `first`, `last`, `when`, `within` and `let` are reserved, since the grammar starts a path or a call with them). A heading without an id is an error that suggests one.
- **Element lines are `key=value`**: `Box one {id=one cell=mc class=box}`; `visible=false` starts it hidden. `id`, `cell` and `class` are required. No sigils, no bare flags; the release-1 form `{#id @cell .class hidden}` is an error that shows its replacement.
- **Dialogue is prose** and holds no `[[...]]`: the narration text is the dialogue itself. `[[next]]`, `[[focus: id]]` and `[[sfx: name]]` are errors that say which effects line replaces them.
- **Effects live in one block per Scene**, before its first dialogue, with no blank line inside:

  ```text
  [[effects
    let settled = last(one.move.end, tag.update.end)
    s1: sound whoosh at transition.start
    s2: sound ding   at when(one.move.progress >= 50%)
    s3: sound pop    at settled +0.1s
    r1: show  note   at word("matches").end +0.1s
    f1: focus hint   at word("slides").start -0.2s until first(word("leaves").start, scene.end)
  ]]
  ```

  An effect is `<id>: <verb> <argument> at <when> [until <event>]`; `<when>` is an event (an anchor, a derived event, or a combinator over events) and an optional offset, or `2.5s because "<reason>"`. A `let` line names an event of the Scene. Every reference (an Element id of the Scene, an effect id, a derived event, a State or Beat that can exist, a phrase the narration has and that is unambiguous unless `, n` is written) is checked at plan time, with its line and a `did you mean`. A cycle (an effect that waits for itself through a `let`, an `until`, a State or a Beat it opens), a `show` or `focus` that can fire more than once, a percent on an instant and an `until` on a `sound` or a `show` are errors.
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

`schedule` resolves every event to integer frames from the aligned words, the Scene's `slideFrame`, the machines and the renderer's declared `RendererLifecycle` (windows, lags, easing; the table is the header of `src/resolve.ts` and the doc comment of `RendererLifecycleSchema` in `src/plan.ts`). A sound that belongs to the slide change is anchored to `transition.start`, so it follows the motion and not the voice-over.

- **Until, and the slide change.** A `focus` rings its Element from its fire frame until its `until` event (the first occurrence strictly after the fire frame) or, with none, to the Scene's last frame. The slide change interrupts every effect still running: `endedBy` says `slide-change`. A later `focus` also takes the ring off an earlier one (the renderer has one ring: a rendering rule, not an event). A `focus` that ends by its own `until` has an end step in `stepsOf` and a command at `endCommandFrame`. A `show` runs its declared fade (`endedBy: window`); a `sound` has no window, so `.end` of one and `until` on one are errors (write `<id>.start`).
- **Instances.** An effect whose `at` event has several occurrences (`each`) runs once for each: one `TimedEffect` per occurrence, in time order. Only a `sound` may (a `show` and a `focus` happen once). Instances do not restart each other.
- **`reebeat plan --timing`** prints, for every effect instance, `s1  sound whoosh  one.move.start  ->  frame 732 (24.40 s)  (rides the slide)` (the time is at the Plan's rate, NTSC included; a sound's last column says where the Deck plays it: `rides the slide`, `rides step r1` or `plays alone`) and `s1#2` for the second instance. The timing is printed in its canonical form only (`formatEvent`: `one.move.50%` is read as, and printed as, `when(one.move.progress >= 50%)`; `+0.1s` is `+100ms`); the sugar the author wrote is read and never kept. A row under a `show` or `focus` says where it ended and what ended it (`ends frame 75 (2.50 s), by until`, `interrupted by the slide change`, `by its window`); every derived event is listed under `Events` with its frames, and the absolute times with their reasons.

An effect that resolves outside its Scene, or whose command frame would come before the slide change, is an `EffectOutsideScene` error that names the effect; a percent on a window the renderer declares an instant is `EmptyWindow`.

## Schedule arithmetic

IR time is exact (flicks); a frame exists only at render time, at the Plan's rate (`settings.fps`, nominal 24, 30, 50 or 60 (25 is refused until spec 0005 rounds once, at the end: at 25 fps an effect can land 1.5 frames from its 60 fps time), and `settings.ntsc` for the 1000/1001 fraction). One rule turns a time into a frame: the nearest frame, a half to the later one, in integers (`time.ts`; 1.5 frames is 2, -1.5 is -1). An `f` offset is output frames at the Plan's rate and must be a whole number (`+1.5f` is an error that suggests `+2f`); `s`, `ms` and `%` may be decimal. The renderer's lags are measured in frames at `RendererLifecycle.measuredFps`; they are the same time at any rate. The formulas are in the header of `src/resolve.ts`; `test/schedule.test.ts`, `test/offsets.test.ts` and `test/combinators.test.ts` work the expected frames out by hand.

## Tests

`bun run test` in this directory. `test/fixtures/boxes.plan.json` and `boxes.review.txt` are golden outputs of
`boxes.fountain`: after a deliberate change, regenerate them from `buildPlan`, `encodePlan` and `reviewText` and read
the diff before committing it. The formatter ignores `test/fixtures`.
