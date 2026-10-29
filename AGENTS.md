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
- **Review judges three things**: the plan, the implementation, and their agreement. Use skill `review-pr`; `.agents/skills/review-pr/merge.sh` merges only a head with a passing recorded round. **The author of a PR never reviews it**: `record-round.sh` refuses a record whose header (`Author`, `Reviewers`, `Checked`) is missing or whose passing reviewers include the author. Every number in a report, an issue or a PR body needs its script, its raw output and its command.
- **Verify what a viewer sees.** Skill `verify-reebeat` builds a story into a scratch directory and observes the Video, audio and Deck with tools other than `reebeat check`; its feature map is `.agents/skills/verify-reebeat/features.md`. **A PR that adds or changes user-visible behaviour** (anything `reebeat` prints or writes: syntax, anchors, effects, transitions, the Deck, the Video, subtitles, chapters, lint, plan output, CLI flags) **updates the feature map in the same PR and names the rows on its spec's `Verify skill:` line** (`none, <reason>` when nothing a viewer can see changes). The reviewer runs the skill on the head; a map that no longer describes the code is a finding of at least medium (`maintenance`). Evidence lives in `~/.local/state/reebeat-verify/<date>-<label>/`, never in a worktree.
- **One writer per working directory.** A second agent works in its own worktree under `.worktrees/` (`/run/current-system/sw/bin/git worktree add .worktrees/<name> -b <branch> origin/main`; it is git-ignored). Use that path for `git worktree add`: the harness rewrites a bare `git worktree` into `omp worktree`, which once copied `.worktrees/` into itself (189 to 215 GB). Commit by pathspec on a shared tree. Before a heavy job (`bun run ready`, a capture, the journey) run `.agents/skills/verify-reebeat/scripts/headroom.sh`: it reads memory, swap-in, memory PSI `full` avg60 and load, and refuses when one is short.
- `main` is protected: a pull request is required (administrators included), the status check `checks` must pass, no force push, no deletion.

## Gates

Every gate is a root script in `package.json`; `bun run ready` runs them in this order. CI (`.github/workflows/checks.yml`) runs each script as its own step. Run everything inside devenv: `devenv shell -- bun run ready` (the system Bun can hang on install). Set up once with `devenv shell -- bun install`, which also installs the git hooks and patches the TypeScript server (`prepare`).

| Gate | Command | Runs where | Catches | See it fail |
| --- | --- | --- | --- | --- |
| Commit message | commitlint (`.vite-hooks/commit-msg`) | every commit | a message that is not a Conventional Commit | `git commit -m "stuff"` |
| Secrets, staged | gitleaks on staged blobs (`.vite-hooks/pre-commit`) | every commit | a secret in a staged file | stage a file with a fake key in a well-known format |
| Format and lint, staged | `vp staged` (`vp check --fix`, `.vite-hooks/pre-commit`) | every commit | format drift, lint errors | stage a file with `var x = 1;` |
| Tests | `bun run test` (`.vite-hooks/pre-push`) | every push, `ready`, CI | a failing test, including the family check and the exception check's tests | break an assertion in `tools/quality/test` |
| Verification skill drift | `bun run test` (`tools/quality/test/verifyMap.test.ts`, `reviewRecord.test.ts`) | `ready`, CI | a spec from 0009 on without a `Verify skill:` line, a line that names a row the feature map lacks, a verb, sound, anchor kind, Element event or transition of `@reebeat/core` without a row; a review record without its header or a pass by the author | remove the `Verify skill:` line of spec 0009; delete the `effect-focus` row of `features.md` |
| Format, lint, types | `bun run check` (`vp check`) | `ready`, CI | Oxfmt drift; Oxlint with Ultracite, the Effect plugin and diagnostics, anti-slop rules, cognitive complexity above 15; type errors (type-aware via tsgolint) | a function with complexity 16; a statement `Effect.succeed(1);` |
| Exception registry | `bun run check:exceptions` | `ready`, CI | a suppression directive without a registry entry; a registry entry without a live suppression | add `// oxlint-disable-next-line <rule>` with no entry |
| Package tiers | `bun run check:tiers` | `ready`, CI | a package that depends, in its manifest or an import, on a tier it may not use; a directory under `packages/` in no tier; a symbolic link under a package's sources (reported, never followed or skipped) or a directory it cannot read (the check fails) | make `core` import `@reebeat/services`; add a directory under `packages/`; `ln -s ../../services/src packages/core/src/link` |
| Effect family | `bun run test` (`tools/quality/test/effectFamily.test.ts`) | `ready`, CI | `effect` locked at two versions, or an `@effect/*` package at another version than `effect` in `bun.lock`; `@effect/tsgo` locked at two versions for the root and the workspace packages; an exception record naming another `effect` or `@effect/tsgo` version than the lock | change one `@effect/*` entry of `bun.lock`; pin `@effect/tsgo` in one workspace package only |
| Dead code | `bun run knip` | `ready`, CI | unused files, exports and dependencies | export a symbol nothing imports |
| Duplication | `bun run cpd` | `ready`, CI | copy-paste (threshold 0) | paste a 40-token block twice |
| Secrets, history | `bun run secrets` | `ready`, CI | a secret anywhere in the git history | commit a fake key on a scratch branch |
| Journey | `bun run journey` (`reebeat journey stories/same-id/story.fountain`: build, check, build again, F6 compare) | last step of `ready`, CI | any falsifier F1 to F9 of spec 0001 failing on the written Deck and Video of `stories/same-id`: effect timing (every effect and its anchor), subtitles, notes, fragments, source hash, transitions, narration timing, chapters, two-build determinism | edit one word of the story after a build and run `reebeat check`; change a lag in `packages/capture-chromium/src/captureSchedule.ts` |

## Exceptions

Fix the code, not the rule. When a suppression (`oxlint-disable`, `eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`) is genuinely needed, add an entry to [`tools/quality/effect-exceptions.json`](tools/quality/effect-exceptions.json) in the same change: `id` (`EX-NNNN`), `scope` (`files`, `directives`), `reason`, `nativeAlternativesExamined`, `owner`, `versions` (the versions examined) and `retirementTrigger`. `bun run check:exceptions` fails on a suppression without an entry and on an entry without a live suppression, so an entry retires with its suppression. Reviewers check each new entry's retirement trigger.

## Effect

Every agent that writes TypeScript here writes native Effect (v4, pinned in the root `catalog`).

- **Lookup order, before writing:** this file, then `node_modules/effect/AGENTS.md` and the `ai-docs/src` examples it links, then `node_modules/effect/src`, never memory or another copy. Ready means every Effect API used has installed guidance.
- **Decision ladder:** native construct, composition of native constructs, a small domain abstraction built from Effect, a boundary adapter, a registered exception.
- **Pure stays pure.** A total deterministic transformation stays a plain function: no service, error channel or Effect wrapper for uniformity. Frame math (the Rendering as a pure function of the frame number) stays plain functions.
- The core MAY use Effect v4 for services, errors, resources and the pipeline; concrete runtimes and vendors belong in Layer implementations chosen at a composition root.
- `effect` and every `@effect/*` runtime package are one version (`tools/quality/effectFamily.ts`); `@effect/tsgo` is its own release line, but one version for the whole repository (the catalog pins it for the root and every workspace package; `tsgoDrift` fails on a second one and tolerates only the copy nested in `@phibkro/oxlint-effect-plugin`, which imports no `@effect/tsgo` module). Every registered exception records the locked `effect` and `@effect/tsgo` versions, so a bump fails its test until the exception is re-examined. An upgrade is its own spec.

## Architecture

Three tiers, one dependency direction (design R3, spec 0001): **library** (pure, no runtime) < **service** (an Effect service: interface plus contract) < **integration** (Layers that implement a service on an outside runtime). `bun run check:tiers` reads every `package.json` and every import of a package's sources; the table and the allowed edges are `tools/quality/tiers.ts`.

- **Map.** libraries: `core`, `subtitles`, `lint` (import libraries only). service: `services` (`@reebeat/services`: the seven tags `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `Renderer`, `FrameCapturer`, `Encoder`, `AssetCache`, the errors, `assetKey`, the selection; imports libraries only). program: `pipeline` (`buildProgram` over the services, the manifest schema; services and libraries only). adapters: `speech-kokoro`, `align-whisper`, `sounds-synth`, `render-reveal`, `capture-chromium`, `encode-ffmpeg`, `cache-fs` (services and libraries, never another adapter). tools: `verify`, `cli` (anything; `cli` is the only composition root).
- **Selection** is explicit configuration at the composition root, one registry in `packages/services/src/selection.ts`: `speech: kokoro | silent`, `aligner: whisper | even`, `sounds: synth`, `renderer: reveal`, `capturer: chromium`, `encoder: ffmpeg`, `cache: fs`; defaults are the local adapters. `packages/cli` reads `reebeat.config.json` beside the story, then the flags `--speech`, `--aligner`, `--sounds`, `--renderer`, `--capturer`, `--encoder`, `--cache` (and `--cache-dir`, the directory of the `fs` cache); the flags win. An unknown key or value fails `UnknownSelection`, a missing model, binary or credential fails `AdapterUnavailable` on first use, and nothing falls back to another adapter. A stand-in narrator (`--speech silent`) always fills a missing speech asset; Kokoro needs `--refresh-speech`.
- **Stand-ins and egress.** Every integration that needs a model, a credential or a store has an offline stand-in (`@reebeat/services/standins`: `silentSynthesizer`, `evenAligner`, `toneSounds`, `memoryCache`; ids end `-standin`) and declares in `info.egress` what it sends out (`[]` for every local adapter). The build prints each adapter with its egress and writes them to `build.json` (schema 2: `adapters`, and the provenance of every cache asset used). A build whose manifest lists a stand-in narrator is narration-silent, not sound-silent (the sounds are real and audible): `reebeat check` prints `N/A (silent stand-in)` for F8 (the narration onsets) and for nothing else; F1 still observes every `sound` effect and the anchors in the picture. The cache key is `assetKey` (adapter id, settings, input, extra: SHA-256); `info.settings` holds everything that changes the output and never a secret (a name matching `key|token|secret|password|credential` is rejected). Secrets come from the environment only: never printed, cached, keyed or written to the manifest.
- **Add an adapter.** (1) Add the directory to its tier row in `tools/quality/tiers.ts` (a directory in no tier fails the gate). (2) Implement the service's `Layer` with an `AdapterInfo`; raise `AdapterUnavailable` when a requirement is missing. (3) Run `xContract(label, layer)` from `@reebeat/services/contract` in its tests; live adapters run it where the model, browser or binary exists. (4) Add its name to `choices` in `selection.ts` and to the table of its key in `packages/cli/src/adapters.ts` (each table is typed over the choices, so it does not compile until it is wired). (5) Add the package to the `vite.config.ts` Effect groups and to `knip.json`.

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
