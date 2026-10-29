# State

Lifecycle: build

Now:

reebeat turns a Fountain screenplay into a reveal.js Deck and a captured Video. Specs 0000 (development lifecycle), 0001 (release 1), 0002 (explicit anchors and syntax) and 0003 (Effect 4.1.0) are merged. The active spec is [0004](docs/specs/0004-explicit-state-machines-and-timing-combinators.md), explicit state machines and timing combinators, on branch `feat/0004-state-machines` (design [R5](docs/design/keyframe-engine.md)), in review (PR #17). It declares the machines that were implicit (an Element's presence, position and style, an effect, the slide change, a State, a Beat) once, as data in `packages/core/src/machines.ts`, and generates the anchor vocabulary, the grammar document and the schema from them. A Story is read by the Fountain importer (`fountainImporter`, one way) into the IR (`GraphSchema`, a closed, versioned Effect Schema; JSON is its canonical codec) and the Plan is a function of the IR; the Video, the Deck and the subtitles are artifact renderers. Time in the IR is exact (flicks, 1/705,600,000 s); the frame rate is a render setting (`settings.fps`: 24, 30, 50 or 60, 30 by default) and a frame exists only in the Timeline. Effects subscribe to Events built with SMIL 3.0 combinators (`last`, `first`, `each` with `throttle` and `stagger`, `within`, `let`, `until`, the threshold `when(x.progress >= N%)`), `reebeat plan --timing` prints each effect instance and derived event with its resolved frames, and `reebeat check` observes the new sources in the written video and audio. `reebeat lint` also reports a derived event nothing uses and an `until` that is its own fire. Release 1 stays in the composable layout of design R3: `stories/same-id` builds end to end on adapters chosen by `reebeat.config.json` or flags, also offline with stand-in speech (`--speech silent --aligner even`).

Next:

- Review and merge PR #17 (spec 0004, frozen; later changes are dated Revisions); then start 0005 (exact media time with one rounding at the end, story-wide identity, identity relations, typed transitions) on a stacked branch.
- Follow-up to 0001, not part of 0004: remove the `(speed 1.05)` interim on one Line of `stories/same-id` (word timings from the synthesiser, or alignment judged by its path).
- Future work recorded in spec 0004: continuous bindings (a behaviour on the right of a binding), `for <duration>`, `restart` as a declared choice, a Line machine, a statechart interpreter service (XState) behind the pure `occupancies` function.
- Candidates for a later spec (recorded in design R2, not started): reebeat's own motion engine as a renderer plug-in, and the pixel-identical port of the earlier 4EM explainer as its regression test (`docs/design/4em-regression-baseline.md`).

Blocked:

- Nothing blocks 0004. Operator-owned forks are listed in its PR.
