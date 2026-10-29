---
name: review-pr
description: "The automated pull-request loop for reebeat: independent reviewers judge the plan, the implementation and their agreement, run the verify-reebeat skill on the head and keep it true, a fixer addresses findings, each round is recorded on the PR, and a passing PR is merged. Use when a PR is ready for review, when asked to review or merge a PR, or when a review round finishes."
---

<!-- Provenance: adapted from phibkro/vektorprogrammet-reimagined @ a85bab0ec18553f4e681574bef5523152e904fdc
     (.agents/skills/review-pr/SKILL.md). Deviations: the donor's database verification skills and formal-verification job are
     replaced by `verify-reebeat` and `bun run ready`; the falsifiers are observed in the rendered Video, audio and Deck; the
     record header (Author, Reviewers, Checked) and its check, the number rule, the worktree and memory rules are new here
     (spec 0009, Revisions in specs 0000 and 0009). -->

# Review and merge a pull request

The lead (the session that owns merges) runs this loop. Reviewers and fixers are separate agents, so the one who judges a change never wrote it. The binding contracts are `docs/specs/0000-development-lifecycle.md` and `docs/specs/0009-review-and-verify-skills.md`.

```text
round 1..n:
  reviewers (independent, read-only on product code) → findings with severity
  pass?  → merge
  else   → fixer addresses every finding (incl. skill maintenance) → push → next round
stop:   after round 3, unless an open finding is critical or high (then keep going);
        a stop without a pass is reported to the operator, never merged
```

## 1. Prepare

- A PR carries its spec and its code together. The spec is frozen when the PR opens; later changes to it are dated entries in its Revisions.
- One detached worktree per reviewer or fixer role, with the system git (the harness rewrites a bare `git worktree` into `omp worktree`, which once copied `.worktrees/` into itself, 189 to 215 GB): `/run/current-system/sw/bin/git worktree add --detach .worktrees/pr-$N-<role> origin/<head branch>`. Then `devenv shell -- bun install --frozen-lockfile`. Remove each one when its role ends.
- Read the machine before any heavy job (`bun run ready`, a capture, `--journey`): `verify-reebeat/scripts/headroom.sh` checks `MemAvailable` after the job's demand (at least 20% of RAM), swap-in (under about 1,000 pages per second), memory PSI `full` avg60 (under 10%, never avg10) and the load average (under the CPU threads), and refuses otherwise. One capture at a time on this machine.
- Read the PR body, its spec in `docs/specs/` (falsifiers, `Verify skill:` line, Revisions), and `git diff --stat origin/main...HEAD`.

## 2. Review round: two independent reviewers, in parallel

Give each reviewer the PR number, the worktree, the spec, and this section. Reviewers do not edit product code and do not push or comment; they report. **The author of a PR is never one of its reviewers**, and a review the author records about their own PR does not pass (`record-round.sh` refuses it). Every reviewer judges three things and says which it checked:

- **(a) The plan**: the spec is the right problem, journey and falsifiers, and its Revisions explain each change made while building.
- **(b) The implementation**: it is correct, the gates are green, every control was shown.
- **(c) Their agreement**: the code does what the spec with its Revisions says. **Undeclared scope, a falsifier with no test or run that can fail, or a silent change to the plan (a change with no dated Revisions entry) is a finding of medium or above.**

**Verification reviewer** (mainly (b), and the evidence side of (c)).

1. In the detached worktree run `devenv shell -- bun run ready`: it must exit 0 on the head. Record the head sha and the summary.
2. Run skill `verify-reebeat` on the head: `run.sh pr-$N` (with `--journey` when the change reaches schedule, render, capture, sounds, encoding or a story), and every row of its feature map that its "Changed path, then drive" table names for the diff. Read the montages and Deck screenshots yourself. Keep the run directory and cite files from it.
3. **Every number needs its script, its raw output and its command.** For each number in the PR body, the spec's evidence or a report (a frame offset, a count, a duration, a hit rate), find the file and the command that produced it. A number with no script, no raw output or no command is a finding of medium: two PRs (a spike and the studio scaffold) failed review for exactly this on 2026-10-29.
4. Check the PR body's falsifier table against the branch: for each falsifier, the gate that holds it and the negative control; re-run the control where it is cheap (a scratch change in the worktree, undone afterwards). A control that was not shown, or does not fail as the table says, is a finding.
5. **Keep the verification skill true.** For each changed user-visible behaviour, `.agents/skills/verify-reebeat/features.md` must describe it (how to observe, what counts as broken), the spec's `Verify skill:` line must name the row, and the path table must map the changed paths. A gap is a finding (`maintenance`); a row that describes behaviour the code no longer has is a finding of the severity of the behaviour it hides.
6. Read CI on the head (`gh pr checks <n>`): `checks` must be green.

**Conformance reviewer** (mainly (a) and (c)).

1. Is the spec the right problem? The journey is experienceable from the PR body, and each falsifier has a gate and a control that can fail. Does the diff match the spec and its Revisions? List anything built that the spec does not name, and anything the spec names that is not built.
2. The repository rules in `AGENTS.md`: one source per fact, every suppression has a registry entry (a new entry needs a retirement trigger), native Effect, the tier gate (`bun run check:tiers`: a new package is in `tools/quality/tiers.ts`), no secret, personal or course-private data in code, logs, fixtures or evidence (the repository is public).
3. **Determinism (F6).** A change to the schedule, the renderer, the capture, the sounds or the encoder: two builds of `stories/same-id` give identical frames and audio (`journey.txt` from the run, never a claim).
4. **The speech cache stays at 12 of 12.** A change to a story's narration text, a Line's hint, the title page's speed, the voice or the aligner settings changes the cache key; the PR then carries refilled assets (provenance files included) and no stale or unused one (`packages/cli/test/speechCache.test.ts`), or says it does not. `obs-cache.txt` says `12 of 12` and the cache is unchanged by the build.
5. **Licences and third parties.** A new or changed dependency, binary, model, font or sound: its licence and what it sends out (egress) are recorded, no GPL, AGPL, SSPL or unknown licence enters `bun.lock`, and ffmpeg stays a spawned process, never linked or bundled. Where spec 0008 has landed (`docs/design/third-party.md`, `tools/quality/third-party-licences.json`), `bun run test` holds the lock to its policy: check the line added for each new package. Copied code carries its provenance.
6. Plan and agreement as above: (c) findings are medium or higher.

### Severity

| Severity | Meaning | Examples |
| --- | --- | --- |
| critical | a leaked secret or personal data, a broken `main` once merged, a GPL or unknown licence in the lock | a key in a fixture; a gate that always passes |
| high | a spec falsifier is not met | a control that does not fail; `ready` red on the head; an effect observed more than 1 frame from its resolved frame; two builds that differ |
| medium | a rule of `AGENTS.md` broken, evidence that does not match the branch, any (c) finding, a number with no script, raw output and command, a verification skill out of step | undeclared scope; a falsifier with no control; a Revisions entry missing; a feature map missing a changed behaviour; a report quoting a number from memory |
| low | clarity or maintainability with no behavioural effect | a misleading name or comment |
| nit | taste | none |

Each finding: severity, file:line or run path, what is wrong in one sentence, and the evidence (command and output).

## 3. Decide

**Pass** when all of these hold: no open finding of medium or above; CI green on the head; `bun run ready` exits 0 on the head; every falsifier has a shown control; the `verify-reebeat` evidence exists for every row the change maps to. Low and nit findings go into the merge comment, or are fixed if cheap.

- **Merge a passing PR** with `.agents/skills/review-pr/merge.sh <n> "<type>: <summary>"` from the main checkout (squash, title `<type>: <summary> (#<n>)`). It refuses (exit 4) unless a round recorded by `record-round.sh` passed the PR's current head, waits for CI green on that head (exit 1 when not green), and merges only that head (`--match-head-commit`). If `main` moved since the head was reviewed, it computes the expected tree with `git merge-tree --write-tree origin/main <reviewed head>` and refuses on conflicts (exit 2) or on files that both changed (exit 3): then rebase, require CI green on the rebased head, and record a new round on it. After a rebase without overlap, `git rev-parse HEAD^{tree}` must equal the expected tree that `merge.sh` printed.

**Otherwise**, start a fixer: a separate agent in the PR's worktree, with the findings verbatim. It fixes the code, the spec only through a dated Revisions entry, and for `maintenance` findings the verification skill itself (feature map, path table). It commits, pushes, and reports. Then the next round, with fresh reviewers.

## 4. Iteration limit

- Rounds 1 to 3: iterate until the PR passes.
- After round 3: continue only while an open finding is **critical or high**. If only medium or lower findings remain, stop: do not merge; report the PR, the open findings and the rounds to the operator.
- A finding that the same fix has failed twice is reported at once, whatever the round.

## 5. Record

Every round is recorded on the PR, so the review is visible where the change is (the repository is public) and outlives the agents' transcripts. The lead posts it with `.agents/skills/review-pr/record-round.sh <n> <round> <pass|changes> <body-file>`: a GitHub review (comment) headed by the marker `<!-- review-round n=<round> head=<sha> verdict=<pass|changes> -->`, with the head read from GitHub. `merge.sh` reads the marker, so a PR without a passing record on its head cannot be merged.

The body file starts with exactly these three lines (`check-record.sh` refuses the record with exit 65 otherwise):

```text
Author: <who wrote the change>
Reviewers: <name>[, <name>]...
Checked: plan, implementation, agreement
```

`Checked` names exactly the parts (a), (b), (c) that the reviewers judged; a `pass` must name all three, and its `Reviewers` must not include the `Author`. Then come the findings with severity, what the fixer changed (commits), and the evidence: commands, output and the run directory paths.

A small change that needs no independent reviewers (docs, a one-line fix) still gets one round, with one reviewer who is not its author. The record says who reviewed and what was checked, never that more happened than did.

The PR body lists the rounds (number, head, verdict) under `## Review rounds` once the PR passes.
