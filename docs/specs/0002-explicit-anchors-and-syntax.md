# 0002 Effects anchored to lifecycle events, and an explicit syntax

Status: **built; in review (PR #4)**. The syntax candidates below were the plan; the operator picked B (see the Revisions, first entries), and the as-built entries at the end say what was built and where it differs. Date: 2026-10-28. Decided by: the operator (feedback on release 1, 2026-10-28, items 3 and 4). Builds on [spec 0001](0001-release-1-screenplay-to-deck-and-video.md) and design section 4.4.1 (anchors and offsets).
Verify skill: anchor-word, anchor-scene, anchor-transition, anchor-element, anchor-effect, anchor-absolute, anchor-offset, lint-output, effect-sound, effect-show, effect-focus

## Problem

Release 1 anchors every sound and step to **the end of the word before a `[[note]]`**. Two things are wrong with that:

1. **Timing.** What the viewer sees happens at lifecycle moments (a box starts to move, finishes, is halfway; a scene starts), not at words. Release 1 fixed one visible bug (the whoosh sounded after the box had finished moving) by giving Auto-Animate scenes no lead and by moving the cue to the first word. That is a workaround. A sound or effect must be able to say *"when this transition starts / ends / is 50% through"*, with an offset.
2. **Syntax.** The release-1 grammar has positional magic: `[[next]]` means "the next hidden Element in document order"; a cue means "after the word it follows"; a transition line means "the scene below"; `hidden` and `.class` and `@cell` are bare tokens. People and agents guess wrong at positional rules, and the errors cannot say how to fix what was never written down.

## Goal

- A sound or effect **anchors to a named moment** of the Plan with an optional **relative offset**, never to a guess: a word of a Line by its text, the start or end of a Scene, the start, end or a percentage of an Element's enter, exit, move or update, or the end of another effect.
- **Every reference is explicit**: Elements, Scenes, effects and anchors each have an id written down; nothing is "the next one" or "the one above".
- **One documented grammar with a schema.** The parser and a linter enforce the same schema; the documentation of the grammar is generated from it (so the doc cannot disagree), and every example in the doc is parsed by a test.
- **Errors say how to fix.** Each error names the file and line, what was found, what was expected, and the nearest valid form (`did you mean`).
- Absolute times stay an escape hatch: they need a written reason and the linter lists them (design 4.4.1 rule 4).

## The anchor model (same for every candidate)

```text
anchor   ::= word("<phrase>"[, <n>]).start|end        a word or phrase of a Line of the same Scene; n picks the nth occurrence
           | scene.start | scene.end                  the frame the slide change is shown / the scene's last frame
           | <element>.enter | exit | move | update   a lifecycle of an Element id of this Scene (move = cell change, update = class or text change)
             .start | .end | .<N>%                    the first frame it differs, the frame it settles, or N percent of the way
           | <effect>.start | .end                   another effect's own start or end (chains must be acyclic)
offset   ::= +|- <number> (s | ms | f)               seconds, milliseconds or frames
           | +|- <number> %                           a share of the anchored window (only for anchors with a duration)
absolute ::= at <number>s because "<reason>"          the reason is mandatory; `lint` reports every one
```

Resolution happens in the schedule stage, from the aligned words and the renderer's declared lifecycle timing: the `Renderer` and `FrameCapturer` services declare, for the Auto-Animate they implement, when an Element's move starts and ends relative to the slide change (measured in release 1: the whole frame changes at the command frame, the matched Element starts about 3 frames later and the transition lasts the Plan's `transition` seconds). The Plan lists each effect as `intent → resolved frame`, so a reviewer sees both (design 4.4.1 rule 6).

## Candidates

The same scene in each: Scene `sc4` of `stories/same-id` (box `one` moves from the left to the middle, the tag changes class, a hint enters, box `two` exits). Wanted: a whoosh **when `one` starts to move**; a ding **halfway through** that move; the hint revealed **0.1 s after "matches"**; `hint` focused **0.2 s before "slides"**.

### A. Inline notes with named parts (one file, cues stay next to the words)

```fountain
INT. THE NEXT SCREEN - DAY
[[scene id=sc4]]

Box one                {id=one  cell=mc class=box}
Every box has a name   {id=tag  cell=tc class=accent}
Same name, so it moves {id=hint cell=bc class=muted}
Matched by id          {id=note cell=br class=label visible=false}

NARRATOR
[[sound id=s1 name=whoosh at=one.move.start]] On the next screen, box one sits somewhere else.
Its name matches, so it slides there. [[sound id=s2 name=ding  at=one.move.50%]]
[[show  id=r1 target=note  at=word("matches").end offset=+0.1s]]
[[focus id=f1 target=hint  at=word("slides").start offset=-0.2s]]
```

- Position of a note in the Line is only a reading convenience; **where it is written never changes when it fires** (`at=` always says). Narration text = dialogue with every `[[...]]` removed.
- Properties are `key=value`, all named; a bare `[[next]]` is an error that says `use [[show id=<new id> target=<element id> at=<anchor>]]`.

### B. A declarative effects block per Scene (one file, dialogue stays prose)

```fountain
INT. THE NEXT SCREEN - DAY

Box one                {id=one  cell=mc class=box}
Every box has a name   {id=tag  cell=tc class=accent}
Same name, so it moves {id=hint cell=bc class=muted}
Matched by id          {id=note cell=br class=label visible=false}

[[effects
  s1: sound whoosh  at one.move.start
  s2: sound ding    at one.move.50%
  r1: show  note    at word("matches").end  +0.1s
  f1: focus hint    at word("slides").start -0.2s
]]

NARRATOR
On the next screen, box one sits somewhere else. Its name matches, so it slides there.
```

- Dialogue contains no notes at all (narration text is the dialogue, byte for byte). The whole timing story of a scene is one table, easy to diff, to lint and to generate.
- Line-oriented grammar: `<id>: <verb> <target> at <anchor> [<offset>]`.

### C. Schema-first sidecar (two files; Fountain holds prose and structure only)

`story.fountain` keeps scene headings with explicit scene ids (Fountain scene numbers: `INT. THE NEXT SCREEN - DAY #sc4#`) and plain dialogue. `story.effects.yaml` holds Elements and effects, validated by a published JSON Schema:

```yaml
sc4:
  elements:
    one:  { text: "Box one",               cell: mc, class: box }
    tag:  { text: "Every box has a name",  cell: tc, class: accent }
    hint: { text: "Same name, so it moves", cell: bc, class: muted }
    note: { text: "Matched by id",         cell: br, class: label, visible: false }
  effects:
    - { id: s1, do: sound, name: whoosh, at: { target: one, event: move, edge: start } }
    - { id: s2, do: sound, name: ding,   at: { target: one, event: move, percent: 50 } }
    - { id: r1, do: show,  target: note, at: { word: matches, edge: end }, offset: "+0.1s" }
    - { id: f1, do: focus, target: hint, at: { word: slides, edge: start }, offset: "-0.2s" }
```

- The strongest editor support (schema validation and completion in any editor, for humans and agents). The cost: the source is no longer one Fountain file, and the words and the effects that refer to them live apart.

### Comparison

| | A inline notes | B effects block | C sidecar |
|---|---|---|---|
| One source file (release-1 rule) | yes | yes | **no** (two files) |
| Fountain-valid, existing editors and parsers | yes | yes | yes (Fountain part) |
| Dialogue stays clean prose | no (notes inside) | **yes** | **yes** |
| Timing for a scene in one place | no (scattered) | **yes** | yes |
| Effect next to the words it concerns | **yes** | no | no |
| Schema and completion in editors | partial (needs an extension) | partial | **full** (JSON Schema) |
| Parser work on top of `fountain-js` | note grammar | block grammar | YAML + merge by ids |
| Agents write and repair it | good (one line per effect) | **best** (a table) | good |
| Risk | a long Line with many notes is hard to read | a block inside a note is non-standard Fountain (it is a valid note) | the two files can drift: ids must match, checked by the linter |

**Recommendation (the pick is the operator's):** **B**, with Element properties written as `key=value` as shown. It keeps one Fountain file, keeps dialogue byte-identical to what is spoken and subtitled, puts all timing of a scene in one diffable table, and gives the linter a closed line grammar. A is the closest to release 1; C is the right choice if schema-driven tooling matters more than one file.

## Journey

Whichever candidate is picked: `bun run reebeat plan stories/same-id/story.fountain` prints, per effect, `s1  sound whoosh  one.move.start  →  frame 732` (intent and resolved frame); `reebeat lint` prints every problem with the fix; `reebeat build` and `check` as in release 1; `check` reports, per effect, its observed offset from its anchor **in the video and audio**, not in the plan.

## Falsifiers (with controls)

| # | Falsifier | Negative control |
|---|---|---|
| F1 | Every sound's onset in the mixed track is within ±1 frame of its resolved anchor, and the anchor itself matches the observed event: `move.start` is the first frame the Element's box differs, `move.50%` the frame its box is halfway between start and end, `move.end` the frame it settles, all observed in the mp4 by tracking the Element's pixels | an effect shifted by 3 frames fails; a renderer that declares the wrong lag fails on the observed event |
| F2 | Every effect reference resolves to a declared id and anchor; an unknown id, event, edge, unit or a cycle is an error with line, found, expected and a `did you mean` | one mutation per error class; the message text is a golden |
| F3 | The grammar document is generated from the schema and every example in it parses; the parser and the linter use the same schema | edit the schema: the doc test fails until regenerated |
| F4 | Nothing is positional: the release-1 forms (`[[next]]`, `[[focus: id]]`, `[[sfx: name]]`, `{#id @cell .class hidden}`) are rejected with a message that gives the replacement | the old story fails to parse with the fix hint, line by line |
| F5 | An absolute time without `because` fails; with it, `plan` and `lint` list it | remove the reason |
| F6 | The story `stories/same-id` is rewritten in the picked syntax, builds, and `check` passes F1 to F9 of release 1 and F1 to F5 here | mutate an anchor: the matching falsifier fails |
| F7 | The release-1 workaround is removed: an Auto-Animate scene has the normal lead again and the whoosh still sounds at `one.move.start` | restore the workaround only: not needed |

## Milestones

| M | Work | Green means |
|---|---|---|
| M0 | **Stop for the operator's pick** of A, B or C (or a mix) and the answers below | the pick is recorded as a Revision |
| M1 | The anchor model in `packages/core` (Plan: effects with intent and resolved frame; schedule resolution), the renderer's lifecycle declaration in the `Renderer` and `FrameCapturer` contracts (new clauses), the observation of lifecycle events in `verify` | F1 on a fixture |
| M2 | The parser and the schema for the picked syntax, `reebeat lint`, the generated grammar doc, the error messages | F2 to F5 |
| M3 | Rewrite `stories/same-id`, remove the workaround, update the Deck's fragment mapping (effects without a fragment are not in the Deck's notes: say how Deck steps are derived), docs | F6, F7; `bun run ready` green |

M1 does not depend on the syntax and can start before the pick.

## Non-goals

More effect kinds than `sound`, `show`, `focus` (a later spec adds them against the same grammar); cue chains beyond start and end; a visual editor; changing the Deck's visual theme.

## Open questions for the operator

1. **The pick**: A, B, C, or a mix (for example B for effects and C's schema for the Element lines).
2. **Element properties**: `key=value` for every property (`{id=one cell=mc class=box}`) as in the candidates, or keep `{#one @mc .box}` where it already names everything? (`hidden` becomes `visible=false` either way: no bare flags.)
3. **Deck steps**: in the Deck, each effect that changes what is on screen is a fragment step in time order. Is that the mapping you want, with `sound` effects as steps that only play a sound, or should sounds not be steps?
4. **Absolute times**: allowed with a reason (design 4.4.1) or not at all in this spec?

## Revisions

- **2026-10-28, plan written**, with three candidates and a recommendation, as the operator asked (feedback item 4: "put 2 to 3 concrete syntax candidates in spec 0002 and stop for the operator's pick before building the parser change").
- **2026-10-28, operator's picks (M0 closed).** (1) **Syntax B**: a per-Scene `[[effects ... ]]` block; dialogue stays pure prose. (2) **Element properties are `key=value`**, every property named, no sigils and no bare flags: `{id=one cell=mc class=box visible=false}`. (3) **Deck: sounds ride along**: a sound is not its own fragment step; it plays with the step whose event it is anchored to (a sound anchored to a transition or an Element event plays when that event's step runs; a sound anchored to a word plays with the step of the nearest preceding effect in time, or alone as a plain audio event when there is none, and the Deck says so in the plan output). (4) **Absolute times are allowed with a reason**: `at 12.5s because "<reason>"`, listed by `lint` and by `plan`.
- **2026-10-28, operator's clarification: a whoosh belongs to the slide change.** In release 1 the whoosh sat in the script and so followed the voiceover's timing; word-anchored effects must stay supported, but a sound that belongs to the slide change anchors to **the transition from one slide to the next**. The anchor model therefore gains a first-class, named anchor for the Scene's incoming slide transition: `transition.start`, `transition.end`, `transition.<N>%`, alongside `scene.start`, `scene.end` and the Element lifecycles; the earlier `scene.start` row of the anchor model means the frame the slide change is shown and `transition.start` the same frame (the transition's window runs from it for the Plan's `transition` seconds for Auto-Animate, and for the renderer's declared duration for a fade or `cut`). Release 1 (PR #3) already anchors a sound written before the first word of a Scene's first Line to the transition start (`Cue.anchor = "transition-start"`), measured in the mp4; F7 of this spec ("remove the release-1 workaround") is therefore reduced to removing that shim once `transition.start` is a written anchor.
- **2026-10-29, plan contract for effects (binding for M1 to M3; `packages/core/src/plan.ts` stays the authority).** Release 1's `Cue` and `Line.cues` are **removed**: effects are per Scene. Scenes get **explicit ids** (Fountain scene number: `INT. THE NEXT SCREEN - DAY #sc4#`; required, unique, `[A-Za-z][A-Za-z0-9_-]*`) and Elements get `visible` instead of `hidden`. Chapters and Lines keep derived ids that authors never write (a word is referenced by its text, never by a Line id).
  ```ts
  interface Scene { /* as release 1, plus: */ elements: { id; text; cell; class: string /* one class, key=value */; visible: boolean; line: number }[];
                    effects: Effect[]; lines: Line[] /* no cues */ }
  type Verb = "sound" | "show" | "focus";
  type Edge = "start" | "end";
  type Anchor =
    | { kind: "word"; phrase: string; occurrence: number /* 1-based, default 1 */; edge: Edge }   // a word or phrase of this Scene's narration
    | { kind: "scene"; edge: Edge }                                                                    // scene.start = the slide change frame; scene.end = the Scene's last frame
    | { kind: "transition"; at: Edge | { percent: number } }                                           // the Scene's incoming slide transition: start, end, or N% through its window
    | { kind: "element"; id: string; event: "enter" | "exit" | "move" | "update"; at: Edge | { percent: number } }   // lifecycle of an Element of this Scene
    | { kind: "effect"; id: string; edge: Edge };                                                      // another effect of this Scene
  type Offset = { unit: "ms" | "f"; value: number } | { unit: "percent"; value: number };             // signed; percent = share of the anchored window (only with an anchor that has one)
  interface Effect { id: string; line: number; verb: Verb; name?: string /* sound name */; target?: string /* element id */;
                     when: { anchor: Anchor; offset?: Offset } | { absoluteMs: number; reason: string } }   // absolute: Scene-relative, from the slide change
  // Timeline: scenes[].effects: { effectId; fireFrame; commandFrame; intent: string /* e.g. "one.move.start +0 -> 732" */ }[]
  ```
  The Plan's `effects[*].when` keeps what the author wrote (intent); the Timeline holds the resolved frames. Element lifecycle events come from the identity diff of the Plan (`enter`: only in this Scene; `exit`: only in the previous Scene, seen at the transition; `move`: cell changed; `update`: class or text changed) and, for a hidden Element, from its `show` effect (its `enter`). A **`RendererLifecycle`** (plain data in `core`, supplied by the renderer's adapter `info.lifecycle` and passed to `schedule`) says when each event happens in the transition window: `{ transitionMs: { "auto-animate": number; default: number; cut: number }, matched: { startLagFrames: number }, unmatched: { enterAtTransitionStart: boolean }, showMs: number }`; F1 observes the events in the mp4 so a wrong declaration fails on the observed event. Grammar of the effects block (the schema is the source of the grammar document):
  ```text
  block   ::= "[[effects" NEWLINE { line NEWLINE } "]]"            no blank line inside; one block per Scene, before the first dialogue
  line    ::= id ":" verb args "at" when
  verb    ::= "sound" name | "show" elementId | "focus" elementId
  when    ::= anchor [ offset ] | number "s" "because" quoted        absolute only with a reason
  anchor  ::= "word(" quoted [ "," n ] ")." edge | "scene." edge | "transition." ( edge | n "%" )
            | elementId "." event "." ( edge | n "%" ) | effectId "." edge
  offset  ::= ( "+" | "-" ) number ( "ms" | "f" | "s" | "%" )
  ```
  Rejected with the replacement in the message (F4): `[[next]]`, `[[focus: id]]`, `[[sfx: name]]`, `{#id @cell .class hidden}`, a Scene heading without `#id#`. Sounds ride along in the Deck: `show` and `focus` are fragment steps in resolved-time order; a `sound` is data on the step (`data-sounds`) or on the slide (`data-sounds` on the section) it is anchored to and plays with it.
- **2026-10-29, as built (stacked on release 1 at its final head `6a59875`).** M1 to M3 are built and merged on this branch; `bun run ready` exits 0 (583 s with the journey). **Where the built code differs from, or adds to, the contract above:**
  1. *RendererLifecycle as built.* `matched` gains `easing` (a CSS bezier): `move` and `update` at N% are the frame where the **eased** progress reaches N%, every other percent and every percent offset is time-linear. `unmatched` is `{ enter: { startLagFrames: 8, endLagFrames: 22 } }` (a window), exit is an instant at the slide change `s`; this replaces `enterAtTransitionStart`. Measured for reveal.js 6.0.2 from fresh captures: matched Element starts at `s+2` (release 1 said "about 3"), the Auto-Animate ends at `s+24` declared and `s+25` observed (both inside ±1), a default fade ends at `s+12` (400 ms; CSS nominal 500), a `show` takes 133 ms (4 frames; CSS 200), a `cut` takes 0. `transitionMs["auto-animate"]` must equal `round(settings.transition*1000)` or scheduling fails `LifecycleMismatch`. The Renderer contract gains clause **C6** (positive durations, lags ≥ 0, easing x in [0,1], unmatched window ordered), with a control. The Renderer's record in `build.json` gains an optional `lifecycle` (schema stays 2). The numbers and their provenance are in `packages/render-reveal/README.md`.
  2. *Plan contract deviations.* The identity literal `classes` is `class`; Element `cell` and `class` are required and `visible` defaults to true; effect ids are unique **per Scene** (the key is scene id plus effect id; `scene`, `transition` and `word` are reserved); a `show` has a window `fire .. fire + round(fps*showMs/1000)`, `focus` and `sound` have none; `intent` is the `when` as written. New errors replace `UnknownCue`, `CueTargetMissing` and `NextWithNothingHidden`: `EffectOutsideScene`, `EmptyWindow`, `UnresolvedAnchor`, `LifecycleMismatch`, plus the parser and validation classes (F2); one mistake gives one error (a Scene with an Element or effect error is not cross-checked).
  3. *Deck carriers.* Sounds are `data-sounds` on the slide or on a step. The carrier follows the anchor kind: the slide for `transition`, `scene.start` and non-`show` Element events; the step of the effect for an anchor to a `show`; the nearest preceding step for `word`, absolute and `scene.end`; otherwise the slide alone. `show` and `focus` are the only fragments, in resolved-time order; the parser-free subpath `@reebeat/core/steps` holds that rule once for the Deck and verify. **`> CUT` is one mechanism**: the incoming slide's `data-transition="none"` plus the theme rule that makes the slide it replaces leave at once (release 1, round 2); an earlier `data-cut-after` attribute was removed as a second copy of the same fact.
  4. *F1 observation rules (what "observed" means).* An effect's own change: a `show` or `focus` is the first frame with at least 200 pixels changed by more than 8 gray levels in the target's cell against the picture three frames earlier, the floor being the encoder flicker measured before the event plus 100 pixels. Anchors: a box is followed by the centre of its ink (2 px to start, 0.5 px to count as moving), colours by pixel blend, "settled" means under 1%. Sounds are located jointly by a matched filter with overlapping sounds cancelled (floor 0.5, window 150 ms). A stand-in narrator silences **F8 only** (release 1, round 2); F1 observes the sounds. An effect passes when its own frame is within ±1 frame of its resolved frame, the observed anchor plus its offset is within ±1 frame of it, and a sound's onset is within ±1 frame of both.
  5. *F4 and F7 outcomes.* F4: sounds are not fragments. F7 (this spec): the release-1 `Cue.anchor` shim is gone with the Cue model (a grep finds no `transition-start`, `Cue.anchor`, `cueFragmentAgreement` or `UnknownCue` in code or config); F7 of release 1 also keeps its cut rule (no intermediate frame) and gains a net-rise rule, because a transition played backwards slipped under the 10% slack on small boxes.
  6. *Bugs found while building it.* Effect ids keyed by id alone made sc4's whoosh sound as sc5's ding on the real story (now keyed by scene); overlapping sounds (a whoosh then a ding) defeated release 1's correlation (replaced by the matched filter); the encoder's 288-pixel scanline flicker read as a slide change four frames early on the offline build (the step floor now includes the measured flicker); a step whose command frame precedes its Scene's slide change is commanded with the slide change and appears one frame after its fire frame (inside the tolerance).
  7. *Measured on the real story at this head.* Effects (resolved / observed anchor / own observation): `sc4.s1` whoosh at `transition.start` 698 / 698 / onset 698.01; `sc4.s2` ding at `one.move.50%` 706 / 706.04 / onset 705.99 (the halfway frame by box position is `s+8`; a time-linear 50% would be `s+13`); `sc5.s1` ding at `transition.start` 999 / 999 / 999; `sc4.r1` show at `word("matches").end +100ms` 849 and `sc4.f1` focus at `word("slides").start -200ms` 850 (own observation equal); `sc7.p1` pop at `0.5s because "..."` 1524 (anchor frame 1509, own 1524); every effect within ±1 frame; `reebeat check` 8 of 8; F6 two builds identical (1,664 frames, 1,174,453 bytes). The old story through `reebeat lint` gives 34 errors, each naming its replacement (7 headings without `#id#`, the old Element forms, every inline cue with the effects line that replaces it); the story without `because` fails `AbsoluteNeedsReason`; the committed story lints with 0 errors and 1 absolute time listed. The offline stand-in build runs (1,766 frames, 7 of 8 hold, F8 N/A, F1 observes 11 effects).
  8. *Not done.* `update` and `scene.end` anchors exist in code but no probe observes them (a font-weight change jumps at the slide change, so `update.start` reads as the slide frame); an `unusedElement` lint was not defined; the `BadSceneId` message for a heading without an id shows a fixed example id that is not about that heading (the `did you mean` part is right); release 1's `(speed 1.05)` interim is unchanged (follow-up to release 1).
- **2026-10-29, review round 1 of PR #4: decisions and departures recorded.** (The Status line above was updated from "plan" to "built; in review"; no other text above was changed.)
  1. *Departures from design 4.4.1, now stated (design R4 mirrors this).* (a) `at` is **mandatory**: there are no per-kind default anchors (rule 1), because "no positional magic" outranks saving a few words; a `sound` with no `at` is an error. (b) There is **no `beat` anchor** (start, settle, end of a Beat): release 1's Beat is derived, not written, so the anchors that matter are the Scene, the slide transition, an Element's lifecycle and a word. (c) Offsets are **`ms`, `f`, `s` and `%`**; the design's `fraction` is the same thing as `%` of the anchored window. (d) Absolute times are listed by `lint` and `plan` at severity **info**, not as warnings: the pick of 2026-10-28 says "allowed with a reason, listed by lint", and the reason is mandatory. (e) A **cue chain** (`<effect>.start|end`) resolves to the other effect's fire frame (`start`) or, for a `show`, the end of its window; `.end` on a `sound` or `focus` is rejected (they have no window, see item 5 of the fixes), where the design let the end of a cue mean the end of its sound.
  2. *Transition lines stay positional (operator-owned fork, open).* `> AUTO-ANIMATE` and `> CUT` still apply to the scene heading below them: that is Fountain's own grammar for a transition, and the effects, Elements and scene ids no longer depend on position. The spec's Problem lists "a transition line means the scene below" as positional magic; making it a property of the heading (for example `INT. NEXT - DAY #sc4# transition=auto-animate`) is a small change in `grammar.ts` and the parser, not built. **The operator decides** (PR body, "Open").
  3. *Focus is read one frame early.* A `focus` starts to change on its command frame (`fire - 1`) on a Scene whose Elements are Auto-Animate targets; whether the check reads -1 or 0 depends on whether the first partial frame exceeds the 200-pixel floor (sc2.f1 reads -1). It stays inside the ±1 tolerance and uses all of it; a command frame of `fire` for `focus` would read +1 on a label (release 1 measured a label at lag 1 and a `.box` at lag 0). Known, not changed.
  4. *The sound sits two frames before the move.* A sound anchored to `transition.start` (698) sounds two frames before the matched Element starts to move (700, `s+2`); `one.move.start` resolves to 700. That follows from the operator's clarification (the whoosh belongs to the slide change), not a defect.
- **2026-10-29, review round 1 fixes as built (PR #4).** (1) `.end` of a `sound` or a `focus` is the error `UnsupportedEdge` (`s1.end: a sound has no end; use s1.start`); only a `show` has a window. (2) An `f` offset must be a whole number (`+1.5f` is a `BadEffect` that suggests `+2f`); `s`, `ms` and `%` may be decimal and round half up toward +infinity (-1.5 frames is -1). (3) **Plan contract:** `Effect.written` holds the `when` text after `at` (whitespace collapsed); the Timeline `intent`, the review text and `formatEffect` print it, so an explicit occurrence (`word("box", 1).end`) and the written unit (`+0.1s`, not `+100ms`) survive; `formatWhen` and `formatOffset` are gone. (4) **The F4 replacement hints are applicable as written**: effect ids unique per Scene by verb (`s1`, `s2`, `r1`, `f1`), `word("x", n)` whenever the phrase repeats, `[[next]]` names the k-th hidden Element, a cue that opens a Line anchors to the last word of the Line before (a cue before the first word: `transition.start` for a sound, the first word's start otherwise), `MissingId` keeps the written properties; **tested by mechanically rewriting the release-1 story from its messages alone** (`packages/core/test/release1.test.ts`): 0 errors afterwards, scenes `sc1` to `sc7` get 0, 2, 1, 1, 1, 2, 0 effects; controls: a fixed id `r1` gives `DuplicateId`, no occurrence gives `AmbiguousWord` (line 30). (5) `reebeat plan --timing` prints each sound's Deck carrier (`rides the slide`, `rides step r1`, `plays alone`; the last rides the slide section in the Deck, as the render-reveal README says); `plan` without `--timing` prints none because the carrier needs resolved times. (6) **One grammar, as far as achieved:** the effects-line patterns are built in `grammar.ts` from the closed sets and the unit table; `productions` carry examples; tests parse every example, 86 generated sentences (each verb by anchor kind by offset unit) and reject 322 one-token mutants; `tools/quality/grammarCopies` scans `packages/*/src` for a closed-set member written as a literal outside `grammar.ts`. **Still hand-written**, so the claim "one grammar the parser and linter enforce" is bounded: the typed uses of members in code (`effect.verb === "sound"`, checked by the compiler against `plan.ts`); the tolerant lexical shapes of the patterns (`\S+`, quotes, signs, the parentheses and comma of `word(...)`); error-message example prose; the `productions` rule strings (documentation text, their examples are tested); and the Element line, the scene id `#id#`, parentheticals, transitions and the `[[effects` block framing, which `story.ts` and `elements.ts` read (only their closed property sets come from `grammar.ts`). `@reebeat/lint`'s `effectAgreement` is deleted (core validation is the one rule); `lint` keeps the Deck-versus-Plan agreement and the absolute-time listing. (7) `reebeat lint` takes the selection flags and `--cache-dir` and schedules the Plan when the speech cache exists (so `EffectOutsideScene` shows with its line); otherwise its last line says timing was not checked and that `plan --timing` and `build` find it; it lists absolute times only when the Plan builds. (8) verify's observation reach comes from the declared lifecycle (`Build.lifecycle` from `build.json`'s Renderer record; a missing one is `BuildInvalid`) plus a 10-frame margin, not from literals. (9) Transition lines stay positional (see the decision entry above); the grammar document says so under "What is not yet explicit". (10) Controls (each a mutation turning a named test red): `Math.round` to `floor`; no integer check; the occurrence index `[0]`; the written text mutated; a fixed id; `at` optional in the line pattern; an unknown unit accepted; a literal closed-set copy in `words.ts`; the carrier; lint never scheduling; the reach constant 12; the sound floor 0.5 to 0 (`does not find a sound left out of the mix`); each C6 clause. `bun run ready` on `473da2d`: exit 0, 579 s, journey 8 of 8, F6 identical (1,664 frames, 1,174,453 bytes), stability 195 of 1,664 frames checked, 0 re-captures.
- **2026-10-29, review round 2 of PR #4 (text).** The independent reviewer rewrote the release-1 story from its error messages alone, built it and checked it (8 of 8; every effect it shares with the committed story resolves to the same frame: 372, 466, 633, 698, 999, 1436, 1486), and ran adversarial inputs (no crash, no hang, no error without a line; every plan or lint run took 1.1 to 1.7 s, including a 5,000-character phrase and 2,000 effects in a Scene). **Limits of the grammar-copy scan, stated exactly** (corrects the wording of item 6 of "review round 1 fixes as built"): `tools/quality/grammarCopies` reports a closed-set member written as a literal in a regular expression, in an `a|b` alternation string, and (added after this round) in an array literal, a `Literals([...])` call or a `.join("|")` of two or more members of one closed set outside the site that defines the set; it does not report a single member in a comparison (`effect.verb === "sound"`), which the compiler checks against `plan.ts`. The one live copy the reviewer found (`validate.ts`, a hand-written list of Element events) was replaced by `elementEvents`.
- **2026-10-29, review round 2 fixes as built (supersedes the scan limits stated just above).** `tools/quality/grammarCopies` now also reports an array literal that lists two or more distinct members of one closed set (this covers `["sound","show"]`, `Schema.Literals([...])` and `[...].join("|")`); the live copy in `validate.ts` now uses `elementEvents`. **Single definition site:** the closed sets live in `packages/core/src/plan.ts` (cells, classes, sound names, verbs, edges, events) and `grammar.ts` (keywords, anchor words, the unit table); those two files are the only ones the scan skips, and it reads the `src` of every package. **Reported:** a member spelled in a regular-expression literal or in a `RegExp(...)` built from a string or template; the id rule repeated in a regular expression; a string alternation `a|b` of two or more members of one set; an array literal of two or more distinct members of one set. **Not reported:** a single member as a typed use (`effect.verb === "sound"`, `{ edge: "end" }`, `case "word"`, checked by the compiler against `plan.ts`); an array built from non-literal parts (spreads, variables); members split across several arrays or strings; the cell and class sets (outside the scan's vocabulary); copies in test files (only `src` is scanned); words in comments. Also: `observationRange` (verify) is tested with a declared 2000 ms default fade (`slide + 60 + 10`) and a declared 2000 ms cut (replacing the `transitionMs` term by 0 turns both red); the whole-frame hint rounds the signed value (`-1.5f` gives `-1f`, `+1.5f` gives `+2f`); the story README quotes only effect lines that appear in `story.fountain` (`packages/core/test/storyReadme.test.ts`; the README lists 8 of the story's 11 effects). `bun run ready` on `dd09544`: exit 0, 556 s, journey 8 of 8, F6 identical, stability 195 of 1,664 frames checked, 0 re-captures.
- **2026-10-29, spec 0009: `Verify skill:` line added.** The line under the Status names the rows of `.agents/skills/verify-reebeat/features.md` that observe this spec's behaviour; the grammar document (F3) is gated by a test, not observed in a run. `anchor-scene` and `anchor-effect` are not exercised by `stories/same-id` (the map says how to build a scratch story for them), and `update` and `scene.end` stay unobserved, as item 8 of "as built" says. No change to the journey, scope or a falsifier.
