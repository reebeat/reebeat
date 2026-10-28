# reebeat

Explainer videos from a screenplay. You write one [Fountain](https://fountain.io/syntax) file: what is on screen (Action), what is said (the narrator's dialogue) and when things happen (cues in `[[double brackets]]`). reebeat turns it into a **Plan** you can review, then into two renderings generated from that one file:

- a **Deck**: a reveal.js presentation with the narration as speaker notes and the cues as fragments;
- a **Video**: the same reveal.js page captured frame by frame on a controlled clock, stepped through slides and fragments at the moment the narrator says each cue word, muxed with narration (Kokoro speech aligned by whisper.cpp), sound effects, WebVTT subtitles and chapter marks.

Status: **release 1** ([spec 0001](docs/specs/0001-release-1-screenplay-to-deck-and-video.md)): one original story, [`stories/same-id`](stories/same-id), builds end to end and every falsifier of the spec is checked on the written files.

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Chromium, ffmpeg and whisper.cpp; Linux). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run reebeat plan  stories/same-id/story.fountain               # the Plan, for review
devenv shell -- bun run reebeat build stories/same-id/story.fountain --out build/same-id   # deck + video
devenv shell -- bun run reebeat check build/same-id --source stories/same-id/story.fountain # the falsifiers
```

Open `build/same-id/deck.html` for the Deck (arrow keys; `s` for speaker notes) and `build/same-id/same-id.mp4` for the Video. The narration is a synthetic voice; the speech is cached in `stories/same-id/speech-cache` so building needs no models.

## Where to read

- [`GLOSSARY.md`](GLOSSARY.md): the vocabulary and the screenplay mapping (Story, Scene, Beat, Keyframe, Line, Cue, Hint, Element, Identity diff, Rendering).
- [`docs/design/keyframe-engine.md`](docs/design/keyframe-engine.md): the design and its dated revisions (R1: Effect in the core; R2: screenplay-first).
- [`docs/specs/`](docs/specs/): one spec per felt journey; [`STATE.md`](STATE.md) says which is active.
- [`docs/design/4em-regression-baseline.md`](docs/design/4em-regression-baseline.md): facts kept for a later release (a pixel-identical port of an earlier explainer as a regression test).
- Packages: `packages/core` (screenplay to Plan, schedule), `speech` (Kokoro and whisper.cpp with a content-addressed cache), `deck`, `video` and `sfx`, `verify` (the checks), `cli` (the `reebeat` command).

The name `reebeat` is working; the GitHub org `reebeat` and the npm org `reebeat` are reserved.

## Licence

All rights reserved; licence to be decided. No licence file is present on purpose, so nothing here is licensed for reuse yet. Third-party code keeps its own licences (see `PROVENANCE.md` and the licence files next to copied code).

## Contributing

Every change travels spec → code → PR and passes the same gates locally, in CI and in a recorded review round. Read [`AGENTS.md`](AGENTS.md) for the process and the gate table, then run `devenv shell -- bun install` and `devenv shell -- bun run ready`. The process is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md).
