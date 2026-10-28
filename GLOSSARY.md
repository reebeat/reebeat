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
The one source file of a Story, written in [Fountain](https://fountain.io/syntax) with the fixed vocabulary of the table "Screenplay mapping" below. Every Rendering is generated from it; nothing generated is kept by hand.
_Avoid_: Script (ambiguous with the narration and with code), storyboard

**Scene**:
One visual context inside a Story, introduced by a scene heading, shown as one slide. It is the boundary of identity: Element ids are matched between two consecutive Scenes only when the Transition between them says so (`> AUTO-ANIMATE`); otherwise nothing is matched.
_Avoid_: Slide (the Deck's word for it), section, shot

**Beat**:
The smallest unit of story: one change the viewer should notice. It holds a Keyframe, a Line, Cues and Hints. In a Screenplay a Beat is derived, not written: the opening of a Scene, or the step one Cue causes.
_Avoid_: Step, frame, slide, keyframe (the Keyframe is only its visual part)

**Keyframe**:
The visual state a Beat ends in: every visible Element with its properties.
_Avoid_: Snapshot, state (alone), slide

**Line**:
The narration that carries a Beat: the dialogue of the `NARRATOR`, as manuscript text aligned to words. Its **narration text** is the dialogue with its Cues removed; subtitles and speaker notes carry exactly that string.
_Avoid_: Caption, voice-over text, script line

**Cue**:
An inline note `[[...]]` inside a Line, anchored to the spoken word before it and firing at that word's end: `[[next]]` reveals the next hidden Element, `[[focus: id]]` emphasises an Element, `[[sfx: name]]` plays a sound. In the Deck a Cue is a fragment; in the Video it is the step or sound at that moment.
_Avoid_: Trigger, event, note (Fountain's word for the syntax)

**Hint**:
An optional instruction that the content alone does not carry: a Parenthetical before a Line (delivery: `(slowly)`, `(quickly)`, `(pause N)`) or a Transition between Scenes (`> AUTO-ANIMATE`, `> CUT`).
_Avoid_: Animation, tween (those are derived, not declared)

**Behaviour**:
Continuous motion that belongs to the time between Keyframes, such as a token travelling along a process or a counter rising.
_Avoid_: Loop, effect

## Identity and motion

**Element**:
A visible thing with a stable id within a Scene: a shape, link, label or icon. The same id in two Keyframes means the same thing.
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
| `Title:`, `Author:` | Story metadata | title | title tag |
| `# Section`, `= synopsis` | Chapter outline | slide group | chapter mark |
| scene heading | Scene (identity boundary) | slide | stretch between two slide changes |
| Action | Keyframe: the Elements on screen | slide content | the same page |
| `NARRATOR` dialogue | Line | speaker notes | narration and subtitles |
| Parenthetical | Hint: delivery | none | speech settings |
| `[[...]]` in a Line | Cue | fragment | step or sound at the aligned word |
| `> AUTO-ANIMATE`, `> CUT` | Hint: transition | `data-auto-animate` or none | transition frames |

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
