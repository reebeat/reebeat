# Provenance

The development lifecycle tooling (spec 0000) is adapted from [`phibkro/vektorprogrammet-reimagined`](https://github.com/phibkro/vektorprogrammet-reimagined) at commit `797e9e41d96194b9479ff224ac1c40bbc0545888` (the donor). Files whose format allows comments also carry a header. Directories with their own record: [`tools/quality/PROVENANCE.md`](tools/quality/PROVENANCE.md), [`tools/oxlint/anti-slop/UPSTREAM.txt`](tools/oxlint/anti-slop/UPSTREAM.txt) (and `provenance.json`).

| File | Deviation from the donor |
| --- | --- |
| `package.json` | Name, scripts (`check`, `test`, `ready` without the web, docs, store and CMS gates), dependency set and `catalog` cut to what `tools/quality` needs. Added the override `@effect/platform-node-shared` at `4.0.6`, because its newest release is not the `effect` version. `engines.node` is `>=24.0.0`. |
| `vite.config.ts` | Lint, fmt and staged only. Dropped every donor path, the store-boundary imports, the shadcn preset, the donor's per-file overrides and its six database and calendar anti-slop rules. Markdown is excluded from Oxfmt. |
| `tsconfig.json` | The donor's Effect language-service diagnostics, all at `error`, unchanged; `allowedUnstableApis` is the seven modules `tools/quality` imports and there are no `overrides`. |
| `.vite-hooks/pre-commit`, `commit-msg` | Unchanged. |
| `.vite-hooks/pre-push` | Comment and script name (`bun run test`) only. |
| `commitlint.config.ts` | Unchanged. |
| `.gitleaks.toml` | Default rules only; the donor's Norwegian-specific rules and allowlists are dropped. |
| `.jscpd.json`, `knip.json` | Paths cut to this repository. |
| `devenv.nix`, `devenv.yaml`, `devenv.lock` | Toolchain only (Bun, Node 24, gitleaks); no database, browser or TLA+ parts. The lock file is the donor's. |
| `.github/workflows/checks.yml` | No database, browser, documentation or CMS steps; each gate calls its root script. |
| `.agents/skills/review-pr/` | `merge.sh` and `record-round.sh` unchanged but for a header. `SKILL.md` adapted: donor verification skills, formal-verification job and database worktree notes dropped; reviewers judge plan, implementation and agreement. |
