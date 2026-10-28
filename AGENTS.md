# reebeat

Explainer videos from story beats: a Story declared as Beats, motion derived from the identity diff between Keyframes, a Plan for review, and a Video rendered as a pure function of the frame number. Read [`README.md`](README.md), the vocabulary in [`GLOSSARY.md`](GLOSSARY.md) and the design in [`docs/design/keyframe-engine.md`](docs/design/keyframe-engine.md). [`STATE.md`](STATE.md) says which spec is active. This repository is **public**: no secret, no personal data and no course-private material, ever.

The lifecycle below is specified in [`docs/specs/0000-development-lifecycle.md`](docs/specs/0000-development-lifecycle.md). This file links facts that live in scripts or in the spec; it does not copy them.

## How a change travels

```text
spec → code → PR   (1:1)
```

- **One spec, one branch, one PR.** The spec is `docs/specs/NNNN-*.md`; the branch is `feat/NNNN-<slug>`. If a spec needs two PRs, it was two specs.
- **Plan and build are one step.** Write the plan (journey, constraints, falsifiers) first, then build without waiting for approval. Revise the plan as the build teaches: each change is a dated entry in the spec's Revisions section, never a silent edit. Stop only at an operator-owned fork (preference, authority, external effects), and report it.
- **The PR carries spec and code**, opens only when the whole journey is built and `bun run ready` passed on the head, and **freezes the spec**. Use skill `pr-create`; the PR body is the report.
- **Never block on a merge.** After opening a PR, start the next spec on a stacked branch.
- **Review judges three things**: the plan, the implementation, and their agreement. Use skill `review-pr`; `.agents/skills/review-pr/merge.sh` merges only a head with a passing recorded round.
- **One writer per working directory.** A second agent works in its own worktree under `.worktrees/` (`git worktree add .worktrees/<name> -b <branch>`; it is git-ignored). Commit by pathspec on a shared tree.
- `main` is protected: a pull request is required (administrators included), the status check `checks` must pass, no force push, no deletion.

## Gates

Every gate is a root script in `package.json`; `bun run ready` runs them in this order. CI (`.github/workflows/checks.yml`) runs each script as its own step. Run everything inside devenv: `devenv shell -- bun run ready` (the system Bun can hang on install). Set up once with `devenv shell -- bun install`, which also installs the git hooks and patches the TypeScript server (`prepare`).

| Gate | Command | Runs where | Catches | See it fail |
| --- | --- | --- | --- | --- |
| Commit message | commitlint (`.vite-hooks/commit-msg`) | every commit | a message that is not a Conventional Commit | `git commit -m "stuff"` |
| Secrets, staged | gitleaks on staged blobs (`.vite-hooks/pre-commit`) | every commit | a secret in a staged file | stage a file with a fake key in a well-known format |
| Format and lint, staged | `vp staged` (`vp check --fix`, `.vite-hooks/pre-commit`) | every commit | format drift, lint errors | stage a file with `var x = 1;` |
| Tests | `bun run test` (`.vite-hooks/pre-push`) | every push, `ready`, CI | a failing test, including the family check and the exception check's tests | break an assertion in `tools/quality/test` |
| Format, lint, types | `bun run check` (`vp check`) | `ready`, CI | Oxfmt drift; Oxlint with Ultracite, the Effect plugin and diagnostics, anti-slop rules, cognitive complexity above 15; type errors (type-aware via tsgolint) | a function with complexity 16; a statement `Effect.succeed(1);` |
| Exception registry | `bun run check:exceptions` | `ready`, CI | a suppression directive without a registry entry; a registry entry without a live suppression | add `// oxlint-disable-next-line <rule>` with no entry |
| Effect family | `bun run test` (`tools/quality/test/effectFamily.test.ts`) | `ready`, CI | `effect` locked at two versions, or an `@effect/*` package at another version than `effect` in `bun.lock` | change one `@effect/*` entry of `bun.lock` |
| Dead code | `bun run knip` | `ready`, CI | unused files, exports and dependencies | export a symbol nothing imports |
| Duplication | `bun run cpd` | `ready`, CI | copy-paste (threshold 0) | paste a 40-token block twice |
| Secrets, history | `bun run secrets` | `ready`, CI | a secret anywhere in the git history | commit a fake key on a scratch branch |
| Journey | `bun run journey` (`reebeat build` twice, `reebeat check`, F6 compare) | last step of `ready`, CI | any falsifier F1 to F9 of spec 0001 failing on the written Deck and Video of `stories/same-id`: cue timing, subtitles, notes, fragments, source hash, transitions, narration timing, chapters, two-build determinism | edit one word of the story after a build and run `reebeat check`; change a lag in `packages/video/src/captureSchedule.ts` |

## Exceptions

Fix the code, not the rule. When a suppression (`oxlint-disable`, `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`) is genuinely needed, add an entry to [`tools/quality/effect-exceptions.json`](tools/quality/effect-exceptions.json) in the same change: `id` (`EX-NNNN`), `scope` (`files`, `directives`), `reason`, `nativeAlternativesExamined`, `owner`, `versions` (the versions examined) and `retirementTrigger`. `bun run check:exceptions` fails on a suppression without an entry and on an entry without a live suppression, so an entry retires with its suppression. Reviewers check each new entry's retirement trigger.

## Effect

Every agent that writes TypeScript here writes native Effect (v4, pinned in the root `catalog`).

- **Lookup order, before writing:** this file, then `node_modules/effect/AGENTS.md` and the `ai-docs/src` examples it links, then `node_modules/effect/src`, never memory or another copy. Ready means every Effect API used has installed guidance.
- **Decision ladder:** native construct, composition of native constructs, a small domain abstraction built from Effect, a boundary adapter, a registered exception.
- **Pure stays pure.** A total deterministic transformation stays a plain function: no service, error channel or Effect wrapper for uniformity. Frame math (the Rendering as a pure function of the frame number) stays plain functions.
- The core MAY use Effect v4 for services, errors, resources and the pipeline; concrete runtimes and vendors belong in Layer implementations chosen at a composition root.
- `effect` and every `@effect/*` runtime package are one version (`tools/quality/effectFamily.ts`); `@effect/tsgo` is its own release line. An upgrade is its own spec.

## Conventions

- **Conventional Commits** (`feat(scope): …`, `fix: …`, `docs: …`, `chore: …`). Body lines at most 100 characters.
- **Never `--no-verify`.** A rejected commit can leave files staged: check `git status` after any hook failure.
- **Never set or change the git identity.**
- Python only for throwaway work; commit TypeScript.
- Copied code carries its provenance (source repository, commit, deviations) in a header or a `PROVENANCE.md`; keep third-party licences in place.
- Tests prove a rule, not an implementation detail; a test fixture lives in a temporary directory the test creates, never outside the repository.
- No LICENSE file yet: the licence is deferred (see the README).

## Emergency

Branch protection includes administrators. To remove it (operator only, an external effect):

```sh
gh api -X DELETE repos/reebeat/reebeat/branches/main/protection
```

Restore it afterwards as spec 0000 describes it.

## Environment

`devenv shell` provides the tools release 1 (spec 0001) needs; every one is substitutable from cache.nixos.org, nothing builds locally.

- **Chromium** (`pkgs.chromium`, `chromium` on `PATH`, Linux only). `REEBEAT_CHROMIUM` is its absolute path: pass it to Playwright as `executablePath` (`playwright-core` and the browser versions are independent). On other systems set `REEBEAT_CHROMIUM` yourself.
- **ffmpeg and ffprobe** (`pkgs.ffmpeg-headless`): libx264, AAC, FLAC, the `mp4` muxer and the `mov_text` subtitle encoder.
- **`whisper-cli`** (`pkgs.whisper-cpp`): word timestamps; the model file (`ggml-base.en.bin`) is not in the closure.
- No `PLAYWRIGHT_BROWSERS_PATH` is set and no Playwright browser download runs (`playwright-driver.browsers` was measured and rejected: older Chromium, 954 MiB).
