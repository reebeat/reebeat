# @reebeat/verify

`reebeat check`: the falsifiers of spec 0001 on the **written files** of a build directory and on the source. Nothing here
comes from the pipeline that wrote them: the checks decode the mp4, read `deck.html`, `.vtt`, `plan.json` and `build.json`,
and rebuild the Plan from the source with the core's `buildPlan`. It reads `build.json` (schema 2) through `@reebeat/pipeline`'s
`BuildManifestSchema`, the one definition shared with the program that writes it. The package depends on `@reebeat/core`,
`@reebeat/encode-ffmpeg` (the media probes), `@reebeat/lint` (effect and fragment agreement), `@reebeat/pipeline`,
`@reebeat/render-reveal` (`readDeck`, `checkDeck`), `@reebeat/services`, `@reebeat/sounds-synth`, `@reebeat/subtitles`
(`parseVtt`) and `effect`; a test keeps `fountain-js`, a browser and Node built-ins out of `src`.
Spec: [`docs/specs/0001-release-1-screenplay-to-deck-and-video.md`](../../docs/specs/0001-release-1-screenplay-to-deck-and-video.md).

```text
runChecks({ buildDir, sourcePath, cacheDir? })   Effect<readonly Verdict[], BuildInvalid, FileSystem | Path | Crypto | MediaTools>
compareBuilds(dirA, dirB)                        Effect<Verdict, BuildInvalid, same>         F6: one Verdict
renderVerdicts(verdicts) : string                the table                                   pure
exitCode(verdicts) : 0 | 1                       0 only when there is a Verdict and none fails (`na` does not)   pure
```

A `Verdict` is `{ id, status, detail, measured }` with `status` `pass`, `fail` or `na`. `detail` is the first thing that failed (or what held); `measured` lists every
observed value (offset per effect and Line, counts), so a PASS is evidence and not an absence. An observation that cannot be
made (ffmpeg fails on a damaged mp4) is a FAIL verdict that names the tool's message. `BuildInvalid` is for a directory
that cannot be checked at all: no `build.json` or `plan.json`, a `plan.json` that does not decode or has no Timeline, no
single `.mp4` or `.vtt`, an unreadable source.

## What each check reads and how it decides

| Id | Reads | Holds when | Measured |
| --- | --- | --- | --- |
| F1 | mp4 frames and audio, Timeline (`effects.ts`, `events.ts`, `frames.ts`) | **every effect of the Timeline is observed, and so is the moment it is anchored to** (spec 0002). Its own change: a `show` or `focus` is the first frame that differs in its target's cell (the observer of `events.ts`: 200 pixels by more than 8 gray levels against the picture 3 frames before); a `sound` is found in the decoded track by matched filter against the catalogue clip (`locateSounds`: overlapping sounds are looked for with the others taken out; best match at least 0.5). Its anchor: the slide change (`transition.start`, `scene.start`), `transition.end` and `N%` (the whole frame), an Element's `enter`, `exit`, `move`, `update` at `start`, `end` or `N%` (its cell or the two cells of its move), or another effect's own observed start or end; a word, and the end of the last Scene, have no picture, their frame is the Timeline's. A `move.N%` is the frame at which the centre of the box's ink is N% of the way from its old place to its new one, an `update.N%` the blend of the pixels, anything else N% of the time between the observed start and end. **Holds when** the effect's own observed frame is within 1 frame of its `fireFrame`, the observed anchor plus the effect's offset (a percent offset of the observed window) is within 1 frame of it, and the effect is within 1 frame of where its observed anchor puts it. A renderer that declares the wrong lifecycle makes the anchor and the Timeline differ and fails here | per effect: `resolved F; anchor observed A, so B (+d); observed O (+d)` (a sound: `sound onset O (+d), match score S`) |
| F2 | `.vtt`, the `mov_text` stream (extracted to WebVTT by ffmpeg), source | each holds one cue per Line, its text equals the Line's narration text, start and end are within 1 frame of the Line's frames | cue counts, largest deviations |
| F3 | `deck.html` (`readDeck`), source | slide $k$'s notes equal the narration of Scene $k$'s Lines, in order | slides, notes |
| F4 | `deck.html`, source, `plan.json`'s Timeline | slide $k$ has one fragment per `show` or `focus` effect of Scene $k$ in resolved-time order (id, verb, target), carries every sound of the Plan in `data-sounds` on the slide or on the step `@reebeat/core/steps` says; and `checkDeck` finds nothing else wrong: Elements, slide marks, slide order | slides, fragments, sounds carried |
| F5 | every written file, source | the SHA-256 of the source bytes is in `plan.json`, `deck.html` (attribute and meta), the `.vtt` NOTE, the mp4 `comment` and `build.json`; `plan.json` equals the Plan rebuilt from the source, its Timeline apart; every file `build.json` lists has the listed hash and size, and the four media files are listed; `build.json` (schema 2) lists exactly one adapter for each of the seven services, none declared `local` that sends something, the provenance of every Line's audio, and no `settings` anywhere with a secret-looking name (`key`, `token`, `secret`, `password`, `credential`) | each place, files verified, adapters listed with egress, assets with provenance |
| F6 | two mp4s (`compareBuilds`) | the hash of every decoded video frame and the decoded audio PCM are equal; the container bytes are compared and reported, not required | frames that differ, PCM hash, container bytes |
| F7 | mp4 frames: every Scene after the first; from `slideFrame - 3` to `slideFrame + 30` of every `auto-animate` Scene; from the first changed frame to 0.6 s later of every `cut` Scene | the first frame within 4 frames of each `slideFrame` whose pixels change (same threshold as F1) is within 1 frame of it, whatever the transition; and at least 5 distinct intermediate frames (differing from both ends by at least 200 pixels, distinct by SHA-256), and the sum of absolute differences to the settled frame never rises from one intermediate frame to the next by more than 10% of the whole change; and a `cut` shows NO intermediate frame: every frame from its first changed frame on differs from the frame 0.6 s later by fewer than 200 pixels (above 8 gray levels), so the old slide does not fade out over the new one | slide-change offset per Scene and transition kind; intermediate frames, distinct, largest rise; intermediate frames per cut |
| F8 | mp4 audio, narration FLACs from the speech cache | each Line's audio is found in the decoded track within 1 frame of its `startFrame`, with a best match of at least 0.8. `N/A (silent stand-in)` when `build.json` lists a stand-in narrator (its narration is silent by construction; the sounds of such a build are audible and F1 checks them) | offset and match score per Line |
| F9 | `ffprobe` | one chapter per Section, titled with the Section text, starting within 1 frame of its first Scene's `slideFrame`; one h264, one aac, one `mov_text` and one data stream; as many video frames as the Timeline | chapters, streams, start offsets |

F3, F4, F2 and F9 compare with the Plan **rebuilt from the source** (F4 with the written Timeline, which says the order of the steps), so a source edited after the build fails them even
when `plan.json` and the outputs agree with each other. F1, F7 and F8 take the effects, Scenes and Lines from `plan.json`;
F5 holds `plan.json` equal to the source's Plan, so all three rest on the one source.

## Choices the measurements decided

- **F1 sounds: the matched filter.** A decaying tone (`ding`, a sine with a 0.35 s time constant) correlates almost as well with its
  own ringing 130 ms later as with itself, so the normalised cross-correlation of `audioOffsetMs` took a ding that sounds
  over the tail of a whoosh for one 4 frames late (release 1 put 10 ms of silence before the reference, which only helps when
  nothing sounds before the ding). A catalogue sound is mixed at its own amplitude, so `locateSounds` takes the lag where the
  plain dot product with the first 200 ms of the clip is largest, and reports the normalised correlation there for the floor
  (`pure.test.ts` pins both: the ding is found at 0.0 ms, the normalised correlation is 20 ms or more off). Sounds that sound
  together hide each other (the whoosh and the ding of `sc4` start 8 frames apart and the ding is loud in the band of the
  whoosh), so each is looked for with the others taken out where they are now thought to lie, three rounds.
- **F1 steps.** The encoder's noise between two frames of a still slide is up to about 120 pixels above 8 gray levels; the
  first frame of the smallest real step (a `focus` ring) has 349. The threshold is 200 pixels.
- **F1 looks in the target Element's cell.** The spec says the step is "the first frame where the target Element's
  pixels differ". The encoder also leaves a flicker on the hard edge of an Element that appeared earlier, larger than the
  step threshold, so the whole frame would read a step three frames early. `regions.ts` gives the cell of the Element an effect
  acts on; a motion is observed in the union of the two cells of its move. Two effects on one Element close in time
  (a `focus` 6 frames after its `show`) are read against the fade of the first: write them 9 or more frames apart.
- **F1 moves are followed by their ink.** The pixel count of a moving box saturates once it has moved its own width, and sees the
  one-pixel jump with which an Auto-Animate begins as the start, so a box is followed by the centre of its ink (`frames.ts`; ink that
  is the same before and after, another Element in the region, is left out): it has started when it is 2 pixels from its old place
  and ended within half a pixel of its new one, and `move.N%` is when it is N% of the distance. A colour (`update`) is followed by
  the blend of its pixels. The percent of a transition or of an `enter` is in time.
- **F1 anchors are in the picture, offsets are arithmetic.** The observed anchor frame plus the offset (`+0.1s` is 3 frames, `-3f`
  is -3, a percent is a share of the observed window) is compared with the resolved frame, so the offset itself is not tested
  here (core tests it) but a Timeline that resolved the anchor to another frame than the picture shows is.
- **F7 monotonic approach.** The sum of absolute differences to the settled frame is not monotone in a real transition: it
  rises by up to 1.5% of the whole change on the committed story and 5.9% on the test fixture (an Element first moves
  away from its settled place, overlapping another). The check allows a rise of 10% of the whole change at one frame, and
  requires that the last intermediate frame is not farther from the settled frame than the first: a transition played backwards
  rises by a little at every frame (under the slack when the box is small against the frame) and fails on the second rule.
- **Match score floors.** `audioOffsetMs` returns the best normalised correlation with the offset. A clip that is not there still has a best lag, so a check that reads only the offset can pass by luck. Narration: found 0.994 to 1.000 on the committed story (12 of 12), another Line's narration in the same window 0.12 to 0.62, so the floor is 0.8. Sounds: found 0.994 (whoosh) and 1.000 (ding) on the story and 0.77 on the test fixture (a pop that starts under the last 33 ms of a loud noise narration); a wrong sound, the right sound outside the window and a silent track match at 0.00 to 0.08, so the floor is 0.5. The controls: audio delayed by 400 ms (beyond the 150 ms window) and a silent track both fail F8 and F1 with `not found`, a delay of 3 frames fails with the offset.
- **F7 cuts.** `> CUT` marked only the incoming slide with `data-transition="none"`, and reveal.js fades a leaving slide by its own style: on the committed story the old slide faded out over the new one (frames 549 to 560, 12 frames, each at least 200 pixels above 8 gray levels from the settled frame; frame 549, the change, differed by 8,368 pixels, mean absolute difference 0.84 gray levels; the picture settled at frame 565). The deck now makes the slide that a cut replaces leave at once (`packages/render-reveal/src/theme.ts`); after the fix frame 549 differs from the settled frame by 12 pixels (mean 0.001) and no frame is intermediate. F7 measures this on every cut: the frames from the first changed frame to 0.6 s later (longer than the 0.5 s fade, shorter than a Scene's lead of 1 s, so nothing else moves) must each differ from the last of them by fewer than 200 pixels above 8 gray levels.
- **F7 scene changes.** The Revision's capture lags (an Auto-Animate scene change commanded 2 frames before its slide frame, a cut 1 frame) did not hold on the real deck: the first frame with at least 200 pixels changed by more than 8 levels came at `slideFrame - 2` and `slideFrame - 1`. F7 now observes every scene change; `packages/capture-chromium` commands them at their measured lag and the story's six scene changes all begin at their slide frame. The control commands the Auto-Animate scene change of the small story 2 frames late and 2 frames early.
- **F8 narration onset.** A narration file is correlated from its first sample above 0.005 (leading silence skipped).

## Tests

`bun run test` in this directory, inside `devenv shell` (Chromium and ffmpeg). `test/support.ts` builds a small story
(two Sections, two Scenes, 156 frames) end to end with `buildProgram` over the real adapters: parse, schedule, reveal.js
deck, capture in Chromium, mux with ffmpeg, a filesystem cache. The narrator is a test synthesiser whose speech is seeded
noise (its id does not end `-standin`, so the checks treat it as audible). Each control copies that build, changes one
thing and seals `build.json` again, so only the falsifier under test sees the change.

| File | Proves |
| --- | --- |
| `checks.test.ts` | every falsifier holds on the intact build; each negative control fails its falsifier, names the item and leaves the others holding (F1 a `show` commanded 2 frames late, re-rendered; F1 the whoosh anchored to the slide change scheduled at the first word of its Line, 30 frames after it (it sounds where the Timeline says and fails against the observed slide change with -30), the whoosh delayed by 3 frames (+3 from its resolved frame, 0 from its anchor), and a renderer that declares the wrong lifecycle (`matched.startLagFrames` 0: the sound anchored to `a.move.start` is 2 frames off its observed anchor); a scene change commanded 2 frames late or early also fails F1 for the whoosh anchored to it, +2 or -2; F2 one character of the `.vtt` and of the `mov_text` stream; F3 a note; F4 a deleted and a swapped fragment and a sound moved to another step; F5 one hash, a source edited after the build, a deck rebuilt alone; F6 a frame replaced in one of two builds; F7 a hard cut and a transition played backwards; F8 the audio delayed by 3 frames, which also delays the sfx and so fails F1, and audio delayed beyond the search window or silent, which are not found; F7 also a scene change commanded 2 frames late and early; F9 a renamed chapter); a directory without `build.json` is `BuildInvalid` |
| `edges.test.ts` | the thresholds pinned from both sides (a subtitle 0.99 frame off passes, 1.02 frames off fails; F8's floor of 0.8 between a Line scored 0.64, which fails, and one scored 0.81, which passes, so a floor of 0.5 or 0.9 turns a test red, with narration under a louder sound at 0.44 failing and under a quieter one at 0.89 passing; F1's sound floor of 0.5 only between a wrong sound below 0.2, a sound under a louder one above 0.2 and below 0.5, which fail, and one under a quieter sound, which passes); F6 fails on builds that differ only in their audio; a Line's audio file that is absolute or leaves the speech cache is refused (the Plan schema of `@reebeat/core` only admits a 64-hex `.flac` name, so `plan.json` does not decode) |
| `pure.test.ts` | the table and exit code (`pass`, `fail`, `na`), the Plan comparison, `withinOneFrame` at 1, 1.0000005, 1.01, 1.5 and 1.9, the anchor comparison of an effect-anchored sound (`judge`) at 0.99 (passes) and 1.02 frames (fails) from its resolved frame and from the observed first changed frame, on both sides and with the picture one frame late or early, the signal helpers (a ding under a whoosh, a whoosh and the ding over its tail each found where it is) |
| `frames.test.ts` | the observers of F1 on synthetic clips of known truth: where an event starts and ends, a box followed by the centre of its ink (the one-pixel jump is not its start), a colour by its blend |
| `lifecycle.test.ts` | a probe story with one effect anchored to each lifecycle event of an Auto-Animate Scene, a default fade and a cut: every anchor is observed where the Timeline resolved it |
| `boundaries.test.ts` | F11: the manifest and an import scan of `src` (no `fountain-js`, no Playwright, no Node built-in) |
| `manifest.test.ts` | F5 on `build.json` schema 2: a missing provenance, a service without an adapter, a `local` adapter that sends something, and a secret-looking setting in an adapter, an asset and a cache key's extra each fail F5 naming it (never the value); F8 is `N/A (silent stand-in)` only when the manifest lists a narrator whose id ends `-standin`, and F1 still fails on a silenced track under it; the same silenced track under a real narrator, and under a narrator whose id merely contains `standin`, still fails F8 |
| `offline.test.ts` | an offline build (the silent stand-in narrates, the sounds are real): F8 is `N/A`, F1 observes every `sound` effect (the pop is found in the track) and the whoosh anchored to the slide change against the picture, and passes; the whoosh delayed by 3 frames fails F1 (+3 from its resolved frame, 0 from its observed anchor) |
| `cut.test.ts` | F7 on a small story with a `> CUT`: the first changed frame is already the settled one (0 intermediate frames); the same deck captured without the rule that makes the old slide leave at once fades it out over 12 frames and fails F7 naming the cut |

## What covers what, for F6 and F7

F7 observes **one** written video: scene-change timing, intermediate frames, a monotone approach. It does not check that two runs give the same frames; that is F6 (`compareBuilds`, on two builds). The controls:

| Control | Where | Automated |
| --- | --- | --- |
| scene change commanded 2 frames late and early; hard cut; reversed transition (F7) | `checks.test.ts` | yes |
| a copy passes; one frame replaced; only the audio changed (F6) | `checks.test.ts`, `edges.test.ts` | yes |
| a seeded jitter of the virtual clock makes two captures differ, the same jitter makes them equal | `packages/capture-chromium/test/capture.test.ts` | yes |
| capture with the settle wait off; capture without the virtual clock | spec 0001, Revision "M0 measured: the clock decides the mechanism", and `packages/capture-chromium/README.md` | no: recorded manual measurements |
