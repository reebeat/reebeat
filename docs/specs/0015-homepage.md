# 0015 The published packages' homepage is tsukuri.dev

Status: **plan** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator (decision log line 123, 2026-10-30: `tsukuri.dev` is registered and managed in Cloudflare) and the lead's request of the same day: `homepage` fields only, no DNS and no site.
Process: [spec 0000](0000-development-lifecycle.md).
Verify skill: none, package metadata only: it changes no output of `tsukuri`.

## Problem

The seven published packages (spec 0009) take `homepage`, `bugs` and `repository` from the root `package.json` when `release:stage` writes their `dist/package.json`, so the fact has one home. Today the root `homepage` is the repository's readme. The operator registered the domain; nothing points at it.

## Goal

The root `homepage` is `https://tsukuri.dev`, so every staged manifest says so. `repository.url` (`git+https://github.com/tsukuri-labs/tsukuri.git`, which npm trusted publishing compares with the repository of the workflow) and `repository.directory` (`packages/<name>`) stay as they are, and `bugs.url` too.

The source manifests of the seven packages get no `repository` field: `release.ts` writes it, with its directory, into each published manifest from the root, and a second copy would be a second home (spec 0009, the generated manifest). `release:stage` shows the result (`docs/specs/0015-evidence/staged.txt`).

One dated entry of spec 0009 is corrected on the way: its release-hold report path read `tsukuri-intent-sources/...`, a directory that does not exist (the operator's reports live in `reebeat-intent-sources/`, which keeps its name).

## Journey

```text
a maintainer
  1. bun run release:stage             builds packages/*/dist
  2. jq '.homepage' packages/*/dist/package.json     https://tsukuri.dev for each of the seven
  3. bun run ready                     the release rules, including the new one, pass
```

No DNS, site or redirect is part of this spec: `https://tsukuri.dev` may not answer yet.

## Constraints and values

- One source per fact: the homepage lives in the root manifest only.
- Nothing is published or configured on npm by this change (the release hold stays).

## Falsifiers

| # | Falsifier | Gate | Fails when |
| --- | --- | --- | --- |
| F1 | Every staged manifest has `homepage: https://tsukuri.dev`, `repository.url` of this repository and `repository.directory: packages/<name>` | `tools/quality/test/release.test.ts` ("points at the product site and at the repository directory"), in `bun run ready`; `docs/specs/0015-evidence/staged.txt` is the raw staged output | the root homepage is another URL (control: `control.txt`: with the old value the test fails with `expected [ Array(1) ] to deeply equal [ 'https://tsukuri.dev' ]`) |
| F2 | Nothing else changes | `git diff --stat origin/main` lists `package.json`, the release test, spec 0009's one path, this spec and its evidence | another file appears |
| F3 | The gates pass | `bun run ready` | any gate fails |

## Revisions

(none yet)
