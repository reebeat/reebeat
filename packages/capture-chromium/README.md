# @reebeat/capture-chromium

The `FrameCapturer` of release 1 (spec 0001, design R3): a written Deck and its Plan become a `Stream` of PNG frames,
captured from headless Chromium on a controlled clock. It only emits the frames: the Encoder consumes the stream and
owns the pipe. Nothing leaves the machine (`info.egress` is local).

| Export | What it is |
| --- | --- |
| `chromiumCapturer` | `Layer<FrameCapturer, never, FileSystem \| Path \| ChildProcessSpawner>`. `info.id` is `chromium@<version>+timeweb@<version>`, read from the binary (`--version`) and from `timeweb`'s `package.json` when the layer is built (`chromium@unavailable+timeweb@unavailable` when the machine cannot run it); `info.settings` holds the frame rate, the canvas size, the lag table, the settle flag, the clock origin, the Chromium flags, the screenshot retries and the most screenshots of one frame. `frames(plan)` is the Timeline's `totalFrames` (0 without a Timeline). `capture({ deckDir, plan })` launches one browser in the stream's scope and emits frame 0 to `frames(plan) - 1`; a failure is `CaptureError`, or `AdapterUnavailable` on a machine without the binary |
| `captureSchedule(plan)` | Pure: the Reveal commands per frame (`goToScene`, `stepFragment`), sorted by frame |
| `captureFrames(schedule, options)` | The capture under the controlled clock (mechanism Hp: `timeweb` virtual clock pre-rolled past `Reveal.initialize`, plus the seek layer in `pageRuntime.ts`); `virtualTimeOf` is the seam of the F6 control |
| `Browser` | The service over Playwright: the only module that imports it is `browser.ts`. Its layer looks for `REEBEAT_CHROMIUM` (the binary), `timeweb` and, optionally, `REEBEAT_CHROMIUM_NO_SANDBOX=1` when it is built and settles the outcome |

A missing requirement does not stop the layer: the first `capture` fails with
`AdapterUnavailable { service: "FrameCapturer", adapter: "chromium", requirement }`, where `requirement` is
`env REEBEAT_CHROMIUM`, `binary named by REEBEAT_CHROMIUM` or `package timeweb`. No frame is emitted, there is no
fallback, and the message never names the path.

## Frame lag

Per frame the capture steps the virtual clock, runs that frame's Reveal commands, seeks the animations and takes the
screenshot. Measured on the real reveal.js page (`test/lags.test.ts`), the first frame whose pixels differ (more than
8 grey levels in 200 pixels) follows the Reveal call by:

| Call | Lag (frames) | Commanded at |
| --- | --- | --- |
| scene change, Auto-Animate | 0 (the matched Element's motion starts 2 to 3 frames later) | `slideFrame` |
| scene change, cut | 0 | `slideFrame` |
| scene change, default fade | 1 | `slideFrame - 1` |
| `show` effect | 1 | `fireFrame - 1` |
| `focus` effect | 1 (a `.box` shows a sub-pixel change at the call) | `fireFrame - 1` |
| `sound` effect | no pixels and no command; the sound is mixed at `fireFrame` | - |

The commands of one Scene are the steps of `stepsOf` (`@reebeat/core`, the one definition the Deck, the capture and the
verifier share), in its order: a start for each `show` and `focus`, commanded at the effect's `commandFrame`, and an END
step for each `focus` whose ring ends by its own `until` before the Scene ends, commanded at its `endCommandFrame`
(`endFrame - 1`: the ring leaves by the same one-frame CSS transition, so its lag is the focus start's). A step is the same
call for every effect, the Deck's fragments are in that order, and a start is commanded before an end in one frame. An
effect is told apart from a sound by its own Scene: effect ids are unique per Scene, not in the story (two Scenes may each
have an `s1`). A sound needs no command, however many instances it has. A step is never commanded before its own Scene's
slide change: an effect at `transition.start` has `commandFrame` one before the slide frame, which would step the previous
slide, so it is commanded with the slide change (`max(commandFrame, slide command)`) and appears one frame after its fire
frame, inside the tolerance of F1. The lags above are the capture's own: the lifecycle of the renderer's slide change (when
its Elements move) is the Renderer's declaration (`revealLifecycle`), observed by `@reebeat/verify`.

**Frame rate.** The lags are frames at `capturedFps` (30), the only rate they were measured at. A Plan at another
`settings.fps`, or with `settings.ntsc`, is refused with `AdapterUnavailable` (requirement `settings.fps 30 with
settings.ntsc false`, `service: FrameCapturer`) before a browser starts, rather than a video whose commands are a fraction
of a frame off (`test/rate.test.ts`).

## Settle wait

`CaptureOptions.settleNewAnimations` (the adapter always sets it) waits two real animation frames before the first seek
of a new animation. Turning it off is a recorded manual measurement, not an automated control, because the outcome is
not stable: two launches of the 219-frame fixture differed in 2 frames in one run and in none in another, and a
reviewer saw the raw PNG comparison differ in 3 of 3 runs. No test asserts either outcome.

The automated control of F6 is the clock seam `CaptureOptions.virtualTimeOf`: two captures with a seeded late-running
clock (a different seed each) differ, and two with the same seed are identical (`test/capture.test.ts`). The clock
alone does not move a frame, because the seek layer sets every animation to its frame's time; the seam therefore also
hands the clock's lateness to the seek layer, as a clock that the page's animations follow would.

## Determinism under load (spec 0001, F6)

F6 says two builds of one source on one machine give identical decoded frames and audio. Under load that was not true:
once frames 1200 to 1202 of the real story differed between two builds (the mp4s were 1,171,940 and 1,171,787 bytes, the
audio equal; x264 spreads one changed source frame over its neighbours, so a change in the command frame 1202 shows in
the decoded frames 1200 and 1201 as well), and once Chromium failed with `Page.captureScreenshot: Unable to capture
screenshot`.

**Cause.** A transition that starts in a command frame (`focus`, `next`, a scene change) is a CSS transition of
`transform`, `opacity` or `box-shadow`, which Chromium runs on the compositor thread. The seek layer pauses it and sets
`currentTime` on the main thread, and the main thread is right at the screenshot (read in the page: `paused`,
`pending: false`, `currentTime: 0`). Under load the compositor sometimes still draws the command frame with progress
other than the one that was set: in frame 658 of the real story the label `tag` was drawn partway into its `focus`
transition: it differs from the right frame (progress 0) in 1,213 pixels of the label's 275 x 26 px box, by up to 298
grey levels, and from the frame at progress 33 ms in 2,712 pixels. Six of the seven wrong frames of the micro run were identical in a second screenshot, so
shooting twice does not cure it. Every wrong frame was the command frame; the frames after it were right.
Two more real frames after the seek did not change the rate (4 wrong frames in 3,600 shots, 8 without),
and `--run-all-compositor-stages-before-draw` did not either (6 in 3,600). Whether the compositor's clock or its
copy of the paused state is the stale part is inferred from this, not read from Chromium.

**Fix.** The flag `--disable-threaded-animation` (in `chromiumFlags`, so it is in `info.settings.flags` and in the
cache key) keeps every animation on the main thread, where the seek layer sets it. The lags tests pass unchanged with
it.

**Net below the fix** (`src/stability.ts`). A frame in which an animation is live (`seek` returns how many the document
holds) or a command ran is shot until two consecutive PNGs are byte-identical, at most 5 shots; a frame that never
settles fails the capture with `FrameUnstable` (mapped to `CaptureError`) naming the frame. A still frame is one shot.
The capture logs a warning per re-captured frame and, at the end, `stability: N of M frames checked, R needed a
re-capture`. The net cannot cure the cause above (two wrong shots agree); it catches a frame that moves between two
shots (1 of 2,160 first and second shots without the flag). A `Page.captureScreenshot` that fails with "Unable to
capture screenshot" is called again after 250 ms, at most twice, with a warning; any other failure, and a third
failure, fails the capture at once. `test/stability.test.ts` proves both on a fake page (no browser, so it cannot be
flaky): the first shot is not returned when the next two agree on another, a frame that never settles fails naming the
frame, a still frame is shot once, a transient failure is retried twice and no more.

**Measured** (Chromium 155.0.8059.39, 30 fps, the real `stories/same-id` story of 1,735 frames; "windows" are the 392
frames from 5 before to 25 after every command, which covers all scene changes and effects; per-frame SHA-256 of the PNGs
compared between launches). Loads: A none; B eight busy loops on all cores; C eight busy loops on cores 0 and 1 with
the capture on the same two cores; D as C, with the capture started on cores 2 and 3 and every thread of its process
tree moved to a random core among 0 to 3 every 150 ms (this moves threads against each other and is the load that
reproduced the flake most often). The scripts are scratch, under `/tmp`, not committed.

| Code | Load | Launches | Frames compared | Differing between launches |
| --- | --- | --- | --- | --- |
| before | A | 10 full | 17,350 | 0 |
| before | B | 20 full | 34,700 | 0 |
| before | C | 20 (frames 0 to 1259) | 25,200 | 1 (frame 488, `next`) |
| before | D | 20 windows | 7,840 | 2 (frames 573 and 1546, both command frames) |
| before | D, micro: four commands, 100 rounds each | 3 | 3,600 | 8 |
| after | D, micro, same | 3 | 3,600 | 0 |
| after | D | 30 windows | 11,760 | 0; the same 0 against a quiet launch |

In the 30 launches after the fix the net checked 189 to 192 of the 1,735 frames per launch and never needed a
re-capture.

## Tests

`bun run test` runs them all on a real Chromium (`REEBEAT_CHROMIUM`, set by `devenv shell`); ffmpeg decodes the PNGs.

| File | Proves |
| --- | --- |
| `chromium.test.ts` | the FrameCapturer contract on the tiny fixture deck (`test/fixtures/deck/deck.html`) with a negative control (a miscounting capturer fails C2 only); the adapter's declaration; `AdapterUnavailable` on first use for a missing variable and a binary that does not run |
| `capture.test.ts` | the lags, a shifted command, two launches giving identical frames, and the jittered-clock control (F1, F6, F7) |
| `lags.test.ts` | the same lags on the real reveal.js page (`render-reveal`) built from `test/fixtures/lags.fountain` |
| `stability.test.ts` | the net below the F6 fix on a fake page, no browser: a frame is shot until two consecutive PNGs agree (control: one shot returns the first), a still frame is shot once, an unstable frame fails with `FrameUnstable` naming it, a transient screenshot failure is retried twice and no more |
| `schedule.test.ts` | `captureSchedule`, a pure function |
| `boundaries.test.ts` | the manifest and an import scan of `src` (Playwright only in `browser.ts`; no other adapter) |

`test/realDeck.ts` and `lags.test.ts` use `@reebeat/render-reveal` and `@reebeat/sounds-synth`, two other adapters:
the lags are a property of the pair. The tier check lists those two `devDependencies`; the test should move to a
package that may depend on adapters. The one suppression is the Promise adapter in `src/browser.ts` (`EX-0040` in
`tools/quality/effect-exceptions.json`).
