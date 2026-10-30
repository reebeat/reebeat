# 0017 The tier gate runs on ox-dep-lint

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator's request of 2026-10-30: replace the hand-written tier gate with ox-dep-lint 0.4.0 (npm, MIT, phibkro/ox-dep-lint, the same owner), keeping every guarantee the old gate documents.
Process: [spec 0000](0000-development-lifecycle.md).
Verify skill: none, development tooling only: it changes no output of `tsukuri`; the gate's own plants and tests are its check.

## Problem

`bun run check:tiers` runs `tools/quality/checkTiers.ts` over `tools/quality/tiers.ts`, about 400 lines this repository keeps alone: an import reader on oxc-parser, a directory walk, the tier table and its edges. ox-dep-lint is the same owner's extraction of the module graph checks of three repositories (this one's tier gate among them; its README names "tsukuri's directory in no tier"), with a CLI and an oxlint plugin over one engine. Keeping both is two homes for one rule.

## Goal

`bun run check:tiers` is the ox-dep-lint CLI over `oxDepLint.config.ts`, and the same configuration is loaded into ox-dep-lint's oxlint plugin in `vite.config.ts`, so `vp check` and the editor show the per-file findings where they are written. `tiers.ts`, `checkTiers.ts` and `tiers.test.ts` are deleted; what other gates still need from them (`sourceFiles`, used by the release rules) moves to its own module. Every guarantee the old gate documents holds, shown by planting each violation and running the old and the new gate on the same tree.

## Journey

```text
a maintainer
  1. bun run check:tiers                         ox-dep-lint: 333 files, 0 findings
  2. echo 'import "@tsukuri/services";' > packages/core/src/plant.ts
     bun run check:tiers                         forbidden-edge at packages/core/src/plant.ts, exit 1
     bun run check                               the same finding from the dep-lint(imports) rule
  3. mkdir packages/mystery; bun run check:tiers directory-without-package packages/mystery, exit 1
  4. ln -s ../../services/src packages/core/src/link
     bun run check:tiers                         symbolic-link packages/core/src/link, exit 1
  5. bun run test                                tools/quality/test/tierGate.test.ts: a control per guarantee
```

What is real: the published ox-dep-lint 0.4.0 from npm, run on this repository and on fixture workspaces; no stand-in.

## Constraints and values

- Keep every guarantee of the old gate (below); a difference is allowed only where the new gate is stricter, and each is listed.
- One home per fact: the tier table lives in `oxDepLint.config.ts` only; `AGENTS.md` links it.
- Adopt rather than write (the owner's tool); nothing of ox-dep-lint is copied into this repository.
- The licence gate covers the new lock entries: `ox-dep-lint@0.4.0` and `valibot@1.5.0`, both MIT by their registry `license` fields. oxc-parser, oxc-resolver and their platform bindings were already locked and recorded.

## The guarantees, old and new

| Guarantee of `tiers.ts` | How ox-dep-lint keeps it |
| --- | --- |
| The tier table: libraries `core`, `subtitles`, `lint`; service `services`; program `pipeline`; adapters `speech-kokoro`, `align-whisper`, `sounds-synth`, `render-reveal`, `capture-chromium`, `encode-ffmpeg`, `cache-fs`; tools `verify`, `cli` | `kinds` `library`, `service`, `program`, `adapter`, `tool`, with the same directories (singular names: a kind names one package's role) |
| Allowed edges: library uses libraries; service uses libraries; program and adapter use services and libraries; an adapter never another adapter; tools use anything; a package always itself | `mayUse` lists, `"any"` for tools; `forbidden-edge`; `imports.selfByName` stays `allow` |
| Manifest edges in all four dependency fields | `imports.manifestEdgeFields` defaults to all four |
| Static, re-export and dynamic imports (type-only included) | every load form, type-only included ("kind edges always see the real form") |
| A computed dynamic import (outside tools) | `computed-import` (default `error-in-shipped`; every checked file is shipped here, so tools too) |
| A relative path that leaves `packages/`, or reaches into another package | `relative-import-leaves-package` |
| A dependency on a `@tsukuri/` name no package has | `unknown-workspace-package` |
| A directory under `packages/` in no tier, with or without a `package.json` | `package-without-kind` (with one), `directory-without-package` (without one, empty, or a dot directory) |
| A symbolic link under a package's sources: reported, never followed | `symbolic-link` |
| A directory it cannot read fails the check | `unreadable-path` (a finding, exit 1) |
| `test`, `live`, `fixtures` at any depth, `dist`, `node_modules`, `.git` and `.d.ts` are not read | an `unchecked` file class `test/**`, `live/**`, `fixtures/**`, `**/test/**`, `**/live/**`, `**/fixtures/**`, `**/*.d.ts`; `output` default `dist/**`; the walk skips `node_modules` and `.git` |

## Configuration decisions

- **File classes.** Setting `fileClasses` replaces ox-dep-lint's defaults, so the only class is the unchecked one above and every other file is shipped code, as every non-skipped file was for the old gate (package-root `vite.config.ts` included; ox-dep-lint's defaults would have made it a development file, where a computed import passes).
- **`imports.requireDeclared: false`.** With it on, ox-dep-lint reports 17 package `vite.config.ts` files importing the root's `vite-plus` and one tools file importing a devDependency. Declared dependencies are knip's gate (`bun run knip`, "unused files, exports and dependencies"); the tier gate keeps to the direction between packages, as before. Turning it on is a separate decision.
- **`tools/quality` is a `tool`.** It is a workspace member, so ox-dep-lint requires a kind for it. It is listed by path, not as `tools/*`, so a new directory under `tools/` is a finding until someone gives it a kind, as `packages/` works.
- **One baseline entry.** `tools/quality/diagnosticRules.ts` reads `../../node_modules/@effect/tsgo/schema.json` (the diagnostic defaults), and `@effect/tsgo` exports no subpath for it. The old gate never read `tools/`. A baseline entry that no finding needs is a `stale-baseline` finding, so the entry retires itself when the import changes.
- **`tools/oxlint`: `ignore`, not a package.** ox-dep-lint 0.4.0 reports `tools/oxlint directory-without-package`: it matches the `tools/*` workspace glob and has no `package.json`, so nothing checks it today. It holds the vendored anti-slop oxlint rules (MIT, `UPSTREAM.txt`, `LICENSE`, `LICENSE.rat-stack`), loaded by path from `vite.config.ts`. A `package.json` would make it a workspace member, which the licence gate requires to say `Apache-2.0` (every manifest), over MIT code, and would add a lock entry; and the repository already treats it as not its own code: `vite.config.ts` and `knip.json` both leave it out ("checked by their own provenance, not ours"). So `ignore: ["tools/oxlint/**"]`. This reads the owner's intent; it is listed as an operator-owned fork below.
- **The plugin is wired.** `vite.config.ts` already loads JS plugins through `lint.jsPlugins` (vite-plus 1.2.0 runs oxlint 1.88.0, inside the plugin's `oxlint >=1.86.0` peer range), the same way phibkro/file-transfer loads `ox-dep-lint/plugin`. The rule `dep-lint/imports` takes `oxDepLint.config.ts` as its option. The CLI still owns the whole-workspace findings (manifests, directories, links, unreadable paths, the baseline).
- **The configuration's file name** is `oxDepLint.config.ts`, passed with `--config`: the repository's `unicorn/filename-case` rule wants camelCase, which ox-dep-lint's default `ox-dep-lint.config.ts` is not.

## What is built

- `oxDepLint.config.ts` (new; the table and edges lifted from `tiers.ts`, recorded in its header) and the `check:tiers` script `ox-dep-lint --config oxDepLint.config.ts`.
- `vite.config.ts`: the plugin and its rule; the `unicorn/throw-new-error` override loses `checkTiers.ts`.
- `tools/quality/sourceFiles.ts`: `sourceFiles` moved unchanged from `tiers.ts` for `release.ts`; its tests move to `test/sourceFiles.test.ts` (the symbolic link case now asserts on the listing itself).
- `tools/quality/test/tierGate.test.ts`: ox-dep-lint's `checkWorkspace` with this configuration on fixture workspaces, one negative control per guarantee, and on the repository (with the baseline, so a stale entry fails). `test/tree.ts` is the temporary-tree helper both tests share.
- Deleted: `tools/quality/tiers.ts`, `checkTiers.ts`, `test/tiers.test.ts`.
- `package.json` and `tools/quality/package.json`: `ox-dep-lint` 0.4.0, exact. `tsconfig.json` includes the configuration; `knip.json` loses the `checkTiers.ts` entry; the two licences are recorded.
- `AGENTS.md` (the Package tiers row and the Architecture section) and the `review-pr` skill point at `oxDepLint.config.ts`.

## Falsifiers

| # | Falsifier | Gate | Fails when |
| --- | --- | --- | --- |
| F1 | On the same tree, the old and the new gate give the same verdict for every plant of a documented guarantee | `docs/specs/0017-evidence/agreement.sh` (the clean tree and 47 plants), before (`agreement-before.txt`) and after (`agreement-after.txt`) | a plant of the table above passes the new gate |
| F2 | The three "See it fail" examples of `AGENTS.md` fail `bun run check:tiers` | the first rows of the same runs | one of them exits 0 |
| F3 | An unreadable directory fails the gate, old and new; a release scratch tree does not | `unreadable.sh` writes `unreadable.txt` (run as an unprivileged user; root reads mode 000): `packages/core/src/locked` at mode 000, old exit 1 and new exit 1; `tools/quality/.scan-demo/...` at mode 000, new exit 0 | the locked directory exits 0, or the scratch tree exits 1 |
| F4 | Weakening the configuration fails `bun run test` | `tools/quality/test/tierGate.test.ts`; `mutations.sh` writes `mutations.txt` (each mutation's `sed` command, then the failing tests): unmutated 20 pass; library may use service (6 fail), no `.d.ts` class (1), `tools/oxlint` not ignored (1), `encode-ffmpeg` in no kind (3), release scratch trees not ignored (1) | a mutation leaves every test passing |
| F5 | The plugin reports in `vp check` | `plugin.sh` writes `plugin.txt`: `dep-lint(imports): forbidden-edge` at the plant, exit 1 | no `dep-lint` finding |
| F6 | The repository passes, and the other gates still do | `bun run check:tiers`, `bun run check`, `check:exceptions`, `release:stage`, `knip`, `cpd`, `bun run test` | any of them fails for a reason this change introduces |

## Differences the build found

Stricter in the new gate (old passes, new fails), all accepted: a computed import in a tool; a violation in a nested `src/dist/` (only the package-root `dist/` is output now); a `.js` source; `require("@tsukuri/...")`; an escaped specifier (`import("@tsukuri/services")`, which the old reader took for an outside package: a bypass); a new package under `tools/` in no kind. Review round 1 found five more, also accepted: a tool's relative import that leaves its package; `import x = require("@tsukuri/...")`; a type `import("@tsukuri/...").X`; a triple-slash reference to a package; and `declare module "@tsukuri/..."`, which ox-dep-lint reads as an edge (`forbidden-edge`) although it declares rather than loads (no package here has one).

Weaker in two cases, each listed as an operator-owned fork:

- A FIFO (or socket) under a package's sources. The old gate reported "an entry of unknown type"; ox-dep-lint 0.4.0 does not report FIFOs and sockets (its README says so). Git cannot commit a FIFO, so CI never sees one; a local working tree can.
- A manifest whose dependency field is not an object (`"dependencies": "<string>"`): the old gate exited 1, ox-dep-lint 0.4.0 reads no edges from it and exits 0 (found by review round 1's probe).

## Scope and non-goals

- `packages/pipeline/README.md` still names `tools/quality/tiers.ts`. It ships in the package tarball, so changing it needs a changeset and a release of the seven fixed-group packages; left for the next change to that package.
- Historical documents (frozen specs, `docs/decisions/0000-extension-architecture.md`, which plans an `sdk` row "in `tools/quality/tiers.ts`") keep their wording; the row now goes into `oxDepLint.config.ts`.
- The `no-restricted-imports` tier override for `packages/services` in `vite.config.ts` stays: it overlaps the plugin, and removing it is a separate change.
- `imports.requireDeclared`, `externals` and `runtimeModules` per kind (ox-dep-lint could enforce spec 0001 F11's "the core is pure" this way) are not adopted here.

## Operator-owned forks

1. `tools/oxlint`: `ignore` (chosen, reversible) or a workspace package (which needs a licence decision for MIT vendored code under the every-manifest-says-Apache-2.0 rule).
2. FIFOs and sockets under package sources are no longer reported: accept (git cannot commit one), or ask ox-dep-lint upstream to report non-regular entries.
3. `requireDeclared` off: keep knip as the only declared-dependency gate, or turn it on with a development class for package-root `vite.config.ts`.
4. A dependency field that is not an object is no longer a finding: accept, or ask ox-dep-lint upstream to report it as an invalid manifest.

## Revisions

- **2026-10-30, build: the configuration's name.** Planned as ox-dep-lint's default `ox-dep-lint.config.ts`; `vp check` rejects it (`unicorn/filename-case`), so it is `oxDepLint.config.ts` with `--config`, and the package lists are written out (the Effect lint rejects a native `Array.map` helper).
- **2026-10-30, build: `sourceFiles` stays.** `release.ts` imports it from `tiers.ts`; it moved to `tools/quality/sourceFiles.ts` with its tests instead of being deleted, and the temporary-tree helper became `test/tree.ts` so the two tests share it (the duplication gate's threshold is 0).
- **2026-10-30, build: the FIFO difference.** The agreement run found the one case the old gate reported and the new one does not; it is recorded above and as fork 2, not hidden.
- **2026-10-30, build: a test for the configuration.** The old gate's negative controls lived in `bun run test`; without them, a weakened configuration would pass every gate. `tierGate.test.ts` keeps one per guarantee (F4).
- **2026-10-30, review round 1: release scratch trees are ignored, and the evidence carries its commands.** CI run 41080399764 failed `tierGate.test.ts > the repository` with `unreadable-path tools/quality/.scan-*`: `release.test.ts` creates and removes that tree in a parallel worker while the repository test walks `tools/quality`, which this spec made a checked package (a race; local runs passed). `oxDepLint.config.ts` now ignores `tools/quality/.scan-*/**` and `packages/*/.unstable-scan-*/**` (`release.ts`'s scratch under a package), generated trees and never sources; a test in `tierGate.test.ts` shows they are not read while another dot directory still is, and a fifth mutation removes the entries (F4). `mutations.txt`, `plugin.txt` and the new `unreadable.txt` are now written by `mutations.sh`, `plugin.sh` and `unreadable.sh`, which print each command; `unreadable-before.txt` and `unreadable-after.txt` are replaced by `unreadable.txt`, which runs the old gate (written back from origin/main) and the new one on the same tree. `agreement-after.txt` reproduces byte for byte under the new configuration. The differences above add the five stricter and one weaker case the review's probe found, and fork 4.
- **2026-10-30, after the merge (e35ea0e): the open findings of review rounds 2 and 3.** No guarantee, falsifier, configuration or gate changes: `oxDepLint.config.ts` and the tests are untouched.
  - **The guarantee table's last row is incomplete (rounds 2 and 3, low).** Besides the unchecked file class, build output, `node_modules` and `.git`, the gate does not read its `ignore` list: `tools/oxlint/**` (Configuration decisions) and the release rules' scratch trees `packages/*/.unstable-scan-*/**` and `tools/quality/.scan-*/**` (the round 1 entry). So the row "A directory it cannot read fails the check" holds outside those trees; inside one, an unreadable directory is no finding (`unreadable.txt`, last case: `new exit 0`). The table keeps its text; this entry is the correction. `AGENTS.md`'s Package tiers row no longer lists what is not read: it points at the configuration's unchecked file class and `ignore` list, which give each reason, so the list has one home.
  - **The scratch trees are git-ignored (rounds 2 and 3, nit).** `.gitignore` gains `packages/*/.unstable-scan-*/` and `tools/quality/.scan-*/`, so a tree left by a crashed run cannot be committed (`git check-ignore -v` names both lines for a file in each tree, and nothing for `packages/core/src/index.ts`). ox-dep-lint does not read `.gitignore`; its own `ignore` list stays the rule for the walk.
  - **`unreadable.sh` reproduces again (rounds 2 and 3, nit; the merge made it a defect).** The script wrote the old gate back with `git show origin/main:<path>`. Since the merge `origin/main` has neither file, so `git show` failed, the old gate ran as an empty file and exited 0, and its output went to `/dev/null`: a run on e35ea0e printed `old exit 0` for the locked directory, with the cause only on stderr (`fatal: path 'tools/quality/checkTiers.ts' exists on disk, but not in 'origin/main'`). The script now reads the old gate from 56a2155 (the last commit that has it, the one `oxDepLint.config.ts` cites), stops with exit 2 when it cannot, and prints the old gate's last two lines as it does the new gate's. `unreadable.txt` is rewritten by it (as root, uid 65534 through `setpriv`): the verdicts are unchanged (old 0 and 1, new 0, 1 and 0), the clean tree now shows the old gate's `Tiers clean.`, and the locked directory shows that the old gate's exit 1 printed nothing (round 2's observation: a crash, not a finding). F3's claim that the old gate fails still holds. `agreement.sh`'s header names 56a2155 for the same reason; the script and its outputs are otherwise unchanged.
  - **`packages/pipeline/README.md` keeps naming `tools/quality/tiers.ts`, deferred as Scope says.** It ships in the tarball of a fixed-group package, so editing it needs a changeset, and the seven packages then version together for one sentence of prose. npm shows the README of the published `0.1.0-alpha.1` until the next publish whatever the repository says, so the edit helps no npm reader before the next change to `@tsukuri/pipeline`, which needs a changeset and a release anyway and can carry it. Keeping this change free of published files keeps it to tooling and documentation, with no changeset.
  - **Spec 0016 (round 3, low).** Its F2 gate plans to reuse "the `oxc-parser` import reading of `tiers.ts`", which this spec deleted. Its text stays as frozen; its build picks another reader (ox-dep-lint's engine, `oxc-parser` directly, or a lint rule).
