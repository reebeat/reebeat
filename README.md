# reebeat

Explainer videos from story beats. A **Story** is declared as Beats; each Beat ends in a full Keyframe with stable Element ids. reebeat derives the motion from the difference between consecutive Keyframes (the identity diff), shows it for review as a **Plan**, schedules it against the narration, and renders a **Video** (a **Deck** later) as a pure function of the frame number.

Status: **spec phase**. No implementation exists yet. Start with:

- [`GLOSSARY.md`](GLOSSARY.md) — the vocabulary (Story, Scene, Beat, Keyframe, Line, Cue, Hint, Element, Identity diff, Rendering).
- [`docs/design/keyframe-engine.md`](docs/design/keyframe-engine.md) — the approved design and its revisions.
- [`docs/specs/`](docs/specs/) — design specs, one per felt journey. [`STATE.md`](STATE.md) says which is active.

The name `reebeat` is working; the GitHub org `reebeat` and the npm org `reebeat` are reserved.

## Licence

All rights reserved; licence to be decided. No licence file is present on purpose, so nothing here is licensed for reuse yet.
