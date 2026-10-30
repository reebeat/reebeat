# 0009 Publish `@tsukuri/*` pre-releases to npm

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-29. Decided by: the operator, 2026-10-29 (publish pre-releases to npm so `tsukuri-labs/studio` can depend on the compiler; no long-lived npm token).
Process: [spec 0000](0000-development-lifecycle.md). Number 0009 because 0004 is the open state-machines branch, 0005 and 0006 are named by it, 0007 is PR #11 and 0008 is PR #13 (the licence; this spec builds on it: the published packages carry its `LICENSE` and `NOTICE`). [`docs/design/open-core-boundary.md`](../design/open-core-boundary.md) listed this as "the next spec after the licence".

## Goal

A maintainer runs one workflow, on `main`, after a version commit, and seven packages appear on npm as `0.1.0-alpha.N` under the `alpha` dist-tag, with a provenance attestation, published by GitHub Actions through npm trusted publishing (OIDC). No npm token is stored in GitHub or anywhere else. `tsukuri-labs/studio` installs them with `npm i @tsukuri/core@alpha` and imports them in Node and in a Vite browser bundle.

Nothing observable changes in the compiler: sources, the journey and every falsifier of specs 0001 to 0003 are untouched. A published package's own manifest changes in these ways: it is no longer `private`; it gains `description`, `publishConfig` (`access: public`, `directory: dist`) and a `prepublishOnly` script that refuses a publish from the source directory (its `license`, `Apache-2.0` since spec 0008, is now required by the release rules); `effect` moves from `dependencies` to `peerDependencies` (and `devDependencies`, as `catalog:`), and `@effect/vitest` becomes an optional peer of `services`. Nothing in `exports` changes: it still points at the sources, and the manifest that ships is generated.

## Journey

```text
bun run changeset                 # in each PR that changes a published package: a .changeset/*.md file
bun run release:version           # one "Version Packages" commit: 0.1.0-alpha.N, CHANGELOG.md per package
bun run release:stage             # what CI also runs on every PR: build packages/*/dist, check what would ship
# Actions ▸ Release ▸ Run workflow (branch main; environment npm-release)
#   checks green for the commit ▸ npm >= 11.5.1 ▸ release:stage ▸ changeset publish (OIDC, provenance)
npm i @tsukuri/core@alpha effect@~4.1.0
```

The first release also needs the operator steps in the PR body (claim the names, configure each trusted publisher): they are external effects that an agent must not perform.

## Decisions

### Which packages are published

| Package | Published | Why |
| --- | --- | --- |
| `core`, `subtitles`, `lint` | yes | The libraries: Story to Plan, subtitles, rules. Pure; they are what studio calls to compile. |
| `services` | yes | The seven service interfaces, their errors, the cache key, the selection, the contract suites (`/contract`) and offline stand-ins (`/standins`). It is the plugin API (open-core boundary): a plugin author needs it from npm to write an adapter and run `xContract`. |
| `pipeline` | yes | `buildProgram`, the manifest schema, `sha256Hex`: the compiler's build program over the services. Studio runs it with its own Layers. |
| `sounds-synth` | yes | Portable (waveforms as pure functions, no runtime); studio previews sounds in the browser. Measured: `sfxWav("pop")` is 17324 bytes in Node and in Chromium. |
| `render-reveal` | yes | The Deck renderer. Its module bundles for the browser (Vite 8 build, no externalised Node built-in) and runs there (`renderDeck`, `assembleDeck`). `readAssets` reads the installed `reveal.js` and Inter files through Effect's `FileSystem` and `import.meta.resolve`, so it needs a Node platform; the browser does not call it. |
| `cli` | **no** | Its `bin/tsukuri.ts` is TypeScript run by Bun, and it depends on every adapter and on `verify`. Publishing the `tsukuri` binary needs a compiled Node entry and decides how Kokoro's native dependencies (`sharp` with LGPL libvips), Chromium and ffmpeg (GPL, [issue #7](https://github.com/tsukuri-labs/tsukuri/issues/7)) are distributed. Studio needs none of it. Its own spec. |
| `verify` | no | Depends on `encode-ffmpeg` (a Node runtime adapter) and exists to check written files. |
| `speech-kokoro`, `align-whisper`, `capture-chromium`, `encode-ffmpeg`, `cache-fs` | no | Node-only adapters over models, binaries and a file system. Each is a name to claim and a trusted publisher to configure. Adding one later is a `private` line removed, a name in the Changesets `fixed` group, and its operator step; the gates tell you what you missed. |

The set has one source: a package is published when its manifest has no `"private": true` (the Changesets rule). `tools/quality/test/release.test.ts` fails when the Changesets `fixed` group differs from that set, when a published package depends on a private one (`workspace:*` to a package that is not published has no version to rewrite to), and when a published source imports a package that is not in its `dependencies` or `peerDependencies` (the bundler would inline a development dependency).

### Versioning: Changesets 3.0.3, in pre mode, lockstep

- **Changesets** (`@changesets/cli`, pinned exactly). Checked with Bun: `changeset status`, `pre enter`, `version` and `publish` read the Bun workspace (`@manypkg`), keep `workspace:*` untouched, and `bun install --frozen-lockfile` still passes after `changeset version` (rehearsed). Changesets knows only npm, pnpm and Yarn as publish tools; with Bun it publishes with `npm publish`, which is what npm trusted publishing needs. It does **not** rewrite `workspace:` or `catalog:` itself (see "Rewriting"). It supports `publishConfig.directory`, which is how the staged directory is published.
- **Pre mode** `alpha` (`.changeset/pre.json`, committed): `changeset version` gives `0.1.0-alpha.0`, `.1`, ..., and `changeset publish` publishes under the dist-tag `alpha` (the tag comes from `pre.json`). Leaving the channel is `changeset pre exit`, then a normal `version`.
- **Lockstep**: one `fixed` group holds all seven packages, so they always have one version. Every internal dependency is the exact version (`workspace:*` becomes `0.1.0-alpha.N`), and studio cannot install a `pipeline` that needs a different `core` than the one it has.
- No git tags (`--no-git-tag`): the job has `contents: read`; the registry and the attestation are the record.

### What is built and what ships

- **`vp pack` (tsdown, Rolldown) per package**, entries are the package's own `exports` (`./src/index.ts` and so on), `--dts`: ESM `.mjs` with `.d.mts` declarations, in `packages/<name>/dist`. Measured: the TypeScript 7.0.2 declaration emit works (tsdown prints "TypeScript 7.0 does not yet have a stable API and is experimental"), and a consumer type-checks against the shipped declarations with TypeScript 7, `module: nodenext`, `skipLibCheck: false`, with no error (and a deliberately wrong type is an error, so the check looks).
- Plain `tsc` emit was **rejected**: it keeps `.ts` specifiers in the `.d.ts` files (`export * from "./align.ts"` in `dist/src/index.d.ts`), which a consumer without `allowImportingTsExtensions` cannot rely on, and it ships one file per source file.
- `dependencies` and `peerDependencies` stay external; anything else a source imports is inlined by the bundler, which is why the test above rejects an undeclared import.
- **`dist` is the package root.** `publishConfig.directory: "dist"` makes Changesets run `npm publish <package>/dist`. `dist` holds exactly: `*.mjs`, `*.d.mts`, a generated `package.json`, the package's `README.md` and `CHANGELOG.md`, and the repository's `LICENSE` and `NOTICE`. `release:stage` runs `npm pack --dry-run --json` in `dist` and fails on any other file (source, test, map, build info): "only built output ships" is checked on the tarball, not assumed.
- The source `package.json` keeps `exports` pointing at `./src/*.ts` so tests, Knip, the type check and the journey run without a build. It cannot be published by mistake: `prepublishOnly` fails with a message.
- `publishConfig.access: "public"` in every published manifest (the generated one carries it too); the rules test fails without it.

### Rewriting `workspace:` and `catalog:`

`tools/quality/release.ts` writes the manifest that ships. Bun would rewrite both protocols in `bun publish`, and `npm publish` rewrites neither, so the rewrite is explicit and is a gate:

| Source | Published |
| --- | --- |
| `"@tsukuri/core": "workspace:*"` | the exact version of that published package (`0.1.0-alpha.N`) |
| `"fountain-js": "catalog:"` | the root catalog's version (`1.2.4`) |
| any other `workspace:` or `catalog:` form, or a name that is not published or not in the catalog | a failure listing every such dependency; nothing is built |
| `exports` `./src/index.ts` | `{ "types": "./src/index.d.mts", "default": "./src/index.mjs" }` |
| `repository`, `homepage`, `bugs` | from the root `package.json`, with `repository.directory`; one home for them (npm checks that `repository.url` matches the GitHub repository when publishing from Actions) |

### `effect` is a peer, and its range follows its stability (operator, 2026-10-29)

Every published package lists `effect` (and `@effect/vitest` for `services/contract`, optional) in `peerDependencies`, never in `dependencies`: two copies of Effect are two runtimes. The development copy stays in `devDependencies` as `catalog:`.

Since 4.0.0 an Effect API tagged `@stability unstable` or `experimental` may break in a minor release (4.1.0 removed `effect/Crypto`, which was unstable); `@stability stable` follows semver. So:

- a package whose **published sources** use any unstable or experimental Effect API declares `~4.1.0` (below the next minor), for each effect-family peer whose API it uses;
- a package that uses only stable APIs declares `^4.1.0`.

"Uses" is **measured by the compiler, not by reading imports**: the release rules test runs the repository's patched `tsc` (TypeScript 7 with the Effect language service, `effect-tsgo patch`) over each package's exported directories (`src`, `contract`, `standins`) with an EMPTY `allowedUnstableApis` and with `unstableApiUsage` and `experimentalApiUsage` at `error`. Each finding (`` `effect/FileSystem#FileSystem` is an unstable API ``) names the module and so the package (`effect`, `@effect/vitest`); any finding is a use, however it was imported. A root-barrel binding (`import { FileSystem } from "effect"`), a module import and a namespace import are controls of the test, and a stable import (`Effect.succeed`) finds nothing. A scan of import specifiers against the `allowedUnstableApis` list was written first and **replaced**: it had to know every unstable module by name and to treat a binding of a parent module as that module, which the compiler already does exactly.

Today: `core`, `subtitles`, `lint`, `sounds-synth` are `^4.1.0`; `services` (for `effect`: `crypto/Digest`, `FileSystem`, `Path`, `PlatformError`; and `@effect/vitest`), `pipeline` and `render-reveal` are `~4.1.0`. The test fails on the wrong operator, on a pin (`catalog`) outside the range (an Effect upgrade fails here until the ranges are re-examined), on `effect` in `dependencies`, and on an `effect`-family import that is not declared.

The scan trusts the compiler, and the compiler obeys `@effect-diagnostics` comments, so a published source carries none (F-npm7, added in the revision of round 1).

### Publishing: GitHub Actions, trusted publishing, provenance

[`.github/workflows/release.yml`](../../.github/workflows/release.yml), `workflow_dispatch` only, job `publish`, environment `npm-release`, permissions `contents: read`, `checks: read`, `id-token: write`. It refuses any ref but `main`, requires a green `checks` run on the commit, requires npm 11.5.1 or later, runs `release:stage` and `changeset publish --no-git-tag`. The runner has no npm credential; the npm CLI exchanges the job's OIDC identity for a short-lived token. [npm's documentation](https://docs.npmjs.com/trusted-publishers) states what this spec relies on:

- npm CLI 11.5.1 or later and Node 22.14 or later; GitHub-hosted runners only.
- The trusted publisher is configured **per package** on npmjs.com (organisation, repository, workflow file name with extension, optional environment name) and **allowed actions** (direct `npm publish`, `npm stage publish`, `npm dist-tag`); configurations created after 2026-09-03 allow staged publishing only unless direct publishing is selected. `changeset publish` runs `npm publish`, so direct publishing must be allowed.
- Provenance is generated automatically for a public package published from a public repository through trusted publishing. The workflow also sets `NPM_CONFIG_PROVENANCE=true`, so a publish that cannot produce it fails.
- npm does not validate the configuration when it is saved; the first publish does. A new configuration must complete a first successful publish within 2 days or it expires.
- The package must exist before its trusted publisher can be configured (npmjs.com package settings; `npm trust` also requires an existing package). The names are therefore claimed once by the operator with a placeholder version, which the operator steps in the PR body give exactly.
- `repository.url` of the published package must match the GitHub repository (the generated manifest takes it from the root).

**One finding the workflow handles.** `npm publish` fails in any directory below a root `package.json` that has `devEngines.packageManager` naming another tool (`EBADDEVENGINES ... "bun" does not match "npm"`, because the root declares `workspaces`, so npm treats it as the project). Changesets runs `npm publish` with the package directory as the working directory, and npm reads only command-line flags for the prefix. The workflow removes `devEngines` from the runner's checkout right before publishing (`jq 'del(.devEngines)'`); the checkout is discarded. The repository's own `devEngines` stays: the local toolchain and `vp` use it.

## Rehearsal (2026-10-29, nothing published)

Run on the branch after `changeset version` (reverted afterwards), with the seven tarballs from `npm pack` on each `dist`:

- **Tarballs** (`npm pack`): core 60319 B packed, 11 files; subtitles 6961 B, 7; lint 8262 B, 7; services 28810 B, 17; pipeline 19142 B, 7; sounds-synth 6772 B, 7; render-reveal 21116 B, 7. Contents are only `*.mjs`, `*.d.mts`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`. For `core`, `bun publish --dry-run` and `npm publish --dry-run` (the latter from a directory outside the repository, see the finding above) list the same 11 files.
- **Node**: a scratch project (`npm install` of the seven tarballs and `effect@4.1.0`) imports every entry point (including `@tsukuri/core/steps` and `@tsukuri/services/standins`), builds the Plan of `stories/same-id` (7 scenes, 100 review lines) and synthesises a sound.
- **Types**: TypeScript 7 `tsc --noEmit` with `module: nodenext`, `strict`, `skipLibCheck: false` over a file that uses the types of every package: no error.
- **Browser**: `vite build` (Vite 8.3.5) of a page that imports all seven packages, loaded in Chromium: the Plan builds, `sfxWav("pop")` is 17324 bytes (as in Node), no page error.
- **Contract suites from npm**: vitest 5 with `@effect/vitest` 4.1.0 installed next to the tarballs ran `speechSynthesizerContract`, `soundLibraryContract` and `wordAlignerContract` against the stand-ins from `@tsukuri/services/standins`: 16 tests passed. `@effect/vitest` is an optional peer; without it `@tsukuri/services/contract` does not load, which is the intended behaviour.
- **`changeset publish` itself**, against a local Verdaccio registry with a throwaway token: it published all seven under `alpha`, a second run reported "No unpublished projects to publish", and a fresh project installed `@tsukuri/pipeline@alpha` and `@tsukuri/render-reveal@alpha` from it (the other five resolved as dependencies) and imported `buildProgram`. What this cannot show is the OIDC exchange and the attestation, which exist only on GitHub with a configured publisher.

## Falsifiers

| | Claim | Gate | Falsified by |
| --- | --- | --- | --- |
| F-npm1 | Every published package yields a complete manifest: no `workspace:` or `catalog:` left, a licence, `access: public`, `directory: dist`, `.ts` exports | `release.test.ts` ("every published package builds a clean manifest"), `bun run release:stage` | a public package with `"@tsukuri/verify": "workspace:*"` (controlled: `release:stage` exits 1 naming it) |
| F-npm2 | The published set is the Changesets `fixed` group | `release.test.ts` | removing `"private": true` from `packages/verify` (controlled: the fixed-group test fails, `expected [ '@tsukuri/core', …(6) ] to deeply equal [ '@tsukuri/core', …(7) ]`, and so do the manifest and peer tests) |
| F-npm3 | Only built output ships | `release:stage` (`npm pack --dry-run --json` allowlist; unit test of the allowlist) | a source, test or map file in `dist` |
| F-npm4 | The `effect` peer range matches the stability of the APIs used, admits the repository's pin, and is never a dependency | `release.test.ts` | `"effect": "^4.1.0"` in `services` or in `pipeline` (controlled: the test fails with "its published sources reach an unstable API, so the range must be ~") |
| F-npm7 | No published source hides an unstable use from F-npm4 with an `@effect-diagnostics` directive | `release.test.ts` | `// @effect-diagnostics unstableApiUsage:off` added to `packages/pipeline/src/buildProgram.ts` (controlled: the test names the file; a scan control shows the compiler alone would report nothing) |
| F-npm5 | Published sources import only declared packages | `release.test.ts` | a development dependency imported from `src` |
| F-npm6 | The published packages work outside the monorepo | the rehearsal above (a procedure, not a gate: it needs the network and a browser) | any step of it |

## Scope and non-goals

- No publishing by an agent; no `npm login`; no token. The operator steps are in the PR body.
- No stable (`latest`) release and no `changeset pre exit`. The registry may also point `latest` at the first published version (Verdaccio did; npm's behaviour on a first publish with `--tag alpha` was not observed). `npm dist-tag` can move it; nothing depends on it.
- Not published: `cli`, `verify` and the five Node adapters (table above).
- Staged publishing (`npm stage publish`, a maintainer approves each package with 2FA) would be a stronger setting; it is not compatible with `changeset publish` and is left as a later hardening.
- Third-party licence gate ([spec 0008](0008-apache-2-licence.md)): `@changesets/cli` and its 24 dependencies are build-time packages; their 25 licences (all MIT, read from the registry) are recorded in `tools/quality/third-party-licences.json`, so the lock holds 530 packages.

## Revisions

- **2026-10-29, review round 1 on PR #18.**
  - **CI timeout.** The `tsc` scans took 5.07 s for the peer test on a GitHub runner against vitest's 5 s default. Both scan tests now carry an explicit 60 s timeout, and the seven package scans of the peer test run concurrently.
  - **Directives fail closed (F-npm7, supersedes "any finding is a use, however it was imported" for the case of a suppression).** The scan runs the Effect language service, which honours `@effect-diagnostics` comments, so such a comment in a published source hid an unstable use and let `^4.1.0` through (reviewer's mutation: `// @effect-diagnostics unstableApiUsage:off` in the six `pipeline` files that use `FileSystem`, `Path` or `Digest`, `^4.1.0`: the test passed). The release rules test now refuses any `@effect-diagnostics` directive, in any form and for any rule, registered or not, in a published package's sources. Lint-style suppressions stay with `check:exceptions` ([issue #14](https://github.com/tsukuri-labs/tsukuri/issues/14)).
  - **`types` before `default`.** The generated `exports` were key-sorted (`default` first), so TypeScript resolved under `default` and found its declarations only because `.d.mts` sits beside `.mjs`. The condition maps are built from ordered entries (the linter sorts object keys), a test pins the order, and `tsc --traceResolution` in a consumer now prints `Matched 'exports' condition 'types'`.
  - **Line 10 corrected:** the manifest changes are listed in full (Goal section).
  - **F-npm2 control:** removing `"private": true` from `packages/verify` fails three tests (clean manifests, fixed group, peer ranges); the fixture the table promised does not exist and the row no longer claims one.
- **2026-10-29, review round 2 on PR #18 (low).** The Goal said a published manifest "gains `license`"; every manifest already had `"license": "Apache-2.0"` from spec 0008. The sentence now says it gains `description`, `publishConfig` and `prepublishOnly`, and keeps `license` as a field the release rules require.
