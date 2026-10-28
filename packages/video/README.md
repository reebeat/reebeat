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

Under the virtual clock the first changed frame follows a Reveal call by a fixed lag, so the schedule commands a slide
change 2 frames before its `slideFrame` for Auto-Animate and 1 frame before for a fade or a cut, and a fragment at the
Plan's `commandFrame`. The commands of one Scene keep their Cue order (a fragment step is the same call for every Cue).

## Tests

`bun run test` in this package runs the pure tests and, in `test/capture.test.ts` and `test/mux.test.ts`, a real
Chromium and ffmpeg on a small hand-written Plan (`test/fixturePlan.ts`) and deck (`test/fixtures/deck/deck.html`).
Both run inside `devenv shell`, which sets `REEBEAT_CHROMIUM`.
