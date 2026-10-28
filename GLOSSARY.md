# Explainers

The explainer pipeline turns a declared storyboard into narrated motion graphics. One source describes what the viewer sees and hears at each moment; videos and decks are rendered from it.

> Provenance: moved here on 2026-10-28 from a private study repository (`work/explainers/GLOSSARY.md`, last changed by
> commit `85a672a14c2927ffaac07d011b6c697e03564144`). Two course-specific example phrases were generalised. This copy is
> the single source.

## Units of description

**Story**:
The largest unit with one concern and one audience, such as "4EM explained" or a conference talk, with its sources. It contains Scenes.
_Avoid_: Video (a Video is a rendering), project, presentation

**Scene**:
One visual context inside a Story, such as the goals model or the service blueprint. It is the boundary of identity: Beats inside a Scene are diffed by Element id; between Scenes there is a cut or crossfade and nothing is matched.
_Avoid_: Slide, section, shot

**Beat**:
The smallest unit of story: one change the viewer should notice. It holds a Keyframe, a Line, Cues and Hints.
_Avoid_: Step, frame, slide, keyframe (the Keyframe is only its visual part)

**Keyframe**:
The visual state a Beat ends in: every visible Element with its properties.
_Avoid_: Snapshot, state (alone), slide

**Line**:
The narration that carries a Beat, as manuscript text aligned to words.
_Avoid_: Caption, voice-over text, script line

**Cue**:
A sound or timing anchor inside a Beat, such as a sound effect, a music change or a pause, tied to the Beat or its transition.
_Avoid_: Trigger, event

**Hint**:
An optional instruction for the transition into a Beat when the change alone does not say enough: path, order, delay or emphasis.
_Avoid_: Animation, tween (those are derived, not declared)

**Behaviour**:
Continuous motion that belongs to the time between Keyframes, such as a token travelling along a process or a counter rising.
_Avoid_: Loop, effect

## Identity and motion

**Element**:
A visible thing with a stable id within a Scene: a shape, link, label or icon. The same id in two Keyframes means the same thing.
_Avoid_: Node (graph term), object, layer

**Identity diff**:
The comparison of two consecutive Keyframes by Element id that derives the motion: an id only in the second Keyframe enters, an id only in the first exits, an id in both updates.
_Avoid_: Magic move, auto-animate (product names)

## Renderings

**Rendering**:
An output derived from a Story; it is never edited by hand.
_Avoid_: Export, build (alone)

**Video**:
A Rendering as a narrated MP4 with subtitles and chapters.

**Deck**:
A Rendering as a presentation the speaker steps through Beat by Beat, with the Lines as speaker notes.
_Avoid_: Slides (as the unit), presentation

## Groupings (reserved; not modelled until a real case needs them)

**Chapter**:
A named run of consecutive Scenes inside a Story; a Video's chapter marks are rendered from it. Today each Scene renders as one chapter mark.

**Sequence**:
An ordered list of Stories rendered as one Video.

**Episode**:
One published Video in a Series.

**Series**:
An ordered set of Episodes on one topic, such as a set of study videos.

**Narrative**:
The argument that runs through a Series and that each Episode advances.

_Avoid_ for any grouping: Epic (overloaded by agile backlogs and by journey mapping), playlist
