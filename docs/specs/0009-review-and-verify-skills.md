# 0009 Review and verify skills

Status: **plan** (frozen when its PR opens). Date: 2026-10-29. Decided by: the operator (request of 2026-10-29: adopt vektorprogrammet-reimagined's PR-creation and PR-review procedures in reebeat, personalised, and keep a verification skill up to date).
Builds on [spec 0000](0000-development-lifecycle.md) (the road: spec, code, PR, review, merge). Number 0009 because 0004 (state machines), 0005 and 0006 (named in 0004's Revisions), 0007 (spike, PR #11) and 0008 (licence, PR #13) are taken.
Verify skill: none, process and agent tooling only: it changes no output of `reebeat`; the skill it adds is proved by the run in its PR.

## Problem

Spec 0000 copied the donor's `review-pr` once (at `797e9e4`) and wrote `pr-create`. Since then the donor's loop gained the rule that reviewers judge the plan, the code and their agreement together (already ported by spec 0000's Revisions of 2026-10-28), and it has a verification skill for each feature set. reebeat has none: a reviewer runs `bun run ready` and reads `reebeat check`, whose author also wrote the code under test. Two reviews on 2026-10-29 (spike PR #11, studio PR #3) failed because a number in the report had no script, raw output or command. A review that the author recorded about their own PR was accepted as a round. A worktree was created with the harness's rewritten `git worktree`, and `omp worktree` copied `.worktrees/` into itself (189 to 215 GB). Nothing says to read memory pressure before a capture.

## Goal

1. `pr-create` and `review-pr` carry every improvement of the donor since `797e9e4` (the donor's current head is `a85bab0`) and the lessons above, personalised to reebeat: falsifiers observed in the rendered MP4, audio and Deck (F1 to F9 of spec 0001 and later specs), the journey `reebeat journey stories/same-id/story.fountain`, determinism (F6), the speech cache at 12 of 12, the licence and third-party gate, the tier gate.
2. A skill `verify-reebeat` that builds a story into a scratch directory, runs `reebeat check`, and **looks** at the output with other tools: frames at the resolved anchors (ffmpeg), audio onsets, the VTT and the Deck in headless Chromium. It has a feature map: anchors, transitions, sounds, subtitles, Deck fragments, chapters, lint, plan output, each with how to observe it and what counts as broken. Evidence lives under `~/.local/state/reebeat-verify/<date>-<label>/`; the skill cleans up.
3. **The maintenance rule**, in `AGENTS.md` and checked by `review-pr`: a PR that adds or changes user-visible behaviour updates the feature map in the same PR, and a reviewer uses the skill.
4. **A cheap test** that holds the map to the specs and the code: every spec from 0009 on carries a `Verify skill:` line that names feature ids of the map or says `none` with a reason; the ids exist; every verb, sound, anchor kind, Element event and transition of `@reebeat/core` has a row.
5. A review record names its author and its reviewers, and a `pass` by the author is refused by the script that posts it.

## Journey

```text
a contributor changes how an anchor resolves
  1. edits the spec: Verify skill: anchor-word, anchor-element
  2. edits .agents/skills/verify-reebeat/features.md in the same PR (a row per behaviour)
  3. bun run test            fails if the spec names an id the map lacks, or a new verb has no row
  4. run.sh pr-N --journey   builds the story, runs check, looks at frames, onsets, VTT, Deck; evidence in ~/.local/state/reebeat-verify/
  5. gh pr create            the body cites the run directory; numbers come with script, output and command
  6. review-pr               a reviewer who is not the author reruns step 4 on the head, reads the montages, finds the map true or says `maintenance`
  7. record-round.sh         refuses a header without Author, Reviewers, Checked, and a pass whose reviewers include the author
```

What is real: `run.sh` builds and checks the committed story with the real adapters (speech from the committed cache, Chromium, ffmpeg). What is a stand-in: nothing in the run; features the story lacks are verified on scratch stories with the offline stand-ins, and the skill says so.

## Constraints and values

- One source per fact. The feature map is the one list of what a viewer can observe; the spec's `Verify skill:` line points into it; `review-pr` and `AGENTS.md` point at the skill and do not copy the map.
- The observations share no code with `reebeat check`. When they disagree, the disagreement is the finding. Thresholds are measured, not guessed (the onset check tolerates 2 frames and skips onsets that silence cannot separate: measured on `main`, see the PR).
- Every number in a report has its script, its raw output and its command. `run.sh` writes the command and the raw output of every step as files and lists SHA-256 in `REPORT.md`.
- Evidence is never inside a worktree and never overwritten. Heavy jobs read memory PSI, load and disk first (`headroom.sh`), one at a time.
- Scripts are TypeScript and shell (the repository's convention: Python only for throwaway work). They reuse the repository's own CLI, its Chromium (`REEBEAT_CHROMIUM`), Playwright and ffmpeg; they add no dependency.
- Public repository: no secret, personal or course-private data in a skill, a run or a PR.

## What is built

| Part | Content | Reused from |
| --- | --- | --- |
| `pr-create` | the eight sections kept; the number rule, the verify run in Evidence, reebeat falsifier observation, determinism and cache lines, `Verify skill:` and feature-map rule, worktree rule, author never reviews | skill `pr-create` of spec 0000; donor PR conventions @ `a85bab0` |
| `review-pr` | verification reviewer runs `verify-reebeat` and keeps it true (`maintenance`); conformance reviewer checks determinism, the speech cache, licences, tiers; severity table with the reebeat examples and the number rule; worktree and memory rules; the record header | donor `review-pr` @ `a85bab0` |
| `record-round.sh`, `check-record.sh` | `Author`, `Reviewers`, `Checked` header validated before posting (exit 65) | donor `record-round.sh` |
| `merge.sh` | unchanged (copied from the donor, exit codes 1 to 4); the SKILL.md text adds the tree check after a rebase | donor `merge.sh` |
| `verify-reebeat` | `SKILL.md`; `features.md` (the map and the changed-path table); `scripts/run.sh`, `headroom.sh`, `observe.ts`, `cleanup.sh` | donor `verify-vektorprogrammet` (structure), `verify-membership-writes` (the drift test) |
| `tools/quality/verifyMap.ts` and its test | the cheap test of Goal 4 | |
| `AGENTS.md` | the maintenance rule; skills listed; worktree and memory rules | |
| Specs 0000 to 0003 | a `Verify skill:` line each and a Revisions entry | |

## Falsifiers

Each has a negative control that is run and shown to fail.

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
| --- | --- | --- | --- |
| V1 | `run.sh main --journey` on `main` exits 0 and its REPORT.md lists a command, a raw output file and a SHA-256 for every step | the run itself | a copy of the build with one note character changed: `observe.ts deck` exits 1; one cue text changed: `subtitles` exits 1; the source edited after the build: `reebeat check` F5 fails |
| V2 | The observed frames, onsets, subtitles and chapters agree with `plan.json` on `main` | `observe.ts` | the same copies as V1; a Line moved 3 frames in a copy of `plan.json`: `onsets` exits 1 |
| V3 | A spec from 0009 on without a `Verify skill:` line fails the test | `verifyMap.test.ts` | a spec text without the line; a line naming an id the map lacks; a `none` without a reason |
| V4 | A verb, sound, anchor kind, Element event or transition of `@reebeat/core` without a row fails the test | `verifyMap.test.ts` | a map text with the `focus` row removed |
| V5 | `record-round.sh` refuses a body without the three header lines, a pass that omits a part of `Checked`, and a pass whose `Reviewers` include the `Author`; it accepts a valid one | `check-record.sh`, `verifyMap`-style test `reviewRecord.test.ts` | each refused case exits 65; the valid case exits 0 |
| V6 | `AGENTS.md` states the maintenance rule and `review-pr` makes a stale map a finding | read in the PR; the reviewer reads both | none (text); a reviewer finds the gap if one rule is missing |
| V7 | `bun run ready` exits 0 on the head | `ready` | the controls of V3 to V5 each fail the `test` step |

## Scope and non-goals

In scope: everything in *What is built*.

Not in scope: running the review loop for this PR itself (the lead starts independent reviewers); a CI job that runs `verify-reebeat` (it needs a browser and 70 s of capture; `bun run journey` already runs in CI); changing any `reebeat` behaviour; the licence and release specs (0008 and later); the studio repository's skills (their own PR); refilling the speech cache.

## Risks

| Risk | Mitigation |
| --- | --- |
| The onset observation is noisy | measured on `main` first: Line onsets agree to within 0.04 frame when compared with the cached audio's own first onset; sounds within 1.5 s after another sound are skipped and named |
| Specs 0004, 0007, 0008 are open and carry no `Verify skill:` line | the test requires the line from 0009 on; earlier specs are checked only where the line exists |
| A vocabulary rename in `@reebeat/core` (spec 0004) breaks the test's import | intended: the test is the drift check; the fix is a row id |
| Playwright is resolved by path from the checkout (the script lives outside every workspace) | the script says so; a missing path fails loudly |

## Revisions

Dated entries. A spec is revised only here; its text above is never edited silently after the PR opens.

- **2026-10-29, built with the plan (none of these changes the journey or a falsifier).**
  1. *Donor diff since `797e9e4`.* `git diff 797e9e4 a85bab0 -- .agents/skills/review-pr` is one change: the plan, the code and their agreement are judged together (10 lines). spec 0000's Revisions of 2026-10-28 had already ported it. `record-round.sh` and `merge.sh` are unchanged in the donor. What is new here therefore comes from the operator's lessons of 2026-10-29 and from the donor's verification skills, not from the loop.
  2. *Onset observation, measured on `main`.* Silence detection on the mixed track does not agree with the Plan's Line start (which is the start of the cached audio file, 0.26 to 0.34 s of lead-in before the first sound) or with whisper's first-word time (up to 9 frames off: an alignment estimate, not an onset). The expected onset of a Line is therefore its scheduled start plus the first onset of its own cached file, found the same way: 9 of 9 unmasked Lines agree within 0.04 frame. A sound or Line within 1.5 s after another sound rides on its tail and is skipped and named (4 of 16 expectations on `same-id`); `check` F1 and F8 cover those. The tolerance is 2 frames.
  3. *Scripts are not linted.* `.agents/skills/*/scripts/**` joins the lint ignore list in `vite.config.ts`: the scripts run under Bun outside every workspace, no tsconfig gives them types, and type-aware lint reported 294 errors on them. They are exercised by the run and its controls.
  4. *The `Verify skill:` rule starts at 0009.* Specs 0004, 0007 and 0008 are open on other branches; a test that required the line in them would break `main` when they merge. The test requires the line from 0009 on and validates it wherever it exists; specs 0000 to 0003 got a line and a Revisions entry. Specs 0004, 0007 and 0008 get theirs when they are next revised.
  5. *`pending`.* The line may say `pending, <reason>` only while the spec's status says `plan`; the test refuses it on a frozen or built spec.
  6. *Evidence of the proof run.* `~/.local/state/reebeat-verify/2026-10-29-main/` (REPORT.md, the step files, `control/`). Controls run by hand on copies: a note character, a cue, a Line moved by 3 frames, a source word edited after the build, a removed cache asset, an unknown selection. Not run: the stand-in build and a scratch story for `anchor-scene` and `anchor-effect` (the machine was under memory pressure; the lead asked for no new heavy job).
  7. *Headroom limits changed after the proof run.* The operator's limits of 2026-10-29 (MemAvailable after demand at least 20% of RAM, swap-in under 1,000 pages per second, memory PSI `full` avg60 under 10, load under the CPU threads) replaced the first gate of `headroom.sh` (PSI `some` avg10 under 10, 4 GiB, load under 80%). The proof run's `headroom.txt` was written by the first version; the script was rerun on the new one and printed `headroom OK`. The demand default of 4,096 MiB is an assumption, not a measurement.
  8. *The admission check fails closed (found by the studio repository's review of its copy of this script, 2026-10-29).* In the first `headroom.sh` an empty or non-numeric reading (a missing pressure file, a load average that did not parse) compared as 0 and passed. A reading that is missing or not a number is now SHORT with its reason; the script reads a fake `/proc` through `REEBEAT_VERIFY_PROC_ROOT` (and `REEBEAT_VERIFY_SAMPLE_SECONDS`, `REEBEAT_VERIFY_NPROC`) so that `tools/quality/test/headroom.test.ts` holds each gate with a control for a missing file, an empty value, a value that is not a number and a value over its limit. The proof run's `headroom.txt` came from the first version.
