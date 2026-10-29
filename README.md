# reebeat

**Declarative multimedia: accessible, reproducible, rebuilt as you edit.**

*We take care of building; you focus on creating.*

Declare your scenes and the narrative's structure; reebeat generates the transitions between them and produces video, decks, captions and audio description from the same source. Every result is byte-for-byte reproducible, and an edit rebuilds only what changed.

**For technical readers.** Semantically declared story beats, compiled into multimedia artifacts: statecharts for structure, functional reactive time, and an incremental build graph, written in Effect.

That is the goal. The code does not do all of it yet. This table says what is real, what is being built and what is planned:

| Part of the goal | Status |
| --- | --- |
| One source gives a Video and a Deck | Real today ([spec 0001](docs/specs/0001-release-1-screenplay-to-deck-and-video.md)) |
| Byte-identical builds | Real today, measured on one machine (F6 of spec 0001) |
| Declared scenes, ids and effects with explicit anchors | Real today ([spec 0002](docs/specs/0002-explicit-anchors-and-syntax.md)) |
| Transitions between scenes | Today reveal.js Auto-Animate draws them, matched by Element id. reebeat's own generation is being built (specs 0004 and 0005) |
| Timing as events and behaviours (the FRP part) | Being built ([spec 0004](https://github.com/reebeat/reebeat/pull/17)) |
| An edit rebuilds only what changed | Roadmap ([#9](https://github.com/reebeat/reebeat/issues/9)); today only speech is cached |
| Captions with sound descriptions, audio description, reduced motion | Roadmap ([#12](https://github.com/reebeat/reebeat/issues/12)); today subtitles, speaker notes and chapter marks |
| An interactive website as an artifact | Roadmap ([#19](https://github.com/reebeat/reebeat/issues/19)) |

How the qualities are delivered (the model, the plan, the build, and what exists today): [`docs/design/how-it-works.md`](docs/design/how-it-works.md). How reebeat differs from video editors, presentation programs and motion-graphics tools, with sources, and when not to use it: [`docs/design/positioning.md`](docs/design/positioning.md).

Explainer videos from a screenplay. You write one [Fountain](https://fountain.io/syntax) file: what is on screen (Action), what is said (the narrator's dialogue) and when things happen (one `[[effects]]` block per Scene: each sound, `show` and `focus` effect says **when**, at a word, at the slide change or at a moment of an Element's own motion). reebeat turns it into a **Plan** you can review, then into two renderings generated from that one file:

- a **Deck**: a reveal.js presentation with the narration as speaker notes, the `show` and `focus` effects as fragments in the order of their time, and the sounds that go with a step or a slide;
- a **Video**: the same reveal.js page captured frame by frame on a controlled clock, stepped through slides and fragments at the frame each effect resolves to, muxed with narration (Kokoro speech aligned by whisper.cpp), sound effects, WebVTT subtitles and chapter marks.

Status: **release 1** ([spec 0001](docs/specs/0001-release-1-screenplay-to-deck-and-video.md)) and the explicit anchors of [spec 0002](docs/specs/0002-explicit-anchors-and-syntax.md): one original story, [`stories/same-id`](stories/same-id), builds end to end, every falsifier of both specs is checked on the written files, and `check` reports for every effect where it was resolved and where the video and the audio show it (the grammar of the source is in [`docs/grammar/effects.md`](docs/grammar/effects.md)).

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Chromium, ffmpeg and whisper.cpp; Linux). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run reebeat plan  stories/same-id/story.fountain               # the Plan, for review
devenv shell -- bun run reebeat build stories/same-id/story.fountain --out build/same-id   # deck + video
devenv shell -- bun run reebeat check build/same-id --source stories/same-id/story.fountain # the falsifiers
```

Open `build/same-id/deck.html` for the Deck (arrow keys; `s` for speaker notes) and `build/same-id/same-id.mp4` for the Video. The narration is a synthetic voice; the speech is cached in `stories/same-id/speech-cache` so building needs no models. The build prints the adapters it used and what each sends out (`egress: none` for every local one).

The adapters are a choice, not a given: `reebeat.config.json` beside the story or the flags `--speech kokoro|silent`, `--aligner whisper|even`, `--sounds`, `--renderer`, `--capturer`, `--encoder`, `--cache` and `--cache-dir` select them. To run the whole pipeline with no model at all, use the offline stand-ins (Chromium and ffmpeg are still used):

```sh
devenv shell -- bun run reebeat build stories/same-id/story.fountain --speech silent --aligner even --cache-dir /tmp/standin --out build/offline
devenv shell -- bun run reebeat check build/offline --source stories/same-id/story.fountain --cache-dir /tmp/standin
```

The silent narrator makes the narration check (F8) meaningless: it prints `N/A (silent stand-in)`, and only for a build whose manifest lists a stand-in narrator. The sounds of an offline build are real, so the effect check (F1) still observes them.

## Where to read

- [`GLOSSARY.md`](GLOSSARY.md): the vocabulary and the screenplay mapping (Story, Scene, Beat, Keyframe, Line, effect, anchor, Hint, Element, Identity diff, Rendering).
- [`docs/design/keyframe-engine.md`](docs/design/keyframe-engine.md): the design and its dated revisions (R1: Effect in the core; R2: screenplay-first; R3: composable pieces).
- [`docs/specs/`](docs/specs/): one spec per felt journey; [`STATE.md`](STATE.md) says which is active.
- [`docs/design/positioning.md`](docs/design/positioning.md): how reebeat differs from video editors, presentation programs and motion-graphics tools (Resolve, Premiere, Final Cut Pro, PowerPoint, Keynote, Canva, Google Slides, After Effects, Remotion, Motion Canvas, Manim, Rive, Lottie), with sources, and when not to use it.
- [`docs/design/how-it-works.md`](docs/design/how-it-works.md): the technical how behind the what and why: statechart model, functional reactive time, per-artifact plans, an incremental build graph, the role of Effect and XState, prior art, and what is built or planned.
- [`docs/design/4em-regression-baseline.md`](docs/design/4em-regression-baseline.md): facts kept for a later release (a pixel-identical port of an earlier explainer as a regression test).
- [`docs/design/third-party.md`](docs/design/third-party.md) and [`docs/design/open-core-boundary.md`](docs/design/open-core-boundary.md): the licences of everything reebeat depends on, and what is open and closed.
- Packages, in three tiers with one dependency direction (library, then service, then adapter; [design R3](docs/design/keyframe-engine.md)): libraries `core` (screenplay to Plan, schedule), `subtitles` and `lint`; the service package `services` (the seven service interfaces, their contract suites and offline stand-ins); the build program `pipeline`; adapters `speech-kokoro`, `align-whisper`, `sounds-synth`, `render-reveal`, `capture-chromium`, `encode-ffmpeg` and `cache-fs`; and the tools `verify` (the checks) and `cli` (the `reebeat` command, the only place adapters are chosen and composed).
- npm: `core`, `subtitles`, `lint`, `services`, `pipeline`, `sounds-synth` and `render-reveal` are released to npm as pre-releases under the `alpha` tag by the Release workflow (`npm i @reebeat/core@alpha`; `effect` is a peer dependency). How, and why only these: [spec 0009](docs/specs/0009-npm-prereleases.md).

The name `reebeat` is working; the GitHub org `reebeat` and the npm org `reebeat` are reserved.

## Licence

reebeat's compiler and its formats (the IR, the JSON Schema generated from it, the codecs) are licensed under the [Apache License 2.0](LICENSE); the copyright notice is in [`NOTICE`](NOTICE). Products built on top live in separate repositories: [`docs/design/open-core-boundary.md`](docs/design/open-core-boundary.md) says what is open and what is closed. Third-party software, models and the binaries reebeat calls keep their own licences: [`docs/design/third-party.md`](docs/design/third-party.md) lists each one (ffmpeg with libx264 is GPL; reebeat runs it as a separate process and does not bundle it). Code adapted from another repository is in [`PROVENANCE.md`](PROVENANCE.md).

## Contributing

Every change travels spec → code → PR and passes the same gates locally, in CI and in a recorded review round. Read [`AGENTS.md`](AGENTS.md) for the process and the gate table, then run `devenv shell -- bun install` and `devenv shell -- bun run ready`. The process is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md).
