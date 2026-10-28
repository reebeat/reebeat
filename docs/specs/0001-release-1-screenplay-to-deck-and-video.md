# 0001 Release 1: a screenplay becomes a deck and a video

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-28. Decided by: the operator, 2026-10-28.
Design: [`docs/design/keyframe-engine.md`](../design/keyframe-engine.md), revisions R1 (Effect in the core) and R2 (screenplay-first). Vocabulary: [`GLOSSARY.md`](../../GLOSSARY.md). Process: [spec 0000](0000-development-lifecycle.md).

## Goal

reebeat is **screenplay-first**. One text file in [Fountain](https://fountain.io/syntax) says what is on screen, what is said and when things happen. From that one file reebeat builds two renderings that cannot disagree:

- a **Deck**: a reveal.js presentation with the narration as speaker notes and the cues as fragments;
- a **Video**: the same reveal.js page captured frame by frame on a controlled clock, stepped through slides and fragments at the moments the narrator says the cue words, and muxed with narration, sound effects, WebVTT subtitles and chapter marks.

Release 1 proves the whole road on **one small original story** (not course material; public).

## Journey

A developer clones the repository, enters devenv and runs:

```text
bun run reebeat plan   stories/same-id/story.fountain            # the Plan, for review: scenes, elements, cues, the identity diff
bun run reebeat build  stories/same-id/story.fountain --out build/same-id
                                                                  # compile -> speech -> deck.html + same-id.mp4 + same-id.vtt
bun run reebeat check  build/same-id                              # every falsifier below, one verdict per falsifier
open build/same-id/deck.html                                      # step through the Deck: arrow keys, `s` for speaker notes
```

`plan` needs no audio and no browser. `build` needs the speech cache (committed for the story) or the local models to refill it, Chromium and ffmpeg (both from devenv). `check` reads only the written files and the source, never the build's internal state.

## The source: Fountain, with a small fixed vocabulary

reebeat reads a screenplay with an existing parser, not its own (candidates found 2026-10-28, all MIT or BSD, none released in 2025 or 2026; the Fountain syntax is stable at 1.1, so staleness is acceptable but is recorded: `fountain-js` 1.2.4, `fountain-parser` 1.1.2, `jouvence` 1.0.1; the parser is chosen in M0 by the token fidelity test below and named in the Revisions). A thin adapter turns its tokens into the Story model; anything the vocabulary does not define **fails the build with its line number** and is never dropped silently.

| Fountain element | reebeat concept | Deck | Video |
|---|---|---|---|
| title page (`Title:`, `Author:`) | Story metadata | deck title, document title | video title tag |
| `# Section`, `= synopsis` | Chapter outline | slide group (vertical stack); synopsis in the group's first slide notes? **no**: synopsis is outline only, shown by `plan` | chapter mark at the Section's first Scene; chapter title = Section text |
| `INT./EXT. ...` scene heading | **Scene**: the identity boundary | one `<section>` (slide); `data-id` space is the slide | one stretch of video between two slide changes |
| Action block | **Keyframe**: what is on screen (Elements) | the slide's content | the same page |
| Dialogue by `NARRATOR` | **Line** | `<aside class="notes">` of the slide | narration audio, aligned by word; one subtitle cue per Line |
| Parenthetical | delivery hint | none | speech settings: `(slowly)` speed 0.9, `(quickly)` speed 1.1, `(pause N)` N seconds of silence before the Line |
| `[[...]]` inside a Line | **Cue**, anchored to the spoken word before it | one fragment per Cue, in order | the step the capture takes (or sound it plays) at that word |
| Forced transition `> AUTO-ANIMATE` | identity diff between this Scene and the previous one | `data-auto-animate` on both slides; Elements match by `data-id` (reveal.js Auto-Animate) | the transition frames, on the controlled clock |
| Forced transition `> CUT` or none | no matching | `data-transition="none"` (default `fade` when none is written) | same |

Unsupported and therefore errors: dual dialogue, centred text, page breaks, lyrics, a character other than `NARRATOR`, emphasis markers (`*`, `_`) in dialogue (so the narration text, the subtitle text and the notes text are the same string by construction), a Section-less first Scene, a Parenthetical outside the three above. Boneyard (`/* */`) is a comment and ignored.

**Narration text** of a Line = its dialogue with every `[[...]]` removed and whitespace collapsed to single spaces. Subtitles and speaker notes carry exactly this string.

**Cues** (inside dialogue only; the grammar is closed):

| Cue | Meaning | Deck | Video |
|---|---|---|---|
| `[[next]]` | reveal the next `hidden` Element of this Scene, in document order | a fragment; its step shows the Element | the capture steps that fragment |
| `[[focus: id]]` | emphasise Element `id` (a ring and a slight scale) | a fragment; its step adds the class `focused` to `id` and removes it from the previous focus | same |
| `[[sfx: name]]` | play sound `name` from the built-in catalogue (`pop`, `whoosh`, `ding`, synthesised by ffmpeg, original) | a fragment; its step plays the sound (a no-op if the browser blocks audio) | the sound is mixed into the audio track at the cue time |

A Cue fires at the **end of the last spoken word before it** in the Line (aligned time); a Cue before the first word fires at the start of the Line. Unknown cue kinds, an unknown `id`, a `[[next]]` with no hidden Element left and a hidden Element no `[[next]]` reveals are plan errors.

**Action Elements.** Each non-empty line of an Action block is one Element: `text {#id @cell .class hidden}`. `#id` is **required** (identity is explicit, never matched by content), unique in the Scene. `@cell` is one of the nine cells `tl tc tr ml mc mr bl bc br` (default `mc`); Elements in one cell stack top to bottom. `.class` is one of the theme's classes (`box`, `title`, `label`, `accent`, `muted`); `hidden` starts the Element invisible. The theme is fixed CSS in `packages/deck` with the Inter font bundled (`@fontsource/inter`, OFL), so frames do not depend on system fonts.

## Pipeline

```text
story.fountain --parse (fountain-js)--> tokens --adapt--> Story (Schema-decoded)
Story --identity diff, cue checks--> Plan  ---------------------------> reebeat plan (review text, --json)
Story --speech(cache | Kokoro + whisper.cpp)--> Lines with aligned words
Plan + aligned words --schedule--> Timeline (every Line, Cue, step and slide change at an integer frame)
Timeline --> deck.html (reveal.js)                          --> Deck
Timeline --> capture (Chromium, controlled clock) + audio mix + VTT + chapters --> mp4  --> Video
build dir --> reebeat check --> one verdict per falsifier
```

`plan.json` (the Plan with the Timeline and `sourceSha256`) is the **only** input of the two renderers. `packages/deck` and `packages/video` do not depend on the parser, so a hand-edited copy of the source cannot reach them (single source by construction).

### Speech

Kokoro-82M through `kokoro-js` (voice `af_heart`, speed 1.0 unless a hint says otherwise) produces one audio file per Line; whisper.cpp (`ggml-base.en`) produces word timestamps, aligned to the narration text by the dynamic-programming matcher the first prototype used (match ratio at least 0.9, else `AlignmentBelowThreshold`). Both run locally; nothing is sent to a hosted service. Results go to a **content-addressed speech cache** keyed by SHA-256 of (narration text, voice, speed, model identifiers): FLAC audio plus a words JSON, committed for the story. A cache hit never loads a model; a miss with the models absent fails with `SpeechCacheMiss` naming the Line and the key. `build --refresh-speech` refills the cache locally. The narrator is a synthetic voice: the story README says so.

### Time

Frame rate 30, canvas 1280x720. Pacing defaults (a Story may override them in its title page): scene lead 1.0 s (at least the 0.8 s transition), gap between Lines 0.5 s, scene tail 0.5 s. A frame $f$ shows virtual time $f/30$ s. A Cue at aligned time $t$ fires at frame $\operatorname{round}(30\,t)$.

### The controlled clock

The capture opens `deck.html` in Chromium (Playwright), installs a virtual clock before the page runs (the prior art: `timeweb`, BSD-3, the clock behind `timesnap` and `timecut`: it overrides `Date`, `performance.now`, `requestAnimationFrame`, timers and, through the Web Animations API, CSS transitions and animations), advances it one frame at a time, calls `Reveal.next()` / `Reveal.nextFragment()` at the scheduled frames, and takes one screenshot per frame. Whether the clock covers reveal.js's CSS transitions is **measured first** (M0) and the result decides the mechanism (below).

## Module layout

```text
packages/core/       @reebeat/core      Story model (Schema), parser adapter, Plan, schedule, errors, review text. Depends on: effect, fountain-js
packages/speech/     @reebeat/speech    Tts and Aligner services, the cache, Layers for kokoro-js and whisper.cpp. Depends on: core, effect
packages/deck/       @reebeat/deck      plan.json -> deck.html (reveal.js, theme, fragment runtime). Depends on: core types only, reveal.js
packages/video/      @reebeat/video     capture (Playwright, clock), audio mix, WebVTT, chapters, mux (ffmpeg). Depends on: core types only, playwright, timeweb
packages/verify/     @reebeat/verify    `check`: output-side falsifier checks over the written files. Depends on: core types, effect
packages/cli/        @reebeat/cli       `reebeat` command; the only composition root. Depends on all
stories/same-id/     story.fountain, README.md, speech-cache/ (FLAC + words JSON)
tools/quality/       from spec 0000
```

**Effect** (design R1, `effect-first`). Plain functions: the identity diff, `classify`, cue resolution, the schedule arithmetic, frame and time conversion, the review-text formatter, every check's comparison. Effect: `Schema` for every decoded boundary (tokens, `plan.json`, speech cache entries, `check` inputs); tagged errors for expected failures (`UnsupportedElement`, `UnknownCue`, `DuplicateId`, `CueTargetMissing`, `HiddenNeverRevealed`, `AlignmentBelowThreshold`, `SpeechCacheMiss`, `ClockCoverageGap`); services for what has authority or a dependency (`Tts`, `Aligner`, `SpeechCache`, `Browser`, `MediaTools` over `ChildProcess`, `FileSystem`); `Layer`s chosen in the CLI; `Scope` for the browser and temporary directories; the `build` pipeline as one Effect program. Browser-side code (the fragment runtime in the deck) is plain JavaScript text generated by `packages/deck` and tested in Chromium.

## Falsifiers

"Output-side" means the check reads the written files, not the pipeline's memory. Each has a negative control that is run and must fail **at the stated place**. Controls are mutations applied to a scratch copy of the story or of the output and are automated as tests.

| # | Falsifier | Check (reads) | Negative control |
|---|---|---|---|
| F1 | **Cue timing.** Every Cue in the story has an observed step in the video within ±1 frame of its aligned word end: a `next`/`focus` step is the first frame where the target Element's pixels differ from the previous frame; an `sfx` is the first frame whose audio window exceeds the catalogue sound's onset threshold | the mp4 (decoded frames, audio) and the aligned words in `plan.json` | Shift one Cue's scheduled frame by +2 in the Timeline: F1 fails naming the Cue and the observed offset of 2 |
| F2 | **Subtitles equal narration.** The `mov_text` stream and `.vtt` hold exactly one cue per Line with text equal to its narration text, times equal to the Line's aligned start and end ±1 frame | mp4 subtitle stream, `.vtt`, source | Change one character in a Line after build: F2 fails naming the Line (stale output) |
| F3 | **Notes equal dialogue.** In `deck.html`, slide $k$'s `<aside class="notes">` text equals the narration text of the Lines of Scene $k$, in order | `deck.html`, source | Edit one note character in the HTML: F3 fails naming the slide |
| F4 | **Fragments equal cues.** Slide $k$ has exactly one fragment per Cue of Scene $k$, with the same kind, argument and order | `deck.html`, source | Delete one fragment from the HTML, or swap two: F4 fails naming the slide and index (a mismatch fails the build, not only `check`: the generator re-reads its own output) |
| F5 | **One source.** `deck.html`, the mp4, the `.vtt` and `plan.json` carry the same `source-sha256` as the `.fountain` file; changing one narration word in the source and rebuilding changes the notes, the subtitles and the narration audio together, and nothing else is hand-kept: no generated file is committed except the speech cache | `check` + a test that builds twice | Rebuild only the deck after editing the source: the stale video makes F5 fail on the hash |
| F6 | **Determinism.** Two builds of the same source and cache on the same machine give identical decoded video frames (SHA-256 per frame) and identical decoded audio PCM; the container bytes are compared and the result recorded (identical or not, and why) | two mp4s | Add `Math.random()` jitter to the clock in a scratch copy: F6 fails naming the first differing frame |
| F7 | **The clock covers the transitions.** In the Video, an Auto-Animate transition between two slides shows at least 5 distinct intermediate frames in which the matched Element's box lies strictly between its start and end boxes, monotonic, and the same in two runs; the measured outcome and the chosen mechanism are written into the Revisions | frames of the mp4 | Capture the same page without the virtual clock: F7 fails (transition frames are missing or differ run to run) |
| F8 | **Narration is where the Timeline says.** Each Line's audio starts at its scheduled frame ±1 (onset found in the decoded track) | mp4 audio, `plan.json` | Delay the narration track by 3 frames: F8 fails naming the Line |
| F9 | **Chapters.** One chapter per Section, titled with the Section text, starting at the first frame of its first Scene ±1 frame | `ffprobe` chapters | Rename a Section or drop a chapter in the mux: F9 fails |
| F10 | **Plan is correct and loud.** `plan` is deterministic (twice equal), lists every Element once per Scene, derives enter/exit/update across `> AUTO-ANIMATE` boundaries by `#id`, and fails with a line number on each of: unsupported element, unknown cue kind, unknown `focus` id, duplicate `#id` in a Scene, missing `#id`, `next` with nothing hidden, hidden never revealed, a Parenthetical outside the vocabulary | `plan`, golden file | One mutation per listed error; each must fail with that error and the right line |
| F11 | **Boundaries.** `packages/core` imports no browser, Playwright, ffmpeg, reveal.js or Node built-in (a forbidden package is absent from its `dependencies`, and lint restricts imports); `packages/deck` and `packages/video` import no parser | package manifests, lint, an import-scan test | Add `import "playwright"` to core: lint and the scan test fail |
| F12 | **Failure is loud.** A speech-cache miss with the models absent, a word alignment below 0.9 and a capture timeout each stop the build with their typed error and write no partial `build` output that `check` would accept | `build`, `check` | Delete one cache entry in a scratch copy: the build stops with `SpeechCacheMiss` naming the Line |

F10 and F11, the F2 to F5 and F9 checks on a short fixture and the speech-cache logic run in CI without a browser. F1, F6 to F8 and F12's capture timeout need Chromium and ffmpeg: CI runs them if devenv provides both and the measured wall time stays within the budget below; otherwise they run locally and the PR reports their output (the decision is a Revision).

### Budget and measurement

- The original story narrates at most 60 s (about 1,800 frames at 30 fps). M0 measures seconds per frame; `bun run ready` must finish on this machine in at most 10 minutes. If the render gates do not fit, a short fixture (`stories/micro`, about 10 s) serves the negative controls and the full story serves the journey; if that still does not fit, `ready` keeps only the browser-free gates and a second command `bun run journey` runs the rest, and both run in CI (a Revision records it). The Revision is a measurement, not a guess.
- Heavy jobs (capture, speech models) follow the machine headroom rule: read live memory, PSI, load and disk before each, and run one at a time.

## The story

`stories/same-id/story.fountain`: original text written for this repository, English, at most 60 s of narration, about why a box that keeps its id between two screens can be animated into place (it is the idea behind reebeat's own identity diff). Minimum content: two Sections; six to eight Scenes; at least three consecutive Scenes joined by `> AUTO-ANIMATE` in which one Element moves, another changes class, one enters and one exits; at least three `[[next]]`, two `[[focus]]`, two `[[sfx]]`; one `(slowly)` and one `(pause 0.5)`; a `> CUT` somewhere. `stories/same-id/README.md` states that the narration is a synthetic voice and the text is original.

## Milestones, in order; each green before the next

| M | Work | Green means |
|---|---|---|
| M0 | **Spikes that decide mechanisms.** (a) Fountain parsers on a probe file: do tokens keep `[[notes]]`, parentheticals, transitions and line numbers? choose one, name it. (b) Clock: reveal.js Auto-Animate in Chromium under `timeweb` and under a hand-rolled `document.getAnimations()` seek; frames of the transition at three runs; the F7 measurement and its control. (c) Speech: Kokoro and whisper.cpp run offline on one Line; seconds and memory. (d) Seconds per captured frame at 1280x720. Each result is a dated Revision | the Revisions hold numbers and the chosen mechanisms; F7 passes with its control |
| M1 | `packages/core`: Story model, adapter, Plan, `reebeat plan`, the error set | F10 and F11 pass in CI |
| M2 | `packages/speech`: cache, Layers, alignment; the schedule; `plan --timing` | F12 (cache miss) passes; Timeline golden |
| M3 | `packages/deck`: `deck.html`; F3, F4, F5 (deck side) | pass with controls |
| M4 | `packages/video`: capture, mix, VTT, chapters, mux | F1, F2, F6 to F9 pass with controls |
| M5 | `packages/verify` + CLI `check`; CI jobs; the story; docs (`README.md`, `STATE.md`, story README) | `bun run ready` green; `reebeat check` prints all verdicts |
| M6 | Open the PR with this spec (plus its Revisions), the code and the evidence | PR body per `pr-create`; reviewers judge plan, implementation, agreement |

## Scope and non-goals

In scope: everything above, including edits to `devenv.nix` and `.github/workflows/checks.yml` that the browser, ffmpeg and speech tools need.

Not in scope (recorded in the design roadmap, built later):

- reebeat's **own motion engine** (path morphs, springs, exits, layout, the contrast gate on every frame) as a renderer plug-in, and the pixel-identical **4EM port** as its regression test ([facts so far](../design/4em-regression-baseline.md)).
- A second voice or character, dual dialogue, emphasis in dialogue, cue offsets (`[[next +0.2s]]`), an Element vocabulary beyond text boxes and nine cells, images, video clips, music, themes other than the built-in one.
- Publishing to npm, hosting the Deck, a licence for this repository (deferred by the operator), regenerating models, Windows or macOS support.

## Risks

| Risk | Mitigation |
|---|---|
| `timeweb` does not drive reveal.js's CSS transitions correctly (it is unmaintained since 2023; Chromium moved on) | F7 is measured in M0 before any design depends on it; fallbacks, in order: a seek of `document.getAnimations()` per frame (deterministic, verified in the earlier survey on a reduced case), then JS-driven transitions (reveal.js `autoAnimateDuration: 0` with own interpolation); the choice is a Revision |
| Screenshots of the same page differ between runs (fonts, compositing, GPU) | bundled font, software rendering flags, fixed viewport and scale factor; F6 measures it; if not bit-identical, the measured tolerance is recorded and F6 states it |
| Kokoro or whisper models are not available in CI | content-addressed cache is committed; CI never needs the models; refill is local |
| The committed speech cache (FLAC + JSON, about 1 to 2 MB) counts as a generated file | it is the only generated artifact in git, keyed by the hash of its inputs; a stale entry cannot match; the F5 control proves no other output is kept |
| Fountain parsers are stale | the syntax is frozen; the adapter is thin; the token fidelity test pins behaviour; swapping a parser changes one file |
| Cue time vs visible step: transitions and rendering latency shift the observed change | F1 observes the output, tolerance ±1 frame, and the capture steps fragments at the exact frame |
| Build time too long for CI | measured in M0; the split in "Budget and measurement" |

## Open questions for the operator

1. **Topic and voice.** The story is about identity between screens (self-referential, English, Kokoro `af_heart`). Another topic or voice?
2. **Speech cache in git.** About 1 to 2 MB of FLAC and JSON for the story, committed so CI and collaborators need no models. Acceptable?
3. **CI browser cost.** If rendering fits the budget, CI renders the video on every PR (Nix pulls Chromium and ffmpeg). If it does not, the split above applies. Acceptable?
4. **Canvas.** 1280x720 at 30 fps for speed. Use 1920x1080 instead (about 2.25 times the capture cost)?

## Revisions

- **2026-10-28, operator: screenplay-first.** This spec replaces the first plan of release 1 (a pixel-identical port of the 4EM explainer through a new engine). That port becomes the regression test of a later own-motion-engine release; the measurements made for it are kept in [`docs/design/4em-regression-baseline.md`](../design/4em-regression-baseline.md). The source is one Fountain file; the renderings are a reveal.js Deck and a Video captured from the same page on a controlled clock; reveal.js Auto-Animate is the animator and the identity diff in release 1. Design R2 records the mapping and what it supersedes (Remotion, "Video first, Deck later", "own engine R0+R3" for release 1); R1 (Effect in the core) stays.
- **2026-10-28, M0 measured: parser.** Probe of 76 lines (6 scenes, 2 sections, notes, forced transitions, boneyards, 5 unsupported constructs), three parsers. `fountain-js` 1.2.4 (MIT, 0 dependencies, 110 KB, TS types, CJS and ESM, released 2023-11-14) keeps `[[notes]]` verbatim in dialogue with position preserved, gives distinct tokens for section depth, synopsis, scene heading, parenthetical, centred, page break, lyrics and dual dialogue, strips boneyards, and has **no line numbers**. `fountain-parser` 1.1.2 has line numbers but misses dual dialogue and splits only the first note per line. `jouvence` 1.0.1 drops notes and merges lyrics into action. **Decision: `fountain-js` plus a thin line-recovery preprocessor** (mask boneyards keeping line numbers, split into blank-line blocks that remember their source line, parse each block alone, give each token the first block line containing its text): 56 tokens on the probe with 0 wrong lines, and 300 fuzzed mutants (11,138 tokens) with 0 wrong lines. The adapter also rejects `*` and `_` in dialogue by regular expression, accepts only the transitions `AUTO-ANIMATE` and `CUT`, and strips cues by regular expression. No own tokenizer.
- **2026-10-28, M0 measured: speech.** Kokoro-82M through `kokoro-js` 1.2.1 (`@huggingface/transformers` 3.8.1, `onnxruntime-node` 1.21.0): fp32 model 311 MiB from huggingface.co (q8 is 3.5 times slower, not used), load 0.7 to 0.8 s warm, 0.13 to 0.20 s per second of audio, peak 914 MB; 63.6 s of story audio synthesised in 10.5 s. Output is byte-identical across three separate processes and with the network disabled. FLAC s16 24 kHz mono is 26 KB/s: **1.6 MB for 60 s** (float FLAC doubles it; use s16). whisper.cpp 1.9.5-dev, `ggml-base.en.bin` (sha256 `a03779c8...c6d002`), command `whisper-cli -m ggml-base.en.bin -f <16 kHz mono s16 wav> -ml 1 -sow -oj -np -t 4`: one JSON entry per word with millisecond offsets that are multiples of 10 ms, identical on rerun, 1.2 to 1.9 s and 317 MB per Line; match ratio 1.000 on 11 of 12 Lines (0.968 on a colour/color spelling difference), so the 0.9 threshold holds. **The input pipeline changes timestamps** (24 kHz FLAC fed directly shifted three words by 90 ms): the cache key includes whisper binary version, model sha256, the ffmpeg resampling flags and the Kokoro dtype. **Accuracy caveat:** word boundaries are consistent but not accurate: the last word's end can overshoot the audible end by 50 to 400 ms and the first word can start 180 ms early. F1 and F8 therefore check agreement with the aligned times, not perceptual accuracy; the Cue fires at the aligned word end. The whisper model has no download source configured on this machine, so CI relies on the committed speech cache and a refill is local.
- **2026-10-28, M0 measured: the clock decides the mechanism.** Chromium 155.0.8059.39, playwright-core 1.64.1, reveal.js 6.0.2, timeweb 0.3.2, 1280x720, 30 fps; a 24-frame Auto-Animate (box x from 100 to 900 and a colour change), a 15-frame fade and two fragments; 10 fresh browser launches of 150 frames each, SHA-256 per PNG frame. (A) `timeweb` alone: F7 count passes but **F6 fails**: 50 of 150 frames differ between launches, because Reveal's CSS animations run in real time until timeweb's `transitionrun` handler pauses them, so the start offset leaks 0 to 1 frame of wall time; Chromium flags do not fix it. (B) own seek, no timeweb (pause every `document.getAnimations()` entry and set `currentTime = (f - f0) * 1000/30`): 0 differing frames in 10 launches, but Reveal's timers and events run on real time. (Hp) **`timeweb` clock plus the same seek with a two-real-`requestAnimationFrame` settle before the first seek of a new animation: 0 of 150 frames differ in 10 launches, also with the Chromium flags, and 0 of 300 for JPEG; Reveal's events fire at exact virtual times.** (H) the same without the settle flakes on frame 60 (the fade start) in 4 of 9 pairs. (C) control without a clock: 42 and 30 of 150 frames differ between runs, the transition runs 18 to 38 px off the ideal schedule and DOM and pixel disagree by up to 72 px; its count of intermediate frames still passes on this fast machine. **Decision: Hp** (B is the recorded fallback; the JS-driven fallback is not needed). Consequences: (1) the F7 criterion that discriminates is run-to-run identity, not the count: F7 states "at least 5 monotonic intermediate frames **and** the same in two launches"; control C fails the second part. (2) Under the virtual clock the first changed pixel of an Auto-Animate is at frame $f+2$ after `Reveal.next()` at $f$ (Reveal starts it in a `requestAnimationFrame`), and of a fragment or fade at $f+1$; the schedule therefore calls `Reveal.next()` for an Auto-Animate at $F-2$ and `nextFragment()` or a fade at $F-1$ so the first visibly changed frame is $F$ (needed for F1's ±1 frame). (3) The virtual clock is pre-rolled past `Reveal.initialize` (`goTo` 50 to 300 ms; `goTo(0)` never initialises Reveal) and frame 0 starts at that offset. (4) A hash-compare of two launches is part of F6's guard. **Cost:** 0.035 s per PNG frame (0.027 JPEG), about 12.6 KB per PNG frame, about 1.2 GB for all Chromium processes: 1,800 frames take about 63 s. Not tested: audio or video elements, iframes, any `goTo` that skips more than one frame, backward `goTo`.
