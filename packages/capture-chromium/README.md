# @reebeat/capture-chromium

The `FrameCapturer` of release 1 (spec 0001, design R3): a written Deck and its Plan become a `Stream` of PNG frames,
captured from headless Chromium on a controlled clock. It only emits the frames: the Encoder consumes the stream and
owns the pipe. Nothing leaves the machine (`info.egress` is local).

| Export | What it is |
| --- | --- |
| `chromiumCapturer` | `Layer<FrameCapturer, AdapterUnavailable, FileSystem \| Path \| ChildProcessSpawner>`. `info.id` is `chromium@<version>+timeweb@<version>`, read from the binary (`--version`) and from `timeweb`'s `package.json` when the layer is built; `info.settings` holds the frame rate, the canvas size, the lag table, the settle flag, the clock origin and the Chromium flags. `frames(plan)` is the Timeline's `totalFrames` (0 without a Timeline). `capture({ deckDir, plan })` launches one browser in the stream's scope and emits frame 0 to `frames(plan) - 1`; every failure is `CaptureError` |
| `captureSchedule(plan)` | Pure: the Reveal commands per frame (`goToScene`, `stepFragment`), sorted by frame |
| `captureFrames(schedule, options)` | The capture under the controlled clock (mechanism Hp: `timeweb` virtual clock pre-rolled past `Reveal.initialize`, plus the seek layer in `pageRuntime.ts`); `virtualTimeOf` is the seam of the F6 control |
| `Browser` | The service over Playwright: the only module that imports it is `browser.ts`. Its layer checks `REEBEAT_CHROMIUM` (the binary), `timeweb` and, optionally, `REEBEAT_CHROMIUM_NO_SANDBOX=1` |

A missing requirement is `AdapterUnavailable { service: "FrameCapturer", adapter: "chromium", requirement }` when the
layer is built: `env REEBEAT_CHROMIUM`, `binary named by REEBEAT_CHROMIUM` or `package timeweb`. There is no fallback
and the message never names the path.

## Frame lag

Per frame the capture steps the virtual clock, runs that frame's Reveal commands, seeks the animations and takes the
screenshot. Measured on the real reveal.js page (`test/lags.test.ts`), the first frame whose pixels differ (more than
8 grey levels in 200 pixels) follows the Reveal call by:

| Call | Lag (frames) | Commanded at |
| --- | --- | --- |
| scene change, Auto-Animate | 0 (the matched Element's motion starts 2 to 3 frames later) | `slideFrame` |
| scene change, cut | 0 | `slideFrame` |
| scene change, default fade | 1 | `slideFrame - 1` |
| `next` | 1 | `fireFrame - 1` |
| `focus` | 1 (a `.box` shows a sub-pixel change at the call) | `fireFrame - 1` |
| `sfx` | no pixels; the sound is mixed at `fireFrame` | `fireFrame` |

The commands of one Scene keep their Cue order (a fragment step is the same call for every Cue).

## Settle wait

`CaptureOptions.settleNewAnimations` (the adapter always sets it) waits two real animation frames before the first seek
of a new animation. Turning it off is a recorded manual measurement, not an automated control, because the outcome is
not stable: two launches of the 219-frame fixture differed in 2 frames in one run and in none in another, and a
reviewer saw the raw PNG comparison differ in 3 of 3 runs. No test asserts either outcome.

The automated control of F6 is the clock seam `CaptureOptions.virtualTimeOf`: two captures with a seeded late-running
clock (a different seed each) differ, and two with the same seed are identical (`test/capture.test.ts`). The clock
alone does not move a frame, because the seek layer sets every animation to its frame's time; the seam therefore also
hands the clock's lateness to the seek layer, as a clock that the page's animations follow would.

## Tests

`bun run test` runs them all on a real Chromium (`REEBEAT_CHROMIUM`, set by `devenv shell`); ffmpeg decodes the PNGs.

| File | Proves |
| --- | --- |
| `chromium.test.ts` | the FrameCapturer contract on the tiny fixture deck (`test/fixtures/deck/deck.html`) with a negative control; the adapter's declaration; `AdapterUnavailable` for a missing variable and a binary that does not run |
| `capture.test.ts` | the lags, a shifted command, two launches giving identical frames, and the jittered-clock control (F1, F6, F7) |
| `lags.test.ts` | the same lags on the real reveal.js page (`render-reveal`) built from `test/fixtures/lags.fountain` |
| `schedule.test.ts` | `captureSchedule`, a pure function |
| `boundaries.test.ts` | the manifest and an import scan of `src` (Playwright only in `browser.ts`; no other adapter) |

`test/realDeck.ts` and `lags.test.ts` use `@reebeat/render-reveal` and `@reebeat/sounds-synth`, two other adapters:
the lags are a property of the pair. The tier check lists those two `devDependencies`; the test should move to a
package that may depend on adapters. The one suppression is the Promise adapter in `src/browser.ts` (`EX-0040` in
`tools/quality/effect-exceptions.json`).
