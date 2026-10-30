# tsukuri feature map

The maintained list of what a user of the compiler can observe, how to observe it on a verification run, and what counts as broken. `tools/quality/test/verifyMap.test.ts` reads this file: every row has an id in backticks and five cells, every `Verify skill:` line of a spec names ids found here, and every effect verb, sound, anchor kind, Element event and transition of `@tsukuri/core` appears as a row id or in the row of the same name. A PR that adds or changes user-visible behaviour edits this file in the same PR.

Terms are `GLOSSARY.md`'s. Paths in the "Observe" column are inside the run directory (`~/.local/state/tsukuri-verify/<date>-<label>/`, written by `scripts/run.sh`), where `plan.txt`, `lint.txt`, `build.txt`, `check.txt` are the raw output of the CLI steps, `frames/`, `obs/` and `deck/` those of `scripts/observe.ts`, and `journey.txt` the journey step (`--journey`). The story is `stories/same-id` (Scene and effect ids below are its). A feature the story does not exercise says so and names how to make a scratch story: write it under the run directory, build it with `--speech-flags "--speech silent --aligner even" --cache-dir <run>/standin`, and read `check.txt` (F8 prints `N/A (silent stand-in)` there and nowhere else).

"Resolved" is the frame `plan.txt` prints after `->`; "observed" is what `check.txt` F1 and the montages show. A montage `frames/<scene>-<effect>.png` has three tiles: resolved frame minus 1, the resolved frame, plus 1.

## Anchors: when an effect happens

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `anchor-word` | `word("phrase"[, n]).start` or `.end`, with an offset: sc2.f1 (second argument picks the first of two "screen"), sc2.r1, sc4.r1 (`+0.1s`), sc4.f1 (`-0.2s`) | `plan.txt`: `f1 focus box word("screen", 1).end -> frame 372`. `check.txt` F1 line `sc2.f1 ... resolved 372; observed 371 (-1)`. `frames/sc2-f1.png`: the ring appears in the middle tile or the one after it | observed minus resolved is more than 1 frame; the phrase resolves inside another Line; a repeated phrase without `n` is accepted (`lint.txt` must name the line) | 0002 F1 F2 |
| `anchor-scene` | `scene.start`, `scene.end`: the slide change frame, the Scene's last frame | not in `same-id`: scratch story, `plan --timing` prints the frame; `scene.start` equals the Scene's `slide change at frame` | the frame differs from the Scene's printed slide change or last frame | 0002 F1 |
| `anchor-transition` | `transition.start`, `.end`, `.N%` of the incoming slide transition: sc4.s1 and sc5.s1 at `transition.start` | `plan.txt` `s1 sound whoosh transition.start -> frame 698 (rides the slide)`. `frames/sc4-s1.png`: the focus ring of sc3 is on the left tile and gone on the middle one (the slide change). `obs-onsets.txt`: `sound sc4.s1: expected 698.00, nearest onset 698.01` | a sound before or after the slide change by more than 1 frame; a `%` on a `> CUT` Scene is accepted | 0002 F1 |
| `anchor-element` | `<element>.enter`, `exit`, `move`, `update` with `.start`, `.end` or `.N%`: sc4.s2 at `one.move.50%` | `plan.txt`: `s2 sound ding one.move.50% -> frame 706`. `check.txt` F1: `anchor observed 706.04, so 706.04 (+0.04)`. `frames/sc4-transition.png`: box `one` is left, then centred, then at rest | the anchor observed in the picture is more than 1 frame from the resolved frame; the move midpoint is taken in time, not in position | 0002 F1 |
| `anchor-effect` | `<effect>.start`, `.end`: a chain (`w4: sound pop at w1.start +3f`), acyclic | not in `same-id`: the grammar example `docs/grammar/effects.md` "One Scene" as a scratch story; `plan.txt` shows w4 three frames after w1 | a cycle is accepted; the chained frame differs from the referenced effect's frame plus the offset | 0002 F2 |
| `anchor-beat` | `beat(n).start`, `.end`, `.N%`: the generated Beat between State n and State n+1 of a Scene: sc6.s2 at `beat(2).end +0.1s` | `plan.txt`: `s2 sound pop beat(2).end +100ms -> frame 1493 (rides step r2)`. `check.txt` F1: `leaves beat(2).end 1490`, observed 1493 (0). `frames/sc6-s2.png`: the box `gone` has finished fading at the tile before | the observed end of the step that opens the Beat is more than 1 frame from the resolved frame; the Beat is numbered in declaration order, not in time order | 0004 F1 |
| `anchor-state` | `state(n).enter`, `.leave`, and `within(<event>, state(n))`: a State is a dwell between two Beats; `leave` is the first frame out of the State; sc6.s3 at `state(3).leave -1f`, sc6.s4 at `within(word("missing").end, state(2))` | `plan.txt`: `s3 sound pop state(3).leave -1f -> frame 1507`, `s4 ... within(word("missing").end, state(2)) -> frame 1451`. `check.txt` F1: `sound onset 1506.99 (-0.01)` and `1451.01` | the sound lands outside the State, or one frame off the last frame of the Scene (the last State's `leave` is the next slide's frame; a bare `state(3).leave` is outside the Scene) | 0004 F1 |
| `event-combinators` | `each(...)` (with `throttle=` and `stagger=`), `first(...)`, `last(...)`, `let name = ...`, `until ...` on a focus, `when(x.progress >= N%)`: sc3.s1, sc4 `settled` and f1, sc5 `landed`, sc6.s1, sc7.p2 and p3 | `plan.txt`: every instance (`s1#1`, `s1#2`) and every derived event with its frame; `check.txt` F1 lists a `let` row per derived event and `ring off` for the focus with `until`; `frames/sc4-f1.png` has the ring gone at the end frame | an instance missing or at another frame; `last` taking the earliest, `first` the latest; a ring that stays on after its `until`; `all(...)` accepted | 0004 F1 F3 F5 |
| `anchor-absolute` | `2.5s because "reason"`: sc7.p1 at 0.5 s | `plan.txt`: `p1 sound pop 0.5s because "..." -> frame 1524 (plays alone)`; `lint.txt`: `info absolute-time: scene sc7, effect p1 ...`; `obs-onsets.txt`: onset 1524.00 | `because` missing is accepted; `lint.txt` does not list the time; the onset is not at scene start plus 0.5 s | 0002 F5 |
| `anchor-offset` | offsets `+0.1s`, `-0.2s`, `+3f`, `+10%` | `plan.txt`: sc4.r1 resolves to frame 849, one frame before sc4.f1's 850 only because of its offset; the montage of each shows the step at the printed frame | an offset in the wrong direction or unit; `%` accepted where the anchor has no window | 0002 F1 |

## Effects: what happens

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `effect-sound` | `sound pop`, `whoosh`, `ding`: synthesised, original | `check.txt` F1 `sound onset 698.01 (+0.01), match score 0.994` for every sound; `obs-onsets.txt` lists each unmasked sound within 0.1 frame; `assets/sfx/` in the build holds only the sounds the Plan uses; Deck slide carries `data-sounds` (`deck/deck.json`) | a match score under the check's threshold; a sound absent from the mixed track; an unused sound in `assets/sfx` | 0001 F1 |
| `effect-show` | `show <element>` reveals an Element declared `visible=false`, exactly once | `frames/sc2-r1.png`: "Another box" is absent on the left tile, fading in on the middle one and drawn on the right one; `deck/deck-sc2-2.png` has it after two fragment steps | the Element is visible earlier; two `show` effects reveal one Element; a `visible=false` Element no effect reveals is accepted (`lint.txt`) | 0001 F1 F4 |
| `effect-focus` | `focus <element>`: a ring and a slight scale; a later focus moves it; two focus effects on one frame are rejected | `frames/sc2-f1.png`: the ring on "A box"; `deck/deck-sc4-2.png`: the ring on the hint. Control: a scratch story with two focus effects on one word anchor: `plan --timing` exits 1 with `SimultaneousFocus` naming both effects and the frame; `lint` prints it with the later effect's line | the ring stays on the previous Element; no ring at the resolved frame; the scratch story plans and then fails F1 instead | 0001 F1 F4; 0018 F1 |

## Transitions and identity

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `transition-default` | a Scene with no transition line fades (sc2, sc6, sc7) | `plan.txt`: `transition: default`; `deck.html` has no `data-transition` on the section; `frames/sc6-slide.png` shows a blend between the two slides | the frame is a hard cut; the slide change frame differs from `plan.txt` | 0001 F7 |
| `transition-cut` | `> CUT`: no animation (sc3) | `plan.txt` `transition: cut`; `deck.html` `data-transition="none"`; `check.txt` F7 `sc3 cut intermediate frames: 0` | any intermediate frame; Elements animate across it | 0001 F7 |
| `transition-auto-animate` | `> AUTO-ANIMATE`: Elements with the same id move (sc4, sc5) | `check.txt` F7: 25 distinct intermediate frames, monotonic, largest rise under a few percent; `frames/sc4-transition.png` and `frames/sc5-transition.png`: the box slides | fewer than 5 intermediate frames; a jump; the result differs between two builds (F6) | 0001 F7 |
| `identity-diff` | enter, exit, update (cell, class, text) and same, matched by id | `plan.txt` Element lines: `+` enter, `-` exit, `~ one update cell ml→mc`; the montage shows hint entering, box two leaving | an Element with the same id is treated as exit plus enter; a text change is missed | 0001 F10 |

## Narration and subtitles

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `hint-speed` | `Speed:` on the title page and `(speed N)`, `(slowly)`, `(quickly)` on one Line | `plan.txt`: `Speech rate: 1.1`, `sc1.l1 (speed 0.99)`, `sc4.l2 (speed 1.05)` | a Line prints a speed that differs from its hint; the speech cache misses after a hint change that should only change the key | 0001 F8 |
| `hint-pause` | `(pause N)`: N seconds before the Line (sc7.l1) | `plan.txt`: `sc7.l1 (pause 0.5 s)`, Line frames 1554 = slide 1509 + lead 30 + pause 15; `obs-onsets.txt` | Line starts at lead without the pause | 0001 F8 |
| `narration-timing` | each Line's audio starts at its scheduled frame | `check.txt` F8: every `offset (frames)` within 1; `obs-onsets.txt`: Line onsets within 0.1 frame of the schedule plus the cached file's own lead-in (Lines that follow a sound within 1.5 s are skipped there; F8 covers them) | an offset above 1 frame; a Line missing from the track. `N/A (silent stand-in)` is correct for a stand-in narrator and wrong for any other build | 0001 F8 |
| `speech-cache` | the committed speech cache hits for every Line: 12 of 12, no model loaded | `obs-cache.txt`: `12 of 12 Lines`, `git status of stories/*/speech-cache: unchanged`; `build.txt` ends with every adapter and `egress: none` | fewer assets than Lines; the build rewrote the cache; a build that needs a model | 0001 F12 |
| `subtitles` | one cue per Line, equal to the narration, in the `.vtt` and in the mp4's `mov_text` stream | `obs-subtitles.txt`: every cue `text equal`, start and end within 1 frame; `check.txt` F2 `12` cues in both | a cue count other than the Line count; a cue text differing by one character; times off by more than 1 frame | 0001 F2 |
| `chapters` | one chapter per Section, titled with it, at its first Scene | `obs-subtitles.txt`: `chapter 2 "A name that stays" starts at frame 549.00, scheduled 549`; `check.txt` F9 | a missing chapter; a wrong title; a start off by more than 1 frame | 0001 F9 |

## The Deck

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `deck` | `deck.html` opens in headless Chromium, steps through slides and fragments, with no page error | `obs-deck.txt`: one line per Scene `ok`, `page errors: 0`; `deck/deck-<scene>-<step>.png` one screenshot per step: read two or three | a page error; a slide with no content; a screenshot that differs from the matching video frame in what is shown | 0001 F3 F4 |
| `notes` | speaker notes equal the narration of the Scene's Lines | `obs-deck.txt`: `notes equal the Lines`; `check.txt` F3 `12` notes compared | one character differs | 0001 F3 |
| `fragments` | one fragment per `show` and `focus` effect, in resolved order; sounds in `data-sounds` | `obs-deck.txt`: `2 fragments (Plan: 2 show/focus)`; `check.txt` F4 `fragments compared: 7`, `sounds carried: 4` | a count that differs from the Plan; two fragments swapped; a sound missing from `data-sounds` | 0001 F4 |

## One source, determinism

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `source-hash` | every output carries the hash of the `.fountain` | `check.txt` F5: `plan.json: equal`, `deck.html data-source-sha256: equal`, `.vtt NOTE: equal`, `mp4 comment: equal`, `17 files match build.json` | a stale output after a source edit that F5 does not name | 0001 F5 |
| `determinism` | two builds of one source give identical frames and audio | `journey.txt` (run with `--journey`): `F6` line and the final `falsifiers hold` | any differing frame (it names the first); the journey stops at the first failure | 0001 F6 |

## The command line

| id | Feature | Observe | Broken when | Spec |
| --- | --- | --- | --- | --- |
| `plan-output` | `tsukuri plan [--timing] [--json]`: Scenes, Elements, effects with intent and resolved frame, identity diff | `plan.txt`; run `plan` twice: identical | two runs differ; an effect without a frame under `--timing` | 0001 F10 |
| `lint-output` | `tsukuri lint`: every problem with line and fix, every absolute time as `info` | `lint.txt`: `0 errors, 1 absolute time listed`; on a scratch story with a mistake: `file:line: error Tag: ...` with a `did you mean` | an error with no line; a story with an error that exits 0 | 0002 F2 F4 F5 |
| `check-output` | `tsukuri check <dir> --source <story>`: one verdict per falsifier | `check.txt`: `8 of 8 falsifiers hold` for the committed story; F6 is the journey's | a falsifier absent; a hold that a mutated build also gets (run one control from `SKILL.md`) | 0001 F1 F9 |
| `adapters` | the build names each adapter with its egress; selection by config file or flag | `build.txt`: seven adapters, `egress: none`; `tsukuri build ... --speech nope` exits 1 with `UnknownSelection` naming the choices | an adapter with undeclared egress; a silent fallback to another adapter | 0001 F14 |
| `failure-loud` | a speech-cache miss stops the build with `SpeechCacheMiss` naming the Line and leaves no output a `check` accepts | scratch copy of the story with one cache file removed: `build` exits 1, `<out>` and `<out>.partial` do not exist | exit 0; a partial `<out>` that `check` accepts | 0001 F12 |
| `standin-build` | `--speech silent --aligner even --cache-dir <dir>` builds offline | `--speech-flags` run: `check.txt` F8 `N/A (silent stand-in)`, F1 still observes the sounds | F8 `N/A` on a real narrator; F1 `N/A` | 0001 F15 |

## Gated by tests, not observed in a run

These falsifiers have no output a user sees; `bun run ready` holds them. A review checks the gate and its control, not this map: 0001 F11 (package boundaries, `check:tiers`), 0001 F13 (adapter contracts), 0001 F16 (no credential in any output, `provider.test.ts`), 0002 F3 (the grammar document is generated: `grammarCopies.test.ts` and the generator test), 0002 F6 F7 (the story builds and `check` passes: the journey).

## Changed path, then drive

| Changed path | Drive |
| --- | --- |
| `packages/core/src/grammar.ts`, `plan.ts`, `docs/grammar/**` | every `anchor-*`, `effect-*` row, `lint-output`, `plan-output`; a scratch story for each anchor the committed story lacks (`anchor-scene`, `anchor-effect`); regenerate the grammar document |
| `packages/core/src/schedule*`, `packages/services/src/lifecycle*`, `packages/render-reveal/src/lifecycle*` | `anchor-*`, `narration-timing`, `transition-*`, `determinism` (`--journey`) |
| `packages/render-reveal/**` | `deck`, `notes`, `fragments`, `transition-*`, `effect-show`, `effect-focus`, `determinism` |
| `packages/capture-chromium/**` | `transition-auto-animate`, `anchor-element`, `determinism` (`--journey`), headroom first (the capture is the heavy step) |
| `packages/sounds-synth/**` | `effect-sound`, `anchor-transition`, `narration-timing` |
| `packages/speech-kokoro/**`, `packages/align-whisper/**`, `packages/cache-fs/**` | `speech-cache`, `narration-timing`, `hint-speed`, `hint-pause`, `failure-loud`, `standin-build` |
| `packages/encode-ffmpeg/**`, `packages/subtitles/**` | `subtitles`, `chapters`, `narration-timing`, `effect-sound` |
| `packages/pipeline/**`, `packages/services/**` | `adapters`, `failure-loud`, `standin-build`, `source-hash`, `speech-cache` |
| `packages/verify/**` | `check-output` and its controls: apply one mutation from `SKILL.md` "Controls" and see its falsifier fail |
| `packages/cli/**`, `packages/lint/**` | `plan-output`, `lint-output`, `check-output`, `adapters` |
| `stories/**` | the whole map on the changed story, `--journey` |
| `bun.lock`, `package.json`, `devenv.nix` | the whole map on `stories/same-id`, `--journey`; licences and the tier gate are in `review-pr` |
| `docs/specs/**`, `AGENTS.md`, `.agents/**`, `tools/quality/**` only | nothing to drive: say so, and read the diff against its claims |
