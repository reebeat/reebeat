# tsukuri

Explainer videos from a screenplay. You write one [Fountain](https://fountain.io/syntax) file: what is on screen (Action), what is said (the narrator's dialogue) and when things happen (one `[[effects]]` block per Scene: each sound, `show` and `focus` effect says **when**, as an **event**: at a word, at the slide change, at a moment of an Element's own motion, or a combination such as `last(one.move.end, tag.update.end)`). tsukuri reads it with the Fountain importer into one graph of States and the Beats between them (the IR), turns that into a **Plan** you can review, then into two renderings generated from it:

- a **Deck**: a reveal.js presentation with the narration as speaker notes, the `show` and `focus` effects as fragments in the order of their time, and the sounds that go with a step or a slide;
- a **Video**: the same reveal.js page captured frame by frame on a controlled clock, stepped through slides and fragments at the frame each effect resolves to, muxed with narration (Kokoro speech aligned by whisper.cpp), sound effects, WebVTT subtitles and chapter marks.

Status: **release 1** ([spec 0001](docs/specs/0001-release-1-screenplay-to-deck-and-video.md)), the explicit anchors of [spec 0002](docs/specs/0002-explicit-anchors-and-syntax.md) and the explicit state machines and timing combinators of [spec 0004](docs/specs/0004-explicit-state-machines-and-timing-combinators.md): one original story, [`stories/same-id`](stories/same-id), builds end to end, every falsifier of the specs is checked on the written files, and `check` reports for every effect where it was resolved and where the video and the audio show it. The anchors are generated from declared state machines (the grammar of the source is in [`docs/grammar/effects.md`](docs/grammar/effects.md)); time in the IR is exact (flicks) and the frame rate is a render setting.

## Try it

Needs [devenv](https://devenv.sh) (it provides Bun, Chromium, ffmpeg and whisper.cpp; Linux). From the repository root:

```sh
devenv shell -- bun install
devenv shell -- bun run tsukuri plan  stories/same-id/story.fountain               # the Plan, for review
devenv shell -- bun run tsukuri plan  stories/same-id/story.fountain --timing      # each effect and derived event: intent and resolved frames
devenv shell -- bun run tsukuri build stories/same-id/story.fountain --out build/same-id   # deck + video
devenv shell -- bun run tsukuri check build/same-id --source stories/same-id/story.fountain # the falsifiers
```

Open `build/same-id/deck.html` for the Deck (arrow keys; `s` for speaker notes) and `build/same-id/same-id.mp4` for the Video. The narration is a synthetic voice; the speech is cached in `stories/same-id/speech-cache` so building needs no models. The build prints the adapters it used and what each sends out (`egress: none` for every local one).

The adapters are a choice, not a given: `tsukuri.config.json` beside the story or the flags `--speech kokoro|silent`, `--aligner whisper|even`, `--sounds`, `--renderer`, `--capturer`, `--encoder`, `--cache` and `--cache-dir` select them. To run the whole pipeline with no model at all, use the offline stand-ins (Chromium and ffmpeg are still used):

```sh
devenv shell -- bun run tsukuri build stories/same-id/story.fountain --speech silent --aligner even --cache-dir /tmp/standin --out build/offline
devenv shell -- bun run tsukuri check build/offline --source stories/same-id/story.fountain --cache-dir /tmp/standin
```

The silent narrator makes the narration check (F8) meaningless: it prints `N/A (silent stand-in)`, and only for a build whose manifest lists a stand-in narrator. The sounds of an offline build are real, so the effect check (F1) still observes them.

## For agents

An agent in Claude Code or Codex can read a project through the `tsukuri-mcp` server (spec 0018): list projects, read and lint a Screenplay, get the Plan, read the manifest of a build and look at one frame of its video. It cannot change a file or publish anything. [`packages/mcp/clients/README.md`](packages/mcp/clients/README.md) has the install commands (`claude mcp add`, `codex mcp add`, the plugins).

## Where to read

- [`GLOSSARY.md`](GLOSSARY.md): the vocabulary and the screenplay mapping (Story, Scene, State, Beat, Keyframe, Line, effect, anchor, event, machine, IR, importer, artifact renderer, Hint, Element, Identity diff, Rendering).
- [`docs/design/keyframe-engine.md`](docs/design/keyframe-engine.md): the design and its dated revisions (R1: Effect in the core; R2: screenplay-first; R3: composable pieces; R4: anchors as built; R5: state machines, the IR and exact time).
- [`docs/specs/`](docs/specs/): one spec per felt journey; [`STATE.md`](STATE.md) says which is active.
- [`docs/design/4em-regression-baseline.md`](docs/design/4em-regression-baseline.md): facts kept for a later release (a pixel-identical port of an earlier explainer as a regression test).
- [`docs/design/third-party.md`](docs/design/third-party.md) and [`docs/design/open-core-boundary.md`](docs/design/open-core-boundary.md): the licences of everything tsukuri depends on, and what is open and closed.
- Packages, in three tiers with one dependency direction (library, then service, then adapter; [design R3](docs/design/keyframe-engine.md)): libraries `core` (the machines, the Fountain importer, the IR, the Plan, schedule), `subtitles` and `lint`; the service package `services` (the seven service interfaces, their contract suites and offline stand-ins); the build program `pipeline`; adapters `speech-kokoro`, `align-whisper`, `sounds-synth`, `render-reveal`, `capture-chromium`, `encode-ffmpeg` and `cache-fs`; and the tools `verify` (the checks) and `cli` (the `tsukuri` command, the only place adapters are chosen and composed).
- npm: `core`, `subtitles`, `lint`, `services`, `pipeline`, `sounds-synth` and `render-reveal` are released to npm as pre-releases under the `alpha` tag by the Release workflow (`npm i @tsukuri/core@alpha`; `effect` is a peer dependency). How, and why only these: [spec 0009](docs/specs/0009-npm-prereleases.md).

The name is `tsukuri` (formerly the working name `reebeat`); the GitHub org `tsukuri-labs` and the npm org `tsukuri` belong to the operator.

## Licence

tsukuri's compiler and its formats (the IR, the JSON Schema generated from it, the codecs) are licensed under the [Apache License 2.0](LICENSE); the copyright notice is in [`NOTICE`](NOTICE). Products built on top live in separate repositories: [`docs/design/open-core-boundary.md`](docs/design/open-core-boundary.md) says what is open and what is closed. Third-party software, models and the binaries tsukuri calls keep their own licences: [`docs/design/third-party.md`](docs/design/third-party.md) lists each one (ffmpeg with libx264 is GPL; tsukuri runs it as a separate process and does not bundle it). Code adapted from another repository is in [`PROVENANCE.md`](PROVENANCE.md).

## Contributing

Every change travels spec → code → PR and passes the same gates locally, in CI and in a recorded review round. Read [`AGENTS.md`](AGENTS.md) for the process and the gate table, then run `devenv shell -- bun install` and `devenv shell -- bun run ready`. The process is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md).
