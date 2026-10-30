# Explainers

The explainer pipeline turns a screenplay into narrated, animated explainers. One source file describes what the viewer sees and hears at each moment; decks and videos are rendered from it.

> Provenance: moved here on 2026-10-28 from a private study repository (`work/explainers/GLOSSARY.md`, last changed by
> commit `85a672a14c2927ffaac07d011b6c697e03564144`). Two course-specific example phrases were generalised. This copy is
> the single source.
>
> Change 2026-10-29 (spec 0004, explicit state machines): **State**, **Machine**, **Event**, **Mealy and Moore outputs**,
> **IR**, **IR codec**, **Importer**, **Artifact renderer**, **Flick** and **Frame rate** are new; **Beat** is redefined (it
> was "the smallest unit of story that holds a Keyframe, a Line, Effects and Hints"; it is now the transition the engine
> generates between two States); **Scene** is a compound State; **Keyframe**, **Line**, **Effect**, **Anchor**,
> **Lifecycle event**, **Transition anchor**, **Behaviour** and **Library** change. The change is a Revision of the spec.

## Units of description

**Story**:
The largest unit with one concern and one audience, such as "4EM explained" or a conference talk, with its sources. It contains Scenes. Its source is one **Screenplay**.
_Avoid_: Video (a Video is a rendering), project, presentation

**Screenplay**:
The one source file of a Story, written in [Fountain](https://fountain.io/syntax) with the fixed vocabulary of the table "Screenplay mapping" below. Every Rendering is generated from it; nothing generated is kept by hand. Which pieces generate it (the Selection) is not in the Screenplay.
_Avoid_: Script (ambiguous with the narration and with code), storyboard

**State**:
A declared set of Elements with their properties. It holds for a dwell interval: it is entered when the Beat before it ends and left when the Beat after it starts (or at the Scene's last frame). Its **Keyframe** is its visual part. An author declares States (the Elements of a Scene, and the changes an Effect causes); the engine generates the Beats between them. `state(2).enter` and `state(2).leave` are its events.
_Avoid_: Snapshot, frame, slide

**Scene**:
One visual context inside a Story, introduced by a scene heading that carries its id between `#` (`INT. THE NEXT SCREEN - DAY #sc4#`), shown as one slide. It is a **compound State** (a Harel superstate): it groups the States that share one identity scope, and it holds the Lines. It is the boundary of identity: Element ids are matched between two consecutive Scenes only when the Transition between them says so (`> AUTO-ANIMATE`); otherwise nothing is matched. The Beat between two Scenes is an edge between compound States (its events are `scene.start`, `scene.end` and `transition.<point>`). A Scene may hold one `[[effects]]` block.
_Avoid_: Slide (the Deck's word for it), section, shot

**Beat**:
The transition the engine generates from one State to the next: `beat(n).start` is the frame the previous State is left, `beat(n).end` the frame the next State is entered, and `beat(n).<N>%` is N percent of the way. A Beat is derived, never written: within a Scene the engine generates one from each distinct fire frame of a `show` or `focus` Effect after the Scene's first frame, and it lasts as long as the slowest step that fires then. **Between two Scenes** the Beat is the slide change (the `slide` machine, `transition.*`): the edge between two compound States, styled by `> AUTO-ANIMATE` or `> CUT`. (The old meaning, the smallest unit of story that holds a Keyframe, a Line, Effects and Hints, is gone: a Scene holds the Lines.)
_Avoid_: Step (a Deck's fragment step is how a Beat is shown), frame, slide, keyframe

**Keyframe**:
The visual part of a State: every visible Element with its properties.
_Avoid_: Snapshot, state (alone: a State is more than its picture), slide

**Line**:
The narration of a Scene: the dialogue of the `NARRATOR`, as manuscript text aligned to words. Its **narration text** is the dialogue itself, which holds no `[[...]]` at all; subtitles and speaker notes carry exactly that string. Words are a source of Events (`word("matches").end`), not a Machine.
_Avoid_: Caption, voice-over text, script line

**Effect**:
One line of a Scene's `[[effects]]` block: `<id>: <verb> <argument> at <event> [until <event>]`. The verb is `sound` (plays a sound of the catalogue, once for each occurrence of its Event), `show` (reveals an Element that is `visible=false`) or `focus` (rings and scales an Element; the ring lasts to its `until` Event, or to the end of the Scene). `<event>` is an **Event** built from **Anchors** and combinators, or an absolute time with its reason. An Effect subscribes to an Event: it is an output of the Machine its Event comes from (see **Mealy and Moore outputs**), and it has a Machine of its own (`idle`, `active`, `done`), so `r1.start` and `r1.end` are Anchors. The slide change interrupts every running Effect. In the Deck a `show` or `focus` is a fragment step in resolved-time order (a `focus` that ends by its own `until` before the Scene does has a second step that takes the ring off) and a `sound` rides along with the step or the slide it is anchored to; in the Video it is the visible change or the sound at the resolved frame. The Plan keeps what was written (intent) and the Timeline the frame or frames it resolves to, one instance per occurrence.
_Avoid_: Cue (release 1's inline `[[next]]`, `[[focus: id]]`, `[[sfx: name]]`, now errors), trigger, note (Fountain's word for the syntax)

**Anchor**:
The named moment an Effect is timed against, never a guess: a source of Events. It is a word or phrase of the Scene's narration (`word("matches").end`; `, 2` picks the second occurrence), or a point or state event of a declared **Machine**: the Scene's start or end (`scene.start`, `scene.end`), the **Transition anchor** (`transition.start`), a **Lifecycle event** of an Element (`one.move.end`), another Effect's start or end (`r1.end`: a `focus` has an end too), a State (`state(2).enter`) or a Beat (`beat(1).start`). Every spelling is generated from the machines: each Transition gives `<subject>.<transition>.start`, `.end` and `.<N>%`, each state `<subject>.<state>.enter` and `.leave`. `.<N>%` is sugar for the threshold Event of the Behaviour, `when(<subject>.<transition>.progress >= N%)`. An **offset** moves an Event by a signed time (`+0.1s`, `-3f`) or a share of the anchored window (`+50%`). Every reference is explicit and resolved in the schedule stage from the aligned words and the renderer's declared lifecycle; an absolute time (`at 2.5s because "..."`) is the escape hatch and needs its reason.
_Avoid_: Timestamp, marker, position

**Lifecycle event**:
What happens to an Element in a Scene, from the identity diff and its `show` Effect: `enter` (only in this Scene), `exit` (only in the previous Scene, seen at the transition), `move` (the cell changes) and `update` (the class or text changes). They are the Transitions of the Element's three Machines (`presence`, `position`, `style`). Each has a start, an end and so a percent of the way; `move` and `update` follow the renderer's declared easing, the others are linear in time. An instant (an exit, a sound) has no window, and no percent.
_Avoid_: Animation, tween, keyframe

**Transition anchor**:
The Scene's incoming slide transition as an Anchor, the Transition of the `slide` Machine (the Beat between two Scenes): `transition.start` (the frame the slide change is shown), `transition.end` and `transition.<N>%`. A sound that belongs to the slide change (a whoosh) is anchored here, so it follows the motion and not the voice-over.
_Avoid_: Scene start (the same frame, but a Scene has no window; the transition has one)

**Hint**:
An optional instruction that the content alone does not carry: a Parenthetical before a Line (delivery: `(speed N)`, `(slowly)`, `(quickly)`, `(pause N)`) or a Transition between Scenes (`> AUTO-ANIMATE`, `> CUT`).
_Avoid_: Animation, tween (those are derived, not declared)

**Behaviour**:
A function of time from 0 to 1 (Elliott and Hudak's functional reactive animation): the progress of a Transition, linear in time or following the renderer's declared easing. The only thing built from it is the threshold Event `when(one.move.progress >= 50%)`: the first frame at which the Behaviour reaches N percent. Continuous bindings (a volume that follows a speed) are future work.
_Avoid_: Loop, animation, tween

## Machines and time

tsukuri declares the state machines that were implicit in the engine, once, as data (`packages/core/src/machines.ts`); every spelling an author can anchor to is generated from them.

**Machine**:
A declared finite-state machine of one subject: `{ id, subject, initial, states, transitions }`. The machines are `presence` (absent, entering, present, exiting), `position` (still, moving) and `style` (steady, updating) for an Element, `effect` (idle, active, done), `slide` (before, changing, shown) for the Scene's slide change, `dwell` for a State, and `beat` (waiting, changing, done). A **Transition** is a timed edge `{ name, from, during, to, progress }`: it starts when the machine leaves `from`, spends its window in `during` and ends in `to`; with no window it is an instant. Orthogonal Machines (an Element's three regions) run independently.
_Avoid_: Lifecycle (alone), automaton

**Event**:
A finite list of frames, strictly increasing, each with the window of the thing it names. Time is an integer frame at the Plan's frame rate; an Event is built from sources (**Anchors**, words) and the combinators, each a total function from lists of frames to a list of frames, with the meaning SMIL 3.0 timing gives it: `last(a, b)` (when every operand has happened: `endsync="last"`), `first(a, b)` (the earliest: `endsync="first"`), `each(a, b)` (every occurrence: a begin-value list; `throttle=d` drops one closer than `d` to the last kept, `stagger=d` delays so that two are never closer than `d`), `within(e, beat(k))` (the occurrences inside a Beat), `let n = e` (a derived Event, evaluated once and shared), `until e` (the SMIL end value of a `focus`: its first occurrence strictly after the fire frame, else the end of the Scene) and an offset. `when(x.progress >= N%)` is the threshold Event of a **Behaviour**. Instances of one Effect do not restart each other.
_Avoid_: Trigger, signal, timestamp

**Mealy and Moore outputs**:
An Effect anchored to an edge of a Machine (a Beat's `start` or `end`, an Element's `move.end`) is a Mealy output: it happens on a transition. An Effect anchored to a State's `enter` or `leave` is a Moore output: it happens on a state. A State's enter is the end of the Beat before it and its leave the start of the Beat after it.

**Story IR** (also **IR**):
The canonical state and beat graph of a Story: what the Screenplay declared, as a closed, versioned Effect Schema (`GraphSchema`; an excess key is a decode error, the `version` changes with the shape) with JSON as its canonical encoding. It is the source: authored, decoded, edited. The Plan is a function of it. Time in the story IR is exact (**Flicks**); a frame appears only in the Timeline.
_Avoid_: AST (the Fountain reader's tree is not the IR), model

**Timeline IR**:
The compiled, seekable form of a Story: `plan.json` after `schedule` (the Plan, then the Timeline with narration placed and every effect resolved to frames), a list of operation values a renderer follows. It is derived from the story IR and the narration, so it is an artifact: never edited, never decoded back into the story IR. The three clocks meet here: logical order from the machines, media time in flicks, frame time at the Plan's rate.
_Avoid_: the IR (alone: it means the story IR)

**IR codec**:
A reversible format of the IR: it has `encode` and `decode` and the law `decode(encode(ir)) = ir` holds. JSON is the canonical codec; SCXML, XState and the like are codecs too when they carry the whole IR. A migration between two versions of the IR is a codec.

**Importer**:
A one-way reader of a foreign format into the IR (the Fountain reader is `fountainImporter`). It may lose what the format cannot say, and what it reads is reviewed (`tsukuri plan`). It has no `encode`.
_Avoid_: Parser (alone), converter

**Artifact renderer**:
The IR out to an artifact, never read back: the Video, the Deck, the WebVTT subtitles. It has no `decode`, so nothing that is an artifact can be mistaken for a codec.

**Flick**:
The unit of exact time in the IR: 1/705,600,000 of a second (Facebook's flicks), a whole number. It divides evenly into one frame of 24, 25, 30, 48, 50, 60 and 120 fps, so `+0.1s` is 70,560,000 flicks and is the same time at every frame rate. Never a millisecond or a frame.

**Frame rate**:
A render setting, not a property of the story: `settings.fps` (24, 30, 50 or 60; 30 by default; 25 is refused until spec 0005 rounds a time to a frame once, at the end) with `settings.ntsc` for the 1000/1001 fraction. A frame exists only in the Timeline: `frame = floor(t x rate + 1/2)`, the nearest frame, a half going to the later one.

## Identity and motion

**Element**:
A visible thing with a stable id within a Scene: a shape, link, label or icon, written `text {id=one cell=mc class=box}` (every property named; `visible=false` starts it hidden until a `show` Effect reveals it). The same id in two Keyframes means the same thing.
_Avoid_: Node (graph term), object, layer

**Identity diff**:
The comparison of two Keyframes by Element id that derives the motion: an id only in the second Keyframe enters, an id only in the first exits, an id in both updates. In a Screenplay it runs between two consecutive Scenes joined by `> AUTO-ANIMATE`; in release 1 the Deck and the Video both use reveal.js Auto-Animate (`data-id` matching) as the animator, and the Plan lists the same enter, exit and update decisions for review.
_Avoid_: Magic move

## Renderings

**Rendering**:
An output derived from a Story; it is never edited by hand.
_Avoid_: Export, build (alone)

**Video**:
A Rendering as a narrated MP4 with subtitles and chapters.

**Deck**:
A Rendering as a presentation the speaker steps through fragment by fragment (one for each Beat a `show` or `focus` causes), with the Lines as speaker notes.
_Avoid_: Slides (as the unit), presentation

## Screenplay mapping

One Fountain file maps onto the vocabulary above. Anything outside this table is an error, never silently dropped.

| Fountain | tsukuri | Deck | Video |
|---|---|---|---|
| `Title:`, `Author:`, `Speed:` | Story metadata (`Speed:` is the default speech rate, 0.5 to 2.0, 1.1 when absent) | title | title tag |
| `# Section`, `= synopsis` | Chapter outline | slide group (`data-chapter`) | chapter mark |
| scene heading `#id#` | Scene (compound State; identity boundary) | slide | stretch between two slide changes |
| Action `text {id= cell= class= visible=}` | the Elements of a State; their Keyframe | slide content | the same page |
| `NARRATOR` dialogue | Line | speaker notes | narration and subtitles |
| Parenthetical | Hint: delivery | none | speech settings |
| `[[effects ... ]]` block of a Scene (`let` lines, effects with `at` and `until`) | derived Events and Effects | fragment step per `show` and `focus`, and one per `focus` that ends by its own `until`; `data-sounds` for a sound | the visible change and the sound at the resolved frame |
| `> AUTO-ANIMATE`, `> CUT` | Hint: transition | `data-auto-animate` or none | transition frames |

## Pieces of the pipeline

tsukuri is built from pieces that can be replaced one by one (design R3). The Screenplay says what the explainer is; the pieces say how it is made, and the choice of pieces is configuration, never part of the Screenplay.

**Library**:
Pure functions and types with no runtime: the Fountain importer, the IR and the Plan (`core`), the subtitle writers (`subtitles`), the lint rules (`lint`). A library imports libraries only.

**Service**:
An Effect interface with a contract that every implementation passes: `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `Renderer`, `FrameCapturer`, `Encoder`, `AssetCache`. A service imports libraries only.
_Avoid_: Plug-in, backend

**Adapter**:
A Layer that fills one service on an outside runtime, such as Kokoro for `SpeechSynthesizer` or ffmpeg for `Encoder`. An adapter imports services and libraries and never another adapter; only the `tsukuri` command composes adapters. Release 1 has local adapters only.
_Avoid_: Integration (as a package name; it is the tier's description), driver

**Selection**:
Which adapter fills each service: the keys `speech`, `aligner`, `sounds`, `renderer`, `capturer`, `encoder` and `cache`, in `tsukuri.config.json` beside the Screenplay or as flags, local adapters by default. An unknown name fails naming the choices; an adapter whose model, binary or credential is missing fails naming that requirement and nothing takes its place.

**Stand-in**:
An offline adapter for tests and for running the whole pipeline with no model (`silent` narrator, `even` aligner, tone sounds, in-memory cache). Its id ends `-standin`. A build made with a stand-in narrator has silent narration (its sounds are audible), so the check that finds narration onsets (F8) reports `N/A (silent stand-in)` for it, and only for it.
_Avoid_: Mock, fake (a fake is a test double inside one test)

**Egress**:
What an adapter sends out of the machine when it runs, declared in its `info`: nothing (`none`) for every local adapter, the kinds of data (for example the script text) for a hosted one. The build prints each adapter's egress and lists it in `build.json` with the adapter's id and settings and the provenance of every cached asset. Credentials come from the environment only and never appear in a cache key, the Plan, the manifest or the output.

## Groupings (reserved; not modelled until a real case needs them)

**Chapter**:
A named run of consecutive Scenes inside a Story, introduced by a `# Section`; a Video's chapter marks and a Deck's slide groups are rendered from it. Each Chapter is titled with its Section text.

**Sequence**:
An ordered list of Stories rendered as one Video.

**Episode**:
One published Video in a Series.

**Series**:
An ordered set of Episodes on one topic, such as a set of study videos.

**Narrative**:
The argument that runs through a Series and that each Episode advances.

_Avoid_ for any grouping: Epic (overloaded by agile backlogs and by journey mapping), playlist

## Extension points

How third parties add to tsukuri (semantically declared story beats, compiled into multimedia artifacts: statecharts for structure, functional reactive time, and an incremental build graph, written in Effect). The decisions are in [`docs/decisions/0000-extension-architecture.md`](docs/decisions/0000-extension-architecture.md); these are the words.

**Contract**:
The declaration of one extension point as data: its methods with Schema-typed requests and responses, its capability set, its conformance clauses, its version and its stability tag. Contracts are declared in `@tsukuri/contracts`; the service tags and the runner that executes the clauses stay in `@tsukuri/services`. Docs, JSON Schema and the studio's plugin screen are generated from the contracts.
_Avoid_: Interface (alone), API

**Capability**:
One thing an engine or other plugin declares it can do (`access: random`, `boundary.snapshots: layers`, `semantics: tree`). The default of every capability is unsupported, and the compiler checks the story against the declared capabilities at plan time and fails closed.
_Avoid_: Feature flag, option

**Engine**:
A piece that renders the frames of one **run**: consecutive Scenes on the same engine, with the Beats between them. `reveal` today, Manim or Motion Canvas later. The Scene names the engine; the configuration says which package fills it. An engine may run in process or in another language over the wire protocol.
_Avoid_: Renderer (the Renderer service is the reveal engine's internals; a Rendering is an output)

**Compositor**:
The piece that makes a Beat between two runs, that is between two Scenes on different engines, from the boundary frames of both.

**Boundary frame**:
The last frame of a run's range and the first frame of the next run's range, on which a compositor transition works. For an id shared by both sides, an engine may also give a snapshot (bounds, and an alpha layer with a plate) so the compositor can carry the Element across.

**Plugin**:
A package (npm, or another language with a `tsukuri.plugin.json`) that provides an implementation of one or more contracts. It is installed, enabled explicitly in `tsukuri.config.json` with a trust level, and selected; nothing is discovered by scanning.
_Avoid_: Extension, add-on, module

**Run**:
The longest stretch of consecutive Scenes on one engine, with the Beats between them. An engine renders a whole run; the compositor works only at the seams between runs. A run is not a Chapter (a Chapter groups Scenes for the viewer; a run groups them by engine).
_Avoid_: Segment (a rendered segment is a cached piece of a run), batch

**Brief**:
Everything an engine may depend on for one call. The **plan brief** goes to `run/describe` (anchors and effect times unresolved). The **render brief** adds the Beat windows, the effect fire frames and the digest of the sampled values; its SHA-256 is the cache key of a rendered segment.
_Avoid_: Request (alone), job

## Agent lifecycle (planned, spec 0016; nothing below is built)

How an agent runs the multimedia creative lifecycle through tools (create, inspect, revise, deliver, verify, release, publish). The decisions are in [`docs/specs/0016-mcp-interface.md`](docs/specs/0016-mcp-interface.md); these are the words.

**Project**:
A directory in the workspace root that holds one Story: its Screenplay, an optional `tsukuri.config.json` and a speech cache. An agent names it by a plain **project id** (letters, digits and `-`), never by a path.
_Avoid_: Workspace (the directory that holds the Projects), repository

**Project revision**:
The Screenplay and config bytes of a Project at one moment, named by their SHA-256. Revising never edits one: it creates a new revision and moves the Project's head.
_Avoid_: Revision (alone: a spec's `Revisions` section is its dated change log), version (a package's), draft

**Stage**:
How far a project revision has come: `drafted`, `planned`, `built`, `verified`, `candidate`, `released`, `published`. It is derived from facts (a lint result, a build, a **Verification record**, an approval) by one pure function and is never stored, so no tool can set it.
_Avoid_: Status, state (a State is a Story's)

**Job**:
A build or a verification that runs in the background. A tool call starts it and returns a handle at once; the agent polls the handle. One Job runs at a time and a few wait.
_Avoid_: Task (the MCP Tasks extension is a later layer over a Job), Brief

**Verification record**:
What the verifier wrote about one build: the verdicts, the digests of the build and the project revision, the verifier's name and version, the environment (including any stand-in) and its trust level. Only the verifier writes one; no tool accepts a verdict, so an agent cannot certify its own work.
_Avoid_: Report, result

**Project release candidate** and **Project release**:
A candidate is a verified build frozen as an immutable bundle with a manifest (the files and their SHA-256, the adapters and their egress, the policy outcome); its digest names it. It is a project release once a person has approved it.
_Avoid_: Release (alone: the npm release of the tsukuri packages, `release.yml`), publish (sending a project release to a channel is a separate step)

**Approval**:
A person's decision, taken outside the agent's channel, to release or to publish. It binds one action to one digest and one destination, is used once and expires. The agent can ask for one and read its status; it cannot give one.
_Avoid_: Confirmation (a client's prompt before a tool call is advice, not an Approval)

**Publisher**:
The integration that sends a project release to one external channel and returns a receipt. No tool the agent can call has it; the approval handler runs it.
_Avoid_: Exporter, uploader
