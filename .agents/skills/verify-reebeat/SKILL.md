---
name: verify-reebeat
description: "Build a reebeat story into a scratch directory and observe what a viewer gets: the resolved anchors in the video frames, the audio onsets, the subtitles and chapters, the Deck in headless Chromium, the speech cache, the CLI output, and determinism, then keep the evidence outside the worktree. Use to verify a change to the compiler or a story, to review a pull request, or whenever behaviour a user can see may have changed."
---

<!-- Provenance: the structure (launch, check, drive from a feature map, evidence outside the worktree, clean up) is adapted from
     phibkro/vektorprogrammet-reimagined @ a85bab0ec18553f4e681574bef5523152e904fdc (.agents/skills/verify-vektorprogrammet/SKILL.md);
     the drift check (a test that pins the map to the code and the specs) from .agents/skills/verify-membership-writes. The scripts,
     the feature map and the observations are new here (spec 0010). -->

# Verify reebeat

You are reading this cold. reebeat's output is a Video, a Deck and a WebVTT file. `reebeat check` reads those files and says which falsifiers hold. This skill does the other half: it **looks** at the same files with other tools (ffmpeg, ffprobe, headless Chromium), so that a defect in a check cannot hide a defect in the output. Read `AGENTS.md` first (devenv for everything, no `--no-verify`, never set the git identity).

```text
scripts/run.sh <label> [--journey]
   headroom ─▶ plan --timing ─▶ lint ─▶ build (scratch dir) ─▶ check ─▶ frames ─▶ onsets ─▶ subtitles+chapters ─▶ Deck ─▶ cache
                                                                                                         └─ with --journey: build twice, compare (F6)
   every step: its command and raw output in <run>/<step>.txt; REPORT.md lists exit codes and SHA-256 of every file
you:   read the images and the step files, drive the rows of features.md that the change touches, run a control, write REPORT.md's findings
scripts/cleanup.sh <run>   ─▶ stops leftover Chromium, removes half-written builds, keeps the evidence
```

Paths are relative to `.agents/skills/verify-reebeat/`. The feature map, `features.md`, is the list of what to observe and what counts as broken. It is part of the contract: a PR that adds or changes user-visible behaviour updates it in the same PR.

## Run

```sh
.agents/skills/verify-reebeat/scripts/run.sh pr-14 --journey     # the checkout you are in
REEBEAT_VERIFY_TREE=/path/to/worktree scripts/run.sh main        # another checkout (never a dirty one someone else uses)
```

- **Headroom first.** `scripts/headroom.sh` launches only if all four hold (the operator's limits of 2026-10-29): `MemAvailable` after the job's expected demand (`REEBEAT_VERIFY_DEMAND_MIB`, default 4096, an assumption not a measurement) is at least 20% of RAM; swap-in over a 10 s sample is under 1,000 pages per second; memory PSI `full` avg60 is under 10 (never gate on avg10); the 1-minute load is under the number of CPU threads. It also needs 2 GiB of free disk and prints I/O pressure without gating on it. `REEBEAT_VERIFY_FORCE=1` continues past a shortage and `headroom.txt` records it. Back off a running job if `full` avg60 stays above 20% or swap-in stays over the limit for a minute. A capture of `stories/same-id` is 1,664 frames in Chromium: about 70 s alone; `--journey` builds twice and takes about four minutes. Run one at a time; wait for another heavy job rather than forcing.
- **Supervise it.** Use the harness's supervisor with a name for anything that can pass the tool deadline (`--journey`), never `nohup`, `setsid` or `&`.
- It re-enters `devenv shell` when needed (`REEBEAT_CHROMIUM` unset). In a fresh worktree run `devenv shell -- bun install --frozen-lockfile` first.
- Another story or the stand-ins: `--story stories/x/story.fountain`, `--speech-flags "--speech silent --aligner even" --cache-dir <dir>`. A story whose narration text changed has no speech cache entry: either refill it (`--refresh-speech` needs the Kokoro model and whisper model) or use the stand-ins; say which in the report.
- Worktrees: create them with `/run/current-system/sw/bin/git worktree add`. The harness rewrites a bare `git worktree` into `omp worktree`, which once copied `.worktrees/` into itself (189 to 215 GB).

The run directory is `~/.local/state/reebeat-verify/<date>-<label>/` (`REEBEAT_VERIFY_ROOT` overrides the root; a label already used that day is refused, evidence is never overwritten). It is outside every worktree and `git clean`. The build itself is `build/<name>/` inside it (about 1.3 MB), so the files that were observed stay.

## What each step shows

| Step file | Command | Read it for |
| --- | --- | --- |
| `plan.txt`, `lint.txt` | `reebeat plan --timing`, `reebeat lint` | the resolved frame of every effect; errors with lines; absolute times |
| `build.txt`, `check.txt` | `reebeat build`, `reebeat check` | seven adapters with egress; one verdict per falsifier (F1 to F5, F7 to F9; F6 is the journey's) |
| `obs-frames.txt`, `frames/*.png` | `observe.ts frames` | montages (three tiles: resolved frame -1, 0, +1) for each effect, each slide change, each Auto-Animate transition (frames +4, +12, +20) |
| `obs-onsets.txt` | `observe.ts onsets` | ffmpeg `silencedetect` on the mp4: each sound at its fire frame, each Line at its scheduled start plus the first onset of its own cached audio; anything within 1.5 s after a sound is skipped (silence cannot separate it; `check` F1 and F8 cover it) |
| `obs-subtitles.txt`, `obs/ffprobe.json` | `observe.ts subtitles` | the `.vtt` against the Plan (text, times), the mp4 streams, the chapters |
| `obs-deck.txt`, `deck/*.png`, `deck/deck.json` | `observe.ts deck` | the Deck in headless Chromium: every slide, every fragment step, notes, `data-sounds`, page errors |
| `obs-cache.txt` | `observe.ts cache` | assets used against Lines (12 of 12 for `same-id`), and that `git status` of the speech cache is unchanged |
| `journey.txt` | `reebeat journey` | build, check, build again, F6 compare |

`observe.ts` exits 1 when an observation disagrees with `plan.json`; `run.sh` prints `VERIFY OK` or `VERIFY FAILED`. A failing step stays failed: record why, keep the files, do not loosen a threshold to pass.

## Drive

1. Pick the rows of `features.md` from the changed paths (its last table: `git diff --name-only origin/main...HEAD`). Every row in that table's cell is a feature to observe.
2. **Look at the pictures.** Read at least one montage per changed anchor kind and two Deck screenshots. A montage has three tiles; the effect's visible step belongs at the middle tile or the one after it. `check` computes the step from pixels; you confirm it with your eyes and say what you saw.
3. **Features the story lacks** (`anchor-scene`, `anchor-effect`, a new verb): write a scratch story under the run directory and build it with the stand-ins. Never add a feature to `stories/same-id` only to verify it.
4. **Controls.** For a PR that changes a check or a falsifier, show the check fails on a defect. Copy a finished build into `<run>/control/` and mutate the copy, never the checkout:
   - one word of the source edited after the build: `reebeat check <copy> --source <edited story>`: F5 fails;
   - `deck.html` of the copy with one note character changed: F3 fails naming the slide;
   - the `.vtt` of the copy with one cue text changed: F2 fails;
   - a cache file removed in a scratch copy of the story: `reebeat build` exits 1 with `SpeechCacheMiss` naming the Line and writes no `<out>`;
   - `--speech nope`: exit 1 with `UnknownSelection` naming the choices.
5. Write the findings into `REPORT.md` under its last heading: each feature id you drove, what you observed (file and line), what you did not drive and why.

## Evidence rules

- **Every number needs its script, its raw output and its command.** A frame offset, a count or a duration in a report, an issue or a PR body comes from a file in the run directory that you name, produced by a command you quote. A number typed from memory or from a summary is a finding (two PRs failed review for this on 2026-10-29).
- **Observe the committed content on a clean tree**: the head of the PR in its own worktree, not a working directory with uncommitted changes (`meta.txt` records `git status`).
- **A stand-in is named.** A build with `--speech silent` is narration-silent: F8 is `N/A` there. Say so; never report it as verified narration.
- **What the run cannot see.** The synthetic voice is not judged for quality. Kokoro and whisper are not re-run (the cache hits); a change to either needs `--refresh-speech` on a machine that has the models, and is a different run. Audio output through a speaker, the browser's autoplay policy, and other Chromium versions are not observed.
- `check` has the same author as the code it checks; the observations here share no code with it. When they disagree, the disagreement is the finding.

## Clean up

```sh
.agents/skills/verify-reebeat/scripts/cleanup.sh ~/.local/state/reebeat-verify/<date>-<label> [--worktree <path>]
```

It stops only the process groups recorded in `<run>/pids.txt` (`<pid> <start time>` per line). `run.sh` records each step, which runs in its own session; `observe.ts` records the Chromium it launches, because Playwright starts it detached, in a group the step does not contain. A live process with another start time is a reused pid and is left alone. **Not covered:** a Chromium that `reebeat build` or `journey` launches (inside the product code) is not recorded, so after an interrupted build a leftover browser has to be found by hand. `cleanup.sh` never searches for processes by name or pattern (`pgrep -f`, `pkill`, `killall`): it once would have killed unrelated shells. `tools/quality/test/cleanup.test.ts` shows an unrelated lookalike and a reused-pid group leader surviving and an interrupted run's real Chromium being stopped. It also removes `*.partial` builds, and with `--worktree` removes the detached review worktree if it is clean. The run directory and its REPORT.md stay; it prints what is kept. Safe to run twice. Delete a run directory only after its numbers are in the PR or the review record.

## Keep this skill true

- Add the feature row in the same PR as the behaviour (`features.md`), with how to observe it and what counts as broken, and add its id to the `Verify skill:` line of the spec. `tools/quality/test/verifyMap.test.ts` fails when a spec names an unknown id, when a verb, sound, anchor kind, Element event or transition of `@reebeat/core` has no row, and when a row lacks a cell.
- A reviewer runs this skill on the head. A map that no longer describes the code is a finding of the severity of the behaviour it hides, at least medium (`maintenance`).
- A row you could not observe stays in the map with the missing precondition written in "Broken when"; never delete a row because it is hard.
- What was exercised when this skill was written (2026-10-29, `main` at `f7c3488`, run `main` with `--journey`: about 4 minutes, `VERIFY OK`; REPORT.md of that run lists its findings and the six controls it ran by hand). Not exercised: a PR head fetched through `gh`, a story other than `same-id`, the stand-in build (`--speech-flags`), a scratch story for `anchor-scene` and `anchor-effect`, and `--refresh-speech` (no model on the machine). Treat those paths as untested until a run says otherwise.
