# 0002 Effects anchored to lifecycle events, and an explicit syntax

Status: **plan; waiting for the operator's pick of a syntax (section "Candidates")**. Date: 2026-10-28. Decided by: the operator (feedback on release 1, 2026-10-28, items 3 and 4). Builds on [spec 0001](0001-release-1-screenplay-to-deck-and-video.md) and design section 4.4.1 (anchors and offsets).

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
