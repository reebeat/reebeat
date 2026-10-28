# @reebeat/verify

`reebeat check`: the falsifiers of spec 0001 on the **written files** of a build directory and on the source. Nothing here
comes from the pipeline that wrote them: the checks decode the mp4, read `deck.html`, `.vtt`, `plan.json` and `build.json`,
and rebuild the Plan from the source with the core's `buildPlan`. The package depends on `@reebeat/core`, `@reebeat/deck`,
`@reebeat/sfx`, `@reebeat/video` and `effect`; a test keeps `fountain-js`, a browser and Node built-ins out of `src`.
Spec: [`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md).

```text
runChecks({ buildDir, sourcePath, cacheDir? })   Effect<readonly Verdict[], BuildInvalid, FileSystem | Path | Crypto | MediaTools>
compareBuilds(dirA, dirB)                        Effect<Verdict, BuildInvalid, same>         F6: one Verdict
renderVerdicts(verdicts) : string                the table                                   pure
exitCode(verdicts) : 0 | 1                       0 only when there is a Verdict and each holds   pure
BuildManifestSchema, encodeBuildManifest, decodeBuildManifest    build.json, written by `build`, verified here
```

A `Verdict` is `{ id, ok, detail, measured }`. `detail` is the first thing that failed (or what held); `measured` lists every
observed value (offset per Cue and Line, counts), so a PASS is evidence and not an absence. An observation that cannot be
made (ffmpeg fails on a damaged mp4) is a FAIL verdict that names the tool's message. `BuildInvalid` is for a directory
that cannot be checked at all: no `build.json` or `plan.json`, a `plan.json` that does not decode or has no Timeline, no
single `.mp4` or `.vtt`, an unreadable source.

## What each check reads and how it decides

| Id | Reads | Holds when | Measured |
| --- | --- | --- | --- |
| F1 | mp4 frames and audio, Timeline | each `next` and `focus` Cue: the first frame in the 3 frames either side of its `fireFrame` whose pixels differ from the frame before (more than 8 gray levels on at least 200 pixels) is within 1 frame of it. Each `sfx` Cue: the catalogue sound (`sfxWav`) is found in the decoded track by cross-correlation within 150 ms, with a best match of at least 0.5, within 1 frame | offset in frames per Cue |
| F2 | `.vtt`, the `mov_text` stream (extracted to WebVTT by ffmpeg), source | each holds one cue per Line, its text equals the Line's narration text, start and end are within 1 frame of the Line's frames | cue counts, largest deviations |
| F3 | `deck.html` (`readDeck`), source | slide $k$'s notes equal the narration of Scene $k$'s Lines, in order | slides, notes |
| F4 | `deck.html`, source | slide $k$ has one fragment per Cue (id, kind, argument, order); and `checkDeck` finds nothing else wrong: revealed Elements, Elements, slide marks, slide order | slides, fragments |
| F5 | every written file, source | the SHA-256 of the source bytes is in `plan.json`, `deck.html` (attribute and meta), the `.vtt` NOTE, the mp4 `comment` and `build.json`; `plan.json` equals the Plan rebuilt from the source, its Timeline apart; every file `build.json` lists has the listed hash and size, and the four media files are listed | each place, files verified |
| F6 | two mp4s (`compareBuilds`) | the hash of every decoded video frame and the decoded audio PCM are equal; the container bytes are compared and reported, not required | frames that differ, PCM hash, container bytes |
| F7 | mp4 frames: every Scene after the first; and from `slideFrame - 3` to `slideFrame + 30` of every `auto-animate` Scene | the first frame within 4 frames of each `slideFrame` whose pixels change (same threshold as F1) is within 1 frame of it, whatever the transition; and at least 5 distinct intermediate frames (differing from both ends by at least 200 pixels, distinct by SHA-256), and the sum of absolute differences to the settled frame never rises from one intermediate frame to the next by more than 10% of the whole change | slide-change offset per Scene and transition kind; intermediate frames, distinct, largest rise |
| F8 | mp4 audio, narration FLACs from the speech cache | each Line's audio is found in the decoded track within 1 frame of its `startFrame`, with a best match of at least 0.8 | offset and match score per Line |
| F9 | `ffprobe` | one chapter per Section, titled with the Section text, starting within 1 frame of its first Scene's `slideFrame`; one h264, one aac, one `mov_text` and one data stream; as many video frames as the Timeline | chapters, streams, start offsets |

F3, F4, F2 and F9 compare with the Plan **rebuilt from the source**, so a source edited after the build fails them even
when `plan.json` and the outputs agree with each other. F1, F7 and F8 take the Cues, Scenes and Lines from `plan.json`;
F5 holds `plan.json` equal to the source's Plan, so all three rest on the one source.

## Choices the measurements decided

- **F1 sounds.** A tonal sound (`ding`, a sine) matches itself at every period of its tone, so the plain cross-correlation
  of the sound picks a wrong period: it reported the ding 1.12 frames late on the committed story. The check correlates the
  sound **with 10 ms of silence before it**; only its true start has silence before it. Offsets are then 0.00 to 0.01 frames.
- **F1 steps.** The encoder's noise between two frames of a still slide is up to about 120 pixels above 8 gray levels; the
  first frame of the smallest real step (a `focus` ring) has 349. The threshold is 200 pixels.
- **F7 monotonic approach.** The sum of absolute differences to the settled frame is not monotone in a real transition: it
  rises by up to 1.5% of the whole change on the committed story and 5.9% on the test fixture (an Element first moves
  away from its settled place, overlapping another). The check allows a rise of 10% of the whole change; the control that
  plays the transition backwards rises by 27.9% and fails.
- **Match score floors.** `audioOffsetMs` returns the best normalised correlation with the offset. A clip that is not there still has a best lag, so a check that reads only the offset can pass by luck. Narration: found 0.994 to 1.000 on the committed story (12 of 12), another Line's narration in the same window 0.12 to 0.62, so the floor is 0.8. Sounds: found 0.994 (whoosh) and 1.000 (ding) on the story and 0.77 on the test fixture (a pop that starts under the last 33 ms of a loud noise narration); a wrong sound, the right sound outside the window and a silent track match at 0.00 to 0.08, so the floor is 0.5. The controls: audio delayed by 400 ms (beyond the 150 ms window) and a silent track both fail F8 and F1 with `not found`, a delay of 3 frames fails with the offset.
- **F7 scene changes.** The Revision's capture lags (an Auto-Animate scene change commanded 2 frames before its slide frame, a cut 1 frame) did not hold on the real deck: the first frame with at least 200 pixels changed by more than 8 levels came at `slideFrame - 2` and `slideFrame - 1`. F7 now observes every scene change; `packages/video` commands them at their measured lag and the story's six scene changes all begin at their slide frame. The control commands the Auto-Animate scene change of the small story 2 frames late and 2 frames early.
- **F8 narration onset.** A narration file is correlated from its first sample above 0.005 (leading silence skipped).

## Tests

`bun run test` in this directory, inside `devenv shell` (Chromium and ffmpeg). `test/support.ts` builds a small story
(two Sections, two Scenes, 153 frames) end to end with the real packages: parse, schedule, deck, capture in Chromium, mux.
The narration is seeded noise in a temporary speech cache, as in `packages/video/test`. Each control copies that build,
changes one thing and seals `build.json` again, so only the falsifier under test sees the change.

| File | Proves |
| --- | --- |
| `checks.test.ts` | every falsifier holds on the intact build; each negative control fails its falsifier, names the item and leaves the others holding (F1 a Cue commanded 2 frames late, re-rendered; F2 one character of the `.vtt` and of the `mov_text` stream; F3 a note; F4 a deleted and a swapped fragment; F5 one hash, a source edited after the build, a deck rebuilt alone; F6 a frame replaced in one of two builds; F7 a hard cut and a transition played backwards; F8 the audio delayed by 3 frames, which also delays the sfx and so fails F1, and audio delayed beyond the search window or silent, which are not found; F7 also a scene change commanded 2 frames late and early; F9 a renamed chapter); a directory without `build.json` is `BuildInvalid` |
| `pure.test.ts` | the table and exit code, the WebVTT reader, the Plan comparison, the signal helpers |
| `boundaries.test.ts` | F11: the manifest and an import scan of `src` (no `fountain-js`, no Playwright, no Node built-in) |
