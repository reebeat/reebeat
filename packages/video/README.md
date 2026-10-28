# @reebeat/video

`plan.json` (a Plan with its Timeline) becomes `<name>.mp4` and `<name>.vtt` (spec 0001, M4). The package reads
the Plan and the written deck page; it does not parse a screenplay (`import type` from `@reebeat/core` only).

| Module | What it is |
| --- | --- |
| `vtt.ts`, `ffmetadata.ts`, `audioMix.ts`, `captureSchedule.ts` | Pure functions of a scheduled Plan (`TimedPlan`, from `requireTimeline`): the subtitles, the chapter marks, the audio inputs and filter graph, the Reveal commands per frame. |
| `capture.ts` | `captureFrames(schedule, options)`: a `Stream` of PNG frames from the deck page under the controlled clock (mechanism Hp: `timeweb` virtual clock pre-rolled past `Reveal.initialize`, plus the seek layer in `pageRuntime.ts`). Times out with `CaptureTimeout`. |
| `browser.ts` | The `Browser` service: the only module that imports Playwright (`REEBEAT_CHROMIUM`, `REEBEAT_CHROMIUM_NO_SANDBOX=1`). |
| `mediaTools.ts` | The `MediaTools` service: ffmpeg and ffprobe as child processes. |
| `mux.ts` | `muxVideo(plan, frames, options)`: one ffmpeg run reads the frames on stdin and writes the mp4 into a scratch directory; the mp4 and the vtt are renamed into place only after it exits with 0. |
| `probe.ts` | What the written files show: `decodeGrayFrames`, `firstChangedFrame`, `frameHashes`, `decodeMonoPcm`, `audioOffsetMs`, `probeMedia`. The verify slice reads these. |

## Frame lag

Per frame the capture steps the virtual clock, runs that frame's Reveal commands, seeks the animations and takes the
screenshot. Measured on the real deck package's page (`test/lags.test.ts`), the first frame whose pixels differ (more
than 8 grey levels in 200 pixels) follows the Reveal call by:

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

`CaptureOptions.settleNewAnimations` (the build sets it) waits two real animation frames before the first seek of a
new animation. Turning it off is a recorded manual measurement, not an automated control, because the outcome is not
stable: two launches of the 219-frame fixture differed in 2 frames in one run and in none in another, and a reviewer
saw the raw PNG comparison differ in 3 of 3 runs. No test asserts either outcome.

The automated control of F6 is the clock seam `CaptureOptions.virtualTimeOf`: two captures with a seeded late-running
clock (a different seed each) differ, and two with the same seed are identical (`test/capture.test.ts`). The clock
alone does not move a frame, because the seek layer sets every animation to its frame's time; the seam therefore also
hands the clock's lateness to the seek layer, as a clock that the page's animations follow would.

## Tests

`bun run test` in this package runs the pure tests and, in `test/capture.test.ts` and `test/mux.test.ts`, a real
Chromium and ffmpeg on a small hand-written Plan (`test/fixturePlan.ts`) and deck (`test/fixtures/deck/deck.html`).
Both run inside `devenv shell`, which sets `REEBEAT_CHROMIUM`.
