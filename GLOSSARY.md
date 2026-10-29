# Explainers

The explainer pipeline turns a screenplay into narrated, animated explainers. One source file describes what the viewer sees and hears at each moment; decks and videos are rendered from it.

> Provenance: moved here on 2026-10-28 from a private study repository (`work/explainers/GLOSSARY.md`, last changed by
> commit `85a672a14c2927ffaac07d011b6c697e03564144`). Two course-specific example phrases were generalised. This copy is
> the single source.

## Units of description

**Story**:
The largest unit with one concern and one audience, such as "4EM explained" or a conference talk, with its sources. It contains Scenes. Its source is one **Screenplay**.
_Avoid_: Video (a Video is a rendering), project, presentation

**Screenplay**:
The one source file of a Story, written in [Fountain](https://fountain.io/syntax) with the fixed vocabulary of the table "Screenplay mapping" below. Every Rendering is generated from it; nothing generated is kept by hand. Which pieces generate it (the Selection) is not in the Screenplay.
_Avoid_: Script (ambiguous with the narration and with code), storyboard

**Scene**:
One visual context inside a Story, introduced by a scene heading that carries its id between `#` (`INT. THE NEXT SCREEN - DAY #sc4#`), shown as one slide. It is the boundary of identity: Element ids are matched between two consecutive Scenes only when the Transition between them says so (`> AUTO-ANIMATE`); otherwise nothing is matched. A Scene may hold one `[[effects]]` block.
_Avoid_: Slide (the Deck's word for it), section, shot

**Beat**:
The smallest unit of story: one change the viewer should notice. It holds a Keyframe, a Line, Effects and Hints. In a Screenplay a Beat is derived, not written: the opening of a Scene, or the step one `show` or `focus` Effect causes.
_Avoid_: Step, frame, slide, keyframe (the Keyframe is only its visual part)

**Keyframe**:
The visual state a Beat ends in: every visible Element with its properties.
_Avoid_: Snapshot, state (alone), slide

**Line**:
The narration that carries a Beat: the dialogue of the `NARRATOR`, as manuscript text aligned to words. Its **narration text** is the dialogue itself, which holds no `[[...]]` at all; subtitles and speaker notes carry exactly that string.
_Avoid_: Caption, voice-over text, script line

**Effect**:
One line of a Scene's `[[effects]]` block: `<id>: <verb> <argument> at <when>`. The verb is `sound` (plays a sound of the catalogue), `show` (reveals an Element that is `visible=false`) or `focus` (rings and scales an Element). `<when>` is an **Anchor** and an optional offset, or an absolute time with its reason. In the Deck a `show` or `focus` is a fragment step in resolved-time order and a `sound` rides along with the step or the slide it is anchored to; in the Video it is the visible change or the sound at the resolved frame. The Plan keeps what was written (intent) and the Timeline the frame it resolves to.
_Avoid_: Cue (release 1's inline `[[next]]`, `[[focus: id]]`, `[[sfx: name]]`, now errors), trigger, event, note (Fountain's word for the syntax)

**Anchor**:
The named moment an Effect is timed against, never a guess: a word or phrase of the Scene's narration (`word("matches").end`; `, 2` picks the second occurrence), the Scene's start or end (`scene.start`, `scene.end`), the incoming **Transition anchor**, a **Lifecycle event** of an Element (`one.move.50%`), or another Effect's start or end (`r1.end`). An **offset** moves it by a signed time (`+0.1s`, `-3f`) or a share of the anchored window (`+50%`). Every reference is explicit and resolved in the schedule stage from the aligned words and the renderer's declared lifecycle; an absolute time (`at 2.5s because "..."`) is the escape hatch and needs its reason.
_Avoid_: Timestamp, marker, position

**Lifecycle event**:
What happens to an Element in a Scene, from the identity diff and its `show` Effect: `enter` (only in this Scene), `exit` (only in the previous Scene, seen at the transition), `move` (the cell changes) and `update` (the class or text changes). Each has a start, an end and so a percent of the way; `move` and `update` follow the renderer's declared easing, the others are linear in time. An instant (an exit, a sound) has no window, and no percent.
_Avoid_: Animation, tween, keyframe

**Transition anchor**:
The Scene's incoming slide transition as an Anchor: `transition.start` (the frame the slide change is shown), `transition.end` and `transition.<N>%`. A sound that belongs to the slide change (a whoosh) is anchored here, so it follows the motion and not the voice-over.
_Avoid_: Scene start (the same frame, but a Scene has no window; the transition has one)

**Hint**:
An optional instruction that the content alone does not carry: a Parenthetical before a Line (delivery: `(speed N)`, `(slowly)`, `(quickly)`, `(pause N)`) or a Transition between Scenes (`> AUTO-ANIMATE`, `> CUT`).
_Avoid_: Animation, tween (those are derived, not declared)

**Behaviour**:
Continuous motion that belongs to the time between Keyframes, such as a token travelling along a process or a counter rising.
_Avoid_: Loop, animation

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
A Rendering as a presentation the speaker steps through Beat by Beat, with the Lines as speaker notes.
_Avoid_: Slides (as the unit), presentation

## Screenplay mapping

One Fountain file maps onto the vocabulary above. Anything outside this table is an error, never silently dropped.

| Fountain | reebeat | Deck | Video |
|---|---|---|---|
| `Title:`, `Author:`, `Speed:` | Story metadata (`Speed:` is the default speech rate, 0.5 to 2.0, 1.1 when absent) | title | title tag |
| `# Section`, `= synopsis` | Chapter outline | slide group (`data-chapter`) | chapter mark |
| scene heading `#id#` | Scene (identity boundary) | slide | stretch between two slide changes |
| Action `text {id= cell= class= visible=}` | Keyframe: the Elements on screen | slide content | the same page |
| `NARRATOR` dialogue | Line | speaker notes | narration and subtitles |
| Parenthetical | Hint: delivery | none | speech settings |
| `[[effects ... ]]` block of a Scene | Effects | fragment step per `show` and `focus`; `data-sounds` for a sound | the visible change and the sound at the resolved frame |
| `> AUTO-ANIMATE`, `> CUT` | Hint: transition | `data-auto-animate` or none | transition frames |

## Pieces of the pipeline

reebeat is built from pieces that can be replaced one by one (design R3). The Screenplay says what the explainer is; the pieces say how it is made, and the choice of pieces is configuration, never part of the Screenplay.

**Library**:
Pure functions and types with no runtime: the Fountain reader and the Plan (`core`), the subtitle writers (`subtitles`), the lint rules (`lint`). A library imports libraries only.

**Service**:
An Effect interface with a contract that every implementation passes: `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `Renderer`, `FrameCapturer`, `Encoder`, `AssetCache`. A service imports libraries only.
_Avoid_: Plug-in, backend

**Adapter**:
A Layer that fills one service on an outside runtime, such as Kokoro for `SpeechSynthesizer` or ffmpeg for `Encoder`. An adapter imports services and libraries and never another adapter; only the `reebeat` command composes adapters. Release 1 has local adapters only.
_Avoid_: Integration (as a package name; it is the tier's description), driver

**Selection**:
Which adapter fills each service: the keys `speech`, `aligner`, `sounds`, `renderer`, `capturer`, `encoder` and `cache`, in `reebeat.config.json` beside the Screenplay or as flags, local adapters by default. An unknown name fails naming the choices; an adapter whose model, binary or credential is missing fails naming that requirement and nothing takes its place.

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

How third parties add to reebeat (a declarative, incremental FRP language for multimedia artifact generation: authors create, reebeat builds). The decisions are in [`docs/decisions/0000-extension-architecture.md`](docs/decisions/0000-extension-architecture.md); these are the words. In this section **Beat** has the meaning of the state-machine model of [PR #17](https://github.com/reebeat/reebeat/pull/17) (spec 0004): the generated edge from one State to the next, and a Beat between two Scenes is the edge between two compound States. That meaning replaces the "smallest unit of story" entry above once #17 merges.

**Contract**:
The declaration of one extension point as data: its methods with Schema-typed requests and responses, its capability set, its conformance clauses, its version and its stability tag. Contracts are declared in `@reebeat/contracts`; the service tags and the runner that executes the clauses stay in `@reebeat/services`. Docs, JSON Schema and the studio's plugin screen are generated from the contracts.
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
A package (npm, or another language with a `reebeat.plugin.json`) that provides an implementation of one or more contracts. It is installed, enabled explicitly in `reebeat.config.json` with a trust level, and selected; nothing is discovered by scanning.
_Avoid_: Extension, add-on, module

**Run**:
The longest stretch of consecutive Scenes on one engine, with the Beats between them. An engine renders a whole run; the compositor works only at the seams between runs. A run is not a Chapter (a Chapter groups Scenes for the viewer; a run groups them by engine).
_Avoid_: Segment (a rendered segment is a cached piece of a run), batch

**Brief**:
Everything an engine may depend on for one call. The **plan brief** goes to `run/describe` (anchors and effect times unresolved). The **render brief** adds the Beat windows, the effect fire frames and the digest of the sampled values; its SHA-256 is the cache key of a rendered segment.
_Avoid_: Request (alone), job
