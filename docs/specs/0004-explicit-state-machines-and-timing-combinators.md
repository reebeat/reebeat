# 0004 Explicit state machines and timing combinators

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-29. Decided by: the operator's direction of 2026-10-29: make temporal media declarative and explicit by **declaring the implicit state machines explicitly** (elements, effects, transitions, beat-to-beat state changes), with **SMIL 3.0 timing** for event semantics and **functional reactive animation** (Elliott and Hudak, ICFP 1997) for behaviours versus events.
Process: [spec 0000](0000-development-lifecycle.md). Builds on [spec 0002](0002-explicit-anchors-and-syntax.md) (anchors, effects block, offsets) and is stacked on PR #5 ([spec 0003](0003-effect-4-1-upgrade.md), Effect 4.1.0): the branch is `feat/0004-state-machines`, based on `chore/effect-4.1`.
Sources: SMIL 3.0 Timing and Synchronization (<https://www.w3.org/TR/SMIL3/smil-timing.html>), "Functional Reactive Animation" (<https://dl.acm.org/doi/10.1145/258948.258973>). RxJS marble notation explains the operators below; no RxJS runs anywhere.

## Problem

Spec 0002 made every anchor explicit, but the model under the anchors is still implicit, in four places:

1. **The lifecycle of an Element is in code, not on paper.** `eventKind` in `packages/core/src/events.ts` decides which of `enter`, `exit`, `move`, `update` happens, from the identity diff; `RendererLifecycle` says when. Which states an Element passes through (absent, entering, present, moving, updating, exiting) exists nowhere a reader can see.
2. **The anchor vocabulary is a hand-written list.** `anchorForms`, the `Anchor` union, `validate.ts`, `resolve.ts` and the verifier each list the five kinds again. A new moment needs five edits, and nothing says that `one.move.start` is an edge of a declared machine and `one.glide.start` is not.
3. **An effect has a hidden machine too.** A `focus` rings an Element until another `focus` starts or the slide changes (the `focused` variable of `deck.js`). Nobody can anchor to the end of that ring, or end it earlier. The slide change silently ends it; no document says so.
4. **There is no algebra.** An author cannot say "when both are done", "the earlier of", "at each of these words", "until the narrator says it", "not more often than every 250 ms". `N%` is a spelling, not a concept.

## Goal

- **One source of truth: the machines.** Every thing that has a lifecycle has a declared finite-state machine, written once as data in `packages/core/src/machines.ts`: the Element (three regions: presence, position, style), the effect, the Scene (the slide change) and the Beat. Its **edges** come from the identity diff between Keyframes (Elements), from the effect's own timing (effects) and from the Scene sequence (slide changes). The **anchor vocabulary is generated from the machines**: every transition yields `.start`, `.end` and a progress behaviour; every state yields enter and leave events. An anchor that names no edge of a declared machine is a lint error with `did you mean`. The grammar document, the parser, the linter and the `Anchor` schema derive from the declarations; nothing else lists an event.
- **Combinators with SMIL semantics.** `all`, `first`, `each`, `within`, effect durations (`until`), derived events (`let`), `throttle` and `stagger`, and `beat(n).start|end` as sources. Each is a total function from finite lists of frames to a list of frames, resolved at plan time. Cycles stay a lint error. `reebeat plan --timing` prints, for every effect and every derived event, the intent and the resolved frame or frames.
- **Behaviours versus events, minimal.** An Element's progress through a transition is a **behaviour** (a function of time, 0 to 1). `N%` of 0002 becomes the **threshold event** `when(one.move.progress >= 50%)`.
- **Falsifiers observe the video and the audio**, not the plan: every new kind of anchor and every combinator is observed in the written Video and mix, and a duration effect's end is observed too.

Non-goals: continuous bindings (volume follows speed, a colour follows progress) are **future work**; this spec has behaviours only as the thing a threshold event is taken from. More effect kinds. A visual editor. A new narrator, a new voice, a changed Line: the dialogue of `stories/same-id` is byte-identical, so the speech cache keeps hitting (see F7).

## Journey

```text
devenv shell -- bun run reebeat plan --timing stories/same-id/story.fountain   # intent -> frames, effects and derived events
devenv shell -- bun run reebeat lint stories/same-id/story.fountain             # the vocabulary comes from the machines
devenv shell -- bun run journey                                                  # build, check (F1 observes every new construct), build again (F6)
```

A scene of `stories/same-id` (sc4, abridged) after this spec:

```fountain
[[effects
  let settled = all(one.move.end, tag.update.end)
  s1: sound whoosh at transition.start
  s2: sound ding   at when(one.move.progress >= 50%)
  f1: focus hint   at word("slides").start -0.2s until first(word("leaves").start, scene.end)
  r1: show  note   at word("matches").end +0.1s
  s3: sound pop    at settled +0.1s
]]
```

`plan --timing` prints `s3  sound pop  at settled +0.1s  ->  frame 731` and, under it, `settled  all(one.move.end, tag.update.end)  ->  frame 721`; `check` prints, for `s3`, the frames at which `one`'s box and `tag`'s colour were **seen** to settle in the video, their maximum, and the onset of the pop **heard** in the mix.

## The machines (declared in `packages/core/src/machines.ts`)

A **machine** is `{ id, subject, initial, states, transitions }`. A **transition** `{ name, from, during, to, progress }` is a timed edge: it starts when the machine leaves `from`, spends its window in `during`, and ends when it reaches `to`. `progress` says what the behaviour looks like: `time` (linear in time) or `eased` (the renderer's declared easing). A transition with no window (start equals end) is an **instant**. A machine is a plain value; `vocabulary(machine)` and the checks below are pure functions of it.

| Machine | Subject, how it is written | States (first is initial) | Transitions | Where the edges come from |
| --- | --- | --- | --- | --- |
| `presence` | an Element: `<id>` | `absent`, `entering`, `present`, `exiting` | `enter`: absent, entering, present (`time`); `exit`: present, exiting, absent (`time`) | identity diff: `enter` = only in this Scene, or a `show` effect for a `visible=false` Element; `exit` = only in the previous Scene. An Element that is in both Scenes starts `present` |
| `position` | an Element: `<id>` | `still`, `moving` | `move`: still, moving, still (`eased`) | identity diff: the cell changed |
| `style` | an Element: `<id>` | `steady`, `updating` | `update`: steady, updating, steady (`eased`) | identity diff: the class or the text changed |
| `effect` | an effect: `<id>` | `idle`, `active`, `done` | `run`: idle, active, done (`time`); **its name is not written** | the effect's own timing: it starts at its fire frame and ends at its window end (a `show`: the renderer's declared `showMs`; a `focus`: its `until` or the end of the Scene; a `sound`: no end is known, so `.end` is an error) |
| `slide` | the Scene: `scene` | `before`, `changing`, `shown` | `transition`: before, changing, shown (`time`) | the Scene sequence: a slide change is the transition between two Scenes (the incoming one, from the slide change frame for the renderer's declared window) |
| `beats` | a Beat of the Scene: `beat(<n>)`; the state **is** the subject, its name is not written | `beat` | none | the steps of the Scene: beat 1 opens with the Scene; each distinct fire frame of a `show` or `focus` after the Scene's first frame opens the next beat |

The **Scene and Beat sequence is itself a machine** (`slide` over the story, `beats` inside a Scene): the transitions of `slide` are the slide changes, and `beat(n)` is the n-th state of the Scene's own sequence. An **effect's** machine is `idle` until its fire frame, `active` for its window, `done` after.

### What the declarations generate

For a machine with subject head `H` (`<id>`, `scene`, `beat(<n>)`):

| Source | Spelling | Meaning |
| --- | --- | --- |
| each transition `t` | `H.t.start`, `H.t.end`, `H.t.<N>%` | the first frame of the window, the frame it settles, and the sugar below |
| each transition `t` | `H.t.progress` (only inside `when(... >= N%)`) | the behaviour of the transition, 0 to 1 |
| each state `s` | `H.s.enter`, `H.s.leave` | the first frame the machine is in `s`, and the first frame it leaves it; no event when it never is |

A transition or a state whose name is **elided** in the declaration (`effect`'s `run`, `beats`' `beat`) is written without it: `r1.start`, `beat(2).start`. For `beats` the state events are spelled `start` and `end` (the declaration says so). The `slide` machine declares three **aliases**, the only hand-written spellings: `transition.<point>` is `scene.transition.<point>`, `scene.start` is `scene.before.leave` (the slide change frame) and `scene.end` is `scene.shown.leave` (the last frame of the Scene). `vocabulary(machines)` is the list of every spelling; the parser reads an anchor only through it, the linter reports a path that is not in it (`one.glide.start` names no transition of `presence`, `position` or `style`; nearest `one.move.start`), and `docs/grammar/effects.md` prints it. A test adds a transition to a copy of a machine and sees the vocabulary, the parser and the document follow.

An **occupancy** is a state's interval in the Scene: the initial state from the Scene's first frame to the first transition's start; a transition's `during` state for its window; the `to` state from the window's end to the next transition or the end of the Scene. `enter` is the start of the state's first interval, `leave` the end of the first one that ends before the Scene does.

## The event model

Time is an integer frame at `settings.fps`. An **event** is a finite, strictly increasing list of **occurrences**, each `{ frame, window }` (the window of the anchored thing, `start <= frame <= end`, an instant when equal). A **behaviour** is a function from a frame to 0..1 that a transition declares; the only thing built from it here is the threshold event `when(<transition>.progress >= N%)`: the first frame at which the behaviour reaches N percent (`eased`: by the renderer's declared easing, as in 0002; `time`: linear). The spelling `one.move.50%` of 0002 **stays as sugar**: it is read as `when(one.move.progress >= 50%)` and printed in that canonical form by `plan --timing` next to what was written. (Decision, recorded below: keeping the spelling costs nothing and keeps every story of 0002 valid.)

Each combinator is a total function; marble notation draws frames as columns (`-` is a frame, `|` the end of the Scene, a letter an occurrence). Input events here come from `word("a")`, `word("b")`, `word("c")` at frames 4, 8, 14 (`a` at 4, `b` at 8, `c` at 14).

| Combinator | SMIL / FRP semantics | Definition | Marble |
| --- | --- | --- | --- |
| `all(e1, ..., en)` | `endsync="all"`; `forkJoin`: it happens when every operand has happened | `[max over i of last(ei)]`; empty if any operand is empty | `a-b---c` => `------c` |
| `first(e1, ..., en)` | `endsync="first"`; `race`: the earliest | `[min over i of first(ei)]` over the non-empty operands; empty if all are | `a-b---c` => `a` |
| `each(e1, ..., en)` | a begin-value list; `merge`: every occurrence | the union, sorted, equal frames once | `a-b---c` => `a-b---c` |
| `within(e, beat(k))` | scoping by Beat | the occurrences of `e` inside beat `k`'s interval | `a-b---c` with beat 2 = frames 6 to 12 => `--b` |
| `e +/- d` | an offset on a begin value | every occurrence shifted by `d` (`ms`, `s`, `f`, or `%` of its own window) | `a-b` +2f => `--a-b` |
| `let n = e` | `share`: one evaluation, many subscribers | the same list wherever `n` is used | |
| `each(...,  throttle=d)` | `throttle` (leading): drop an occurrence closer than `d` to the last kept one | keep the first; keep `f` when `f - lastKept >= d` | `a-b---c` throttle=5f => `a----c`... (b is 4 after a: dropped) |
| `each(..., stagger=d)` | delay so that two are never closer than `d` | `f1' = f1`, `fi' = max(fi, f(i-1)' + d)` | `a-b---c` stagger=6f => `a-----b-----c` |
| `until e` on an effect | SMIL end value; `takeUntil` | the end of an instance is the first occurrence of `e` after its start, else the end of the Scene | below |

An `each` is the only combinator whose result may have several occurrences; an effect with several occurrences has **one instance per occurrence** (SMIL's begin-value list), and only a `sound` may (a `show` and a `focus` happen once: `ManyFires`). Instances of one effect do **not** restart each other: this departs from SMIL's default `restart="always"` on purpose (two dings 300 ms apart are two dings; cutting the first would change the audio of every sound).

### Durations and the slide change

An effect with a window is `active` from its fire frame to its end:

- `show`: for the renderer's declared `showMs` (the fade), then it stays shown for the rest of the Scene.
- `focus`: until its `until` event, **or the end of the Scene**. `until` is the SMIL end value: the first occurrence of the event **after** the fire frame (equal or earlier occurrences are ignored); an event that never happens after it leaves the ring on to the end of the Scene.
- `sound`: no window; it plays to its natural end, which the plan does not know, so `until` and `.end` are errors on it. (Decision: a short one-shot is not cut by an event.)

**The slide change interrupts every running effect.** SMIL ends the children of a time container when the container ends; the Scene is that container. An `until` later than the Scene's last frame, or none, ends the effect at the Scene's last frame (`interrupted`, printed by `plan --timing`), and the Deck and the Video drop the ring with the slide as they always did. **A later `focus` also ends the ring** of an earlier one (the renderer has one ring: `focused` in `deck.js`; its machine is now declared, the rule is a rendering rule, not an event). Where a `focus` ends before the Scene does by its own `until`, the Deck gets an **end step** (a fragment that removes the ring) and the Video a command at the end; both are in the Timeline (`endFrame`, `endCommandFrame`) and in `stepsOf`, the one definition the Deck, the capture and the verifier read.

## Grammar

```text
block    ::= "[[effects" NEWLINE { line NEWLINE } "]]"
line     ::= effect | let
let      ::= "let" name "=" event                                   a derived event, local to the Scene
effect   ::= id ":" verb arg "at" when [ "until" end ]
when     ::= event | number "s" "because" quoted                    absolute only with a reason
end      ::= event                                                  the SMIL end value, `focus` only
event    ::= term [ offset ]
term     ::= anchor | name
           | "all(" event { "," event } ")" | "first(" event { "," event } ")"
           | "each(" event { "," event } [ "," "throttle=" duration ] [ "," "stagger=" duration ] ")"
           | "within(" event "," "beat(" n ")" ")"
           | "when(" subject "." transition ".progress" ">=" N "%" ")"
anchor   ::= "word(" quoted [ "," n ] ")" "." edge                   a word of the narration (a source, not a machine)
           | the vocabulary generated from the machines            see "What the declarations generate"
offset   ::= ( "+" | "-" ) number ( "ms" | "s" | "f" | "%" )
duration ::= number ( "ms" | "s" | "f" )
```

`grammar.ts` derives its productions from the machines and `docs/grammar/effects.md` is generated from it (as in 0002, F3); every example of the document is a whole story that the parser reads.

## Plan contract (the authority is `packages/core/src/plan.ts`)

- `Anchor` becomes three kinds, generated from the machines: `word` (as before), `edge` (`{ subject, transition, at }` with `at` a `Point`: `start`, `end`, or `{ percent }`) and `state` (`{ subject, state, event: "enter" | "leave" }`), where `subject` is `{ kind: "element", id }`, `{ kind: "effect", id }`, `{ kind: "scene" }` or `{ kind: "beat", n }`. The five hand-listed kinds of 0002 are gone.
- `EventExpr` is `anchor`, `ref` (a `let` name), `all`, `first`, `each` (with optional `throttle` and `stagger`), `within`, or `shift` (an offset). `Effect.when` is `{ event: EventExpr }` or `{ absoluteMs, reason }`, and an effect may carry `until: { event, written }`. A Scene has `events`: its `let` lines.
- The Timeline's `TimedEffect` is one **instance**: `instance` (1-based), `fireFrame`, `commandFrame`, `intent`, and for an effect with a window `endFrame`, and for a `focus` that ends by its own `until` before the Scene does, `endCommandFrame`. `TimedScene.events` lists each `let` with its frames.

## Falsifiers (with controls)

Each holds on the **written files** (`deck.html`, the mp4, the mix) or, for the marbles, on literal expected frames that no code computed.

| # | Falsifier | Negative control |
| --- | --- | --- |
| F1 | **Every new source is observed.** For each anchor kind the story uses, `reebeat check` finds the event in the pixels or the audio and compares it with the resolved frame within one frame: a `state` event (`one.moving.leave`), a `beat(n)` edge, a threshold, the end of an effect (`f1.end`, the frame the ring leaves), a `let`. The combinators are checked by evaluating the same algebra over the **observed** frames of their operands and comparing with the observed effect | an effect shifted by 3 frames; a renderer lifecycle that declares a lag the picture does not have: the row of the effect fails and names the observed and the resolved frame |
| F2 | **The vocabulary is the machines.** The set of anchor spellings the parser accepts equals `vocabulary(machines)`; an anchor outside it is a `BadEffect` with line, found, expected and `did you mean`; the grammar document is the text its generator writes from the machines | add a transition to a copy of a machine: the vocabulary, the parser and the generated document grow with no other edit; misspell an edge (`one.glide.start`), a state (`one.moving.start`), a subject: the message is a golden |
| F3 | **One marble fixture per combinator** (`all`, `first`, `each`, `within`, offset, `let`, `throttle`, `stagger`, `until`, threshold): input events to expected frames, literal numbers in a table in `packages/core/test/combinators.test.ts` | a mutant of each function (`all` as `first`, `throttle` as `stagger`, `until` taking an equal frame) fails exactly its own row |
| F4 | **The journey exercises them.** `stories/same-id` uses `all`, `first`, `each` with `stagger` and `throttle`, `within`, `let`, `until`, a threshold, a state event and a beat edge; `bun run journey` builds it, `check` passes F1 to F9 of release 1 and F1 to F7 here | replace one `all` by `first` in the story after a build: `check` fails the effect (its observed frame no longer matches its resolved frame of the stale build); a story edit changes `sourceSha256` and F3 of release 1 fails |
| F5 | **A duration's end is seen.** A `focus ... until X`: the ring's last frame in the pixels of its target is within one frame of `endFrame`; a `focus` with no `until`: the ring is gone at the slide change; the Deck has the end step and `stepsOf` agrees with the fragments | `endFrame` shifted by 3: F1 reports the observed and the resolved end; delete the end step from the Deck: the fragment agreement (F4 of the Deck) fails |
| F6 | **Determinism.** Two builds of `stories/same-id` are byte for byte equal (journey F6) | change a lag in the capture: two builds still equal each other but `check` F1 fails (so F6 does not hide a wrong timing) |
| F7 | **The speech cache does not miss.** The Lines of `stories/same-id` are unchanged: the 12 keys of `build.json` equal the 12 `*.provenance.json` keys of the committed cache and the build runs without `--refresh-speech`. The keys that change: **none** | a changed word of a Line is `SpeechCacheMiss` (release 1, F12) |
| F8 | **Cycles and nonsense are lint errors.** An effect that waits for itself through `let`, `all`, `until`, a beat or a state; a `step` timed by a beat it opens; an event that can never happen; a `show` or `focus` that fires more than once; a percent offset on an event with no window; `until` on a `sound` or a `show` | one mutation per error class; the message text is a golden |
| F9 | **`plan --timing` shows the intent and the frames** for every effect (every instance) and every derived event, canonical form beside the sugar, and what ended each duration | a golden of the output for `stories/same-id`; edit a word of the story: the golden differs |
| F10 | **The old spellings still mean what they meant.** Every `.fountain` of the release-1 and 0002 corpora that parsed before parses to the same frames (`one.move.50%`, `scene.end`, `transition.start`, `r1.end`) | change a spelling's meaning in `machines.ts`: the corpus test fails |

## Milestones

| M | Work | Green means |
| --- | --- | --- |
| M1 | `machines.ts`, the vocabulary generator, the event algebra (`events` module with the marbles), the Plan contract | F2 (generation), F3 |
| M2 | The expression parser, the `let` and `until` lines, validation and cycles, `resolve` over the algebra, `plan --timing`, the generated grammar document | F2, F8, F9, F10 |
| M3 | End steps in `stepsOf`, the Deck, the capture, the mix of several instances | F5 (Deck and capture side) |
| M4 | The verifier: leaves observed, the algebra over observed frames, a duration's end observed | F1, F5 |
| M5 | `stories/same-id` rewritten where the new constructs need it; `bun run ready` | F4, F6, F7 |

## Decisions recorded at the start (operator-owned forks are listed in the PR)

1. **`N%` stays as sugar** for `when(... progress >= N%)`; `plan --timing` prints both.
2. **Durations are for `focus` only.** A `show` is permanent and a `sound` plays out; `until` on them is an error that says so. `for <duration>` (an end relative to its own start) is future work: it needs a self-reference rule.
3. **Beats are the steps of a Scene** (glossary: "the step one `show` or `focus` effect causes"); `beat(n)` is scoped to its Scene, and `within(e, beat(n))` is the scoping combinator. A step cannot be timed by a Beat it opens (cycle error); a `sound` can.
4. **`throttle` and `stagger` are options of `each`** (the group is the list of events), not of an effect.
5. **Instances do not restart each other** (a departure from SMIL's default `restart`).
6. **Words are a source, not a machine.** The aligned words are data; a Line machine (`idle`, `speaking`, `done`) is future work together with continuous bindings.

## Future work (recorded, not built)

Continuous bindings (`volume = f(speed)`, a behaviour on the right of a binding); `for <duration>`; `restart` as a declared choice; a Line machine; effects with several targets (`stagger` over a group of Elements); durations for `sound` (loops, fades).

## Revisions

- **2026-10-29, plan written** against 0002 as merged (`a05f49b`) and PR #5's head (`b20c2ba`), before any code.
