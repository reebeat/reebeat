---
name: pr-create
description: "Open a tsukuri pull request: the PR body is the report, in eight fixed sections, and the PR opens only when the whole journey is built, `bun run ready` passed on the head and the verify-tsukuri run is attached. Use when a spec's code is finished and a PR is to be opened, or when drafting a PR body for this repository."
---

<!-- Credits: builds on the machine skill `pr` (`skill://pr`), whose Summary, Evidence
     and Merge Danger sections it reuses; the Summary's menu of visuals comes from Dex Horthy's `show-me` skill
     (https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md). New here: the eight
     sections and their order, the opening rule, and the `gh` command (spec 0000, "The PR body is the report").
     Since spec 0010: the number rule, the verify-tsukuri evidence and the tsukuri falsifier controls. The rule that the PR
     body ends with an empty `## Review rounds` which the lead fills is from spec 0000 (item 8 of "The PR body is the report"),
     not from the donor: phibkro/vektorprogrammet-reimagined @ a85bab0ec18553f4e681574bef5523152e904fdc has no pr-create
     skill, and its review-pr only says that the PR body lists the rounds. -->

# Open a pull request

One spec, one branch, one PR (`docs/specs/NNNN-*.md`, `feat/NNNN-<slug>`). The PR carries the spec and its code. The PR body is the report: a reader who has only the body can experience the feature, see what holds it, and judge the risk.

## When to open

Open the PR only when the whole journey of the spec is built, `devenv shell -- bun run ready` exited 0 on the head you are about to push, and (for a change a viewer can see) a `verify-tsukuri` run on that head exists. A fragment is a defect. Do not open the PR to start the review of unfinished work, and do not wait for a merge before starting the next spec (stack the next branch on this one).

Freeze the spec when the PR opens. A later change to the plan is a dated entry in the spec's `Revisions` section, never a silent edit. Before opening: the spec has its `Verify skill:` line, and a PR that adds or changes user-visible behaviour has already edited `.agents/skills/verify-tsukuri/features.md` (the maintenance rule in `AGENTS.md`).

Create a worktree for the branch with `/run/current-system/sw/bin/git worktree add .worktrees/<name> -b <branch> origin/main` (the harness rewrites a bare `git worktree`). Commit by pathspec, Conventional Commits, never `--no-verify`, never set the git identity. The author of the PR does not review it (skill `review-pr`).

## The body: eight sections, in this order

Skip preambles. Use the terms of `GLOSSARY.md`. Read the machine skill `pr` (`skill://pr`) for the Summary visuals, the Evidence tiers and the Merge Danger wording.

**The number rule, for every section.** Every number in the body (a frame offset, a count, a hit rate, a duration, a size) comes with its script, its raw output and its command: a file path under the run directory (or a pasted line of the output) and the command that wrote it. A number with none of these is not evidence; reviewers record it as a medium finding.

1. **Spec**: link to `docs/specs/NNNN-*.md` and the commit of the frozen text, and list its Revisions entries (date and one line each), or write "no revisions".
2. **Journey**: the exact steps that experience the feature, and one line on what is real (what runs for real, what is a stand-in). For a change a viewer can see: `devenv shell -- bun run tsukuri build stories/same-id/story.fountain --out build/same-id`, `check`, then open `build/same-id/deck.html` and `same-id.mp4`; or `bun run journey`.
3. **Summary**: the smallest diagram, tree or diff that shows the change (as in skill `pr`). For a visible change a before and after montage from `frames/` of the run.
4. **Falsifiers**: a table with one row per falsifier of the spec: falsifier, the check that gates it, the negative control that was run, and the observed failure (the command, its exit code and the first relevant output line). A falsifier about the output is observed in the output (a rendered frame, the audio, the Deck, `tsukuri check`'s verdict line), never in the pipeline's memory. Name the determinism result (F6: `bun run journey`) and the speech cache (12 of 12, unchanged) when the change can reach them.
5. **Evidence**: before and after, command output, the `bun run ready` result with the head sha, and the `verify-tsukuri` run: its directory (`~/.local/state/tsukuri-verify/<date>-<label>/`), `REPORT.md`, the feature ids driven and what was seen. State the licence and third-party effect of any new dependency, binary, model or sound (spec 0008's gate and policy, where it exists).
6. **Not run**: checks that were not run and why. Never empty by omission: write "none" when true. A feature-map row not driven goes here.
7. **Merge danger**: one-way or two-way door, and the blast radius (as in skill `pr`). Name the open branches this change forces to rebase.
8. **Review rounds**: the heading `## Review rounds` and nothing under it. The lead fills it from the recorded rounds when the PR passes.

Section headings are `## Spec`, `## Journey`, `## Summary`, `## Falsifiers`, `## Evidence`, `## Not run`, `## Merge danger`, `## Review rounds`.

## Command

Write the body to a file outside the repository (a temporary path), then:

```sh
gh pr create --base main --title "<type>: <summary>" --body-file <body-file>
```

The title is a Conventional Commit subject. Never push to `main`: it is protected, and the required status check is `checks`. Review and merge follow skill `review-pr`. Do not merge your own PR.
