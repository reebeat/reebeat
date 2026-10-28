# 0000 Development lifecycle

Status: **spec** (frozen when its PR opens). Date: 2026-10-28. Decided by: the operator, 2026-10-28.
Binding for: every later PR in this repository. Implemented by the PR that carries this file.

## Goal

Every change to reebeat travels one road: **spec → code → PR**, strictly 1:1, and no change reaches `main` without passing the same gates locally, in CI and in a recorded review round. The road is built from tools that already exist (Vite+, Oxlint, Oxfmt, Ultracite, `@effect/tsgo`, gitleaks, commitlint, knip, jscpd, `gh`). What we write ourselves is only what no tool does: the exception registry check, the Effect-family check, the review-round record and the merge gate.

## Journey

```text
contributor (human or agent)
  1. write or pick a spec        docs/specs/NNNN-*.md          the frozen problem and its falsifiers
  2. branch                      feat/NNNN-<slug>              one spec, one branch, one PR
  3. commit                      pre-commit: gitleaks on the staged blobs, then `vp staged` (format and lint --fix)
                                 commit-msg: commitlint (Conventional Commits)
  4. push                        pre-push: the test suite
  5. open the PR                 skill pr-create: the PR body is the report
  6. CI                          .github/workflows/checks.yml runs the same gates as `bun run ready`
  7. review round(s)             skill review-pr: independent reviewers, severity, fixer, recorded on the PR
  8. merge                       .agents/skills/review-pr/merge.sh: refuses without a passing record on the head
```

A reader who clones the repository, runs `devenv shell -- bun install` and then `bun run ready`, sees every gate pass on a clean tree. A reader who then breaks the tree in any of the ways listed under *Falsifiers* sees the matching gate fail.

## Constraints and values

- Correctness by construction: a gate that can be made structural is structural. `main` cannot be pushed to (branch protection), a PR cannot be merged without a passing recorded round on its head (`merge.sh`), an Effect package cannot drift from the `effect` version (family check), a suppression cannot exist without a registry entry (exception check).
- One source per fact. The gate list lives in `package.json` scripts (`ready`) and the table in `AGENTS.md` names each script; CI calls the same scripts and never repeats their commands.
- Reuse, do not hand-roll. Copied files carry their provenance (source repository, commit, what changed).
- Pin exactly. `effect` and every `@effect/*` package at `4.0.6`; TypeScript `7.0.2`; Vite+ `1.2.0`; Bun `^1.4.2` through `devEngines`; Node 24 and gitleaks through devenv.
- Public repository: no secret, no personal data and no course-private material, ever. gitleaks runs on staged blobs before each commit and over the full history in CI.

## What is built

| Part | Content | Reused from |
|---|---|---|
| Toolchain | `vp` (Vite+), Bun, devenv (`devenv.nix`: Bun, Node 24, gitleaks), `package.json` with `catalog` pins, `tsconfig.json` | skill `vite-plus-devenv-effect-monorepo`; `vektorprogrammet-reimagined` @ `797e9e41d96194b9479ff224ac1c40bbc0545888` |
| Lint and format | root `vite.config.ts`: Oxfmt (Ultracite preset); Oxlint with Ultracite `core`, `@effect/tsgo` presets `strict` and `effectNative`, the Effect oxlint plugin (`@phibkro/oxlint-effect-plugin`) with all rules at `error`, the anti-slop plugin limited to the rules that apply (below), `oxlint-plugin-complexity` cognitive complexity at most 15, type-aware through tsgolint | same repository |
| Effect diagnostics | `prepare` script `vp config --no-agent && effect-tsgo patch --typescript --oxlint` (patches the TypeScript 7 language server); `tsconfig.json` plugin `@effect/language-service` with every diagnostic at `error` | same repository |
| Hooks | `.vite-hooks/pre-commit` (gitleaks on staged, then `vp staged`), `commit-msg` (commitlint), `pre-push` (test suite); each re-enters `devenv shell` when the environment is missing | same repository |
| Exceptions registry | `tools/quality/effect-exceptions.json` and `tools/quality/checkEffectExceptions.ts`: every `oxlint-disable`, `eslint-disable`, `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck` in the repository needs a registry entry (scope, reason, native alternatives examined, owner, versions, retirement trigger) and every entry needs a live suppression | same repository |
| Family check | `tools/quality/effectFamily.ts` and its test: `bun.lock` has exactly one `effect` version and every `@effect/*` package is locked at it (`@effect/tsgo` is its own release line) | same repository |
| Anti-slop rules | `tools/oxlint/anti-slop/`: the generic rules and the five Effect rules. Dropped: the database and calendar rules that belong to the donor domain (`no-dev-server`, `no-implicit-date-time-zone`, `no-multi-statement-unsafe`, `no-owned-table-write`, `no-unkeyed-command-row`, `no-zoneless-calendar-interval`) | same repository, which vendors [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) (MIT); keep `LICENSE`, `UPSTREAM.txt`, `provenance.json` and record this copy's deviations |
| Dead code and duplication | `knip` (`knip.json`), `jscpd` (`.jscpd.json`, `threshold: 0`) | same repository |
| Secrets and personal data | `.gitleaks.toml` (default rules; no donor-specific rules); pre-commit on staged, `bun run secrets` over history | same repository |
| One command | `bun run ready` = `vp check`, exceptions check, tests, knip, jscpd, secrets | same repository, minus the web, docs, store and CMS gates |
| CI | `.github/workflows/checks.yml`: on every pull request and on push to `main`, install the pinned devenv, `bun install --frozen-lockfile`, then each gate as its own step; actions pinned by commit | same repository |
| Agent doc | `AGENTS.md` (the SDLC, the gate table with how to run each, the review loop, the exception rule); `CLAUDE.md` contains `@AGENTS.md` only | machine rules |
| Skills | `.agents/skills/review-pr/` (`SKILL.md`, `record-round.sh`, `merge.sh`); `.agents/skills/pr-create/SKILL.md` | review-pr from the donor, adapted; pr-create new, based on the machine skill `pr` |
| Branch protection | `main`: pull request required (no direct pushes, administrators included), required status check `checks`, no force push, no deletion | `gh api` |
| Conventions | Conventional Commits; never `--no-verify`; no git identity changes; Python only for throwaway work | `/srv/share/projects/AGENTS.md` |

### Anti-slop rules kept

Generic (all enabled at `error`): `no-array-filter-map`, `no-chained-type-assertions`, `no-conditional-empty-object-spread`, `no-known-value-widening`, `no-module-mocking`, `no-object-parameters`, `no-reduce-accumulator-copy`, `no-reflect-apply`, `no-reflect-get`, `no-runtime-typeof`, `no-shape-in-symbol-names`, `no-unknown-parameters`, `no-unknown-returns`, `no-unknown-type-aliases`, `no-unsafe-dictionary-type`, `no-widen-then-assert`, `require-readable-spacing`, `require-safety-comment-for-type-assertion`. Effect: `no-manual-effect-error-tag`, `no-manual-tag-comparison`, `no-manual-tagged-construction`, `no-service-constructor-imports`, `prefer-effect-match`. Where Ultracite already enables an identical rule, the repository config does not enable it a second time.

### The PR body is the report (skill `pr-create`)

The skill builds on the machine skill `pr` and fixes the sections, in this order:

1. **Spec**: link to `docs/specs/NNNN-*.md` and the commit of the frozen text.
2. **Journey**: the exact steps that experience the feature (commands or clicks), and one line on what is real.
3. **Summary**: the smallest diagram, tree or diff that shows the change (as in skill `pr`).
4. **Falsifiers**: a table: falsifier, check that gates it, negative control and the observed failure.
5. **Evidence**: before and after, command output, `bun run ready` result with the head sha.
6. **Not run**: checks that were not run and why. Never empty by omission: write "none" when true.
7. **Merge danger**: one-way or two-way door, blast radius.
8. **Review rounds**: empty heading `## Review rounds`; the lead fills it from the records when the PR passes.

### The review loop (skill `review-pr`)

Adapted from the donor. Independent reviewers (a verification reviewer and a conformance reviewer) are read-only on product code; findings carry severity (critical, high, medium, low, nit); a fixer addresses findings; the lead records each round on the PR with `record-round.sh <pr> <round> <pass|changes> <body-file>` (a review comment headed by `<!-- review-round n=<round> head=<sha> verdict=<pass|changes> -->`); `merge.sh <pr> "<type>: <summary>"` squash-merges only the head that has a passing record, after CI is green on that head. Pass means no open finding of medium or above and CI green. After round 3 the loop continues only for critical or high findings; a stop without a pass goes to the operator. A small change with no independent reviewers still gets one recorded round by the lead, named as `lead`, saying what was checked and nothing more.

Donor-specific parts are dropped: the `verify-vektorprogrammet` and `verify-membership-writes` skills, the `Formal verification` job, database worktree notes. The verification reviewer instead runs `bun run ready` on the head in a detached worktree and checks the PR body's falsifier table against the branch.

A PR carries the spec and its code together (plan and build are one step, Revisions 2026-10-28). Reviewers judge three things, and the round record says which they checked: **(a) the plan**: the right problem, journey and falsifiers; **(b) the implementation**: correct, gates green, every control shown; **(c) their agreement**: the code does what the spec with its Revisions says, with no undeclared scope, no unbuilt falsifier and no silent drift. A finding in (c) is medium or higher.

## Scope and non-goals

In scope: everything in *What is built*, committed to `main` by the PR that carries this spec.

Not in scope: any reebeat code (spec 0001 and later), a release process, npm publishing, deployment, a database, browser tests, generated documentation, the store-boundary check, Renovate, and a LICENSE file (the operator deferred the licence; the README says so).

## Falsifiers

Each falsifier has a negative control that is run and observed to fail, with the output recorded in the PR body. A control is a deliberate defect applied to a scratch copy or a throwaway branch and never committed to `main`.

| # | Falsifier (must hold) | Gate | Negative control (must fail) |
|---|---|---|---|
| F1 | `bun run ready` exits 0 on a clean tree of the PR head | `ready` | F2 to F7 each make `ready` exit non-zero where it is the gate |
| F2 | A commit message that is not a Conventional Commit is rejected | `commit-msg` | `git commit -m "stuff"` is refused with the commitlint reason; `git commit -m "chore: x"` is accepted |
| F3 | A lint error in a staged file blocks the commit | `pre-commit` (`vp staged`) | Stage a file with a violation (for example `var x = 1;` or a `console.log` in an Effect file); the commit is refused and the file is unchanged in history |
| F4 | A secret in a staged file blocks the commit | `pre-commit` (gitleaks) | Stage a file holding a synthetic key in a well-known format (written only to the scratch copy); the commit is refused |
| F5 | An `oxlint-disable` without a registry entry fails `ready` | `check:exceptions` | Add `// oxlint-disable-next-line <rule>` without an entry: `bun run check:exceptions` exits non-zero and names the file and line; add the entry: exits 0; remove the directive but keep the entry: exits non-zero |
| F6 | CI runs the gates on every PR and fails when one fails | `checks.yml` | The lifecycle PR shows the green `checks` run; a throwaway PR with a lint violation shows a red `checks` run (PR closed, not merged) |
| F7 | `effect` and every `@effect/*` package share one version | family check | In a scratch copy, change one `@effect/*` entry of `bun.lock` to another version: the check fails and names the package; the test file contains this case |
| F8 | A PR cannot be merged without a passing recorded round on its current head | `merge.sh` | Run `merge.sh` before recording: exit 4. Record a `changes` round: exit 4. Record a `pass` round, push one more commit: exit 4 (head moved). Record `pass` on the final head: merges |
| F9 | `main` cannot be pushed to directly | branch protection | `git push origin HEAD:main` from a scratch clone is rejected by GitHub |
| F10 | Cognitive complexity above 15 and a type-aware rule violation fail `vp check` | Oxlint | A scratch function with complexity 16 fails; a floating Effect (`Effect.succeed(1)` as a statement) fails |

## Constraints on the implementation

- Free on mechanism, specific on behaviour: the scripts may be arranged differently as long as the names `ready`, `check`, `test`, `check:exceptions`, `knip`, `cpd` and `secrets` exist and the journey above holds.
- `tools/quality` is the only workspace that holds code in this PR. Tests prove the exception check, the family check and the diagnostic coverage; they use fixtures written to temporary directories, not files outside the repository.
- No placeholder implementation of reebeat is added. `packages/` holds no package yet (workspace globs may match nothing).
- Every copied file names its source in its header or in a `PROVENANCE.md` beside the copied directory (repository, commit, deviations).

## Risks

| Risk | Mitigation |
|---|---|
| devenv in CI is slow (Nix install, cache misses) | Use the donor's pinned devenv and the `devenv` Cachix cache; keep one job; measure the first run and record it in the PR |
| `@effect/tsgo` patching of the TypeScript 7 server breaks on a TypeScript or Effect bump | Versions are pinned; `prepare` re-patches on install; an upgrade is its own spec |
| The exception registry becomes a rubber stamp | Each entry needs a retirement trigger and the review loop's conformance reviewer checks new entries; the check also fails on entries without a live suppression |
| A donor rule fits the donor domain, not ours | Only the rules in *Anti-slop rules kept* are enabled; adding one is a reviewed change |
| Branch protection with administrators included blocks the operator in an emergency | The operator can remove the protection with `gh api -X DELETE repos/reebeat/reebeat/branches/main/protection`; the command is in `AGENTS.md` |

## Open questions for the operator

1. Is a required human approval wanted later (the protection currently requires a PR and the `checks` status only; the recorded review round is the review)?
2. Should commits be signed (`required_signatures`)? Not required now.
3. Renovate or Dependabot for the pinned set: deferred (an upgrade is its own spec).

## Revisions

Dated entries. A spec is revised only here; its text above is never edited silently after the PR opens. Before the PR opens, the plan may change freely as the build teaches; a change that alters the journey, scope or a falsifier gets an entry anyway.

- **2026-10-28, operator: plan and build are one step.** Earlier text said a spec waits for approval before its code. Now: write the plan first, implement without waiting for approval, revise the plan as the build teaches (entries here), and freeze it when the PR opens. The PR carries spec and code. Work stops only at an operator-owned fork (preference, authority, external effects), which is reported. Consequence: the journey step "write or pick a spec" and the PR body's **Spec** section include this Revisions list; `AGENTS.md`, `pr-create` and `review-pr` state the three-part review above.
