# Handoff: spec 0018 (PR #55), round 3 checkpoint

Written by agent `TsukuriMcp` after an operator quota stop. Not a spec: the binding text is
[`0018-mcp-inspector.md`](0018-mcp-inspector.md) and its dated Revisions (14 to 25).

## Where things are

- Repository: `tsukuri-labs/tsukuri`, clone `/srv/share/projects/reebeat`.
- Worktree: `/srv/share/projects/reebeat/.worktrees/0018-mcp-inspector`, branch `feat/0018-mcp-inspector`.
- Head at the time of writing: `e1f7415652debbdae7c9a3bca0d79a826f72b104`, already pushed to `origin`.
  This file is committed on top of it and not pushed (a push runs the ~8 minute `bun run test` pre-push hook).
- Dirty state: none before this file. Operator work elsewhere was not touched.
- PR #55 body is current through Revision 25 and ends with an empty `## Review rounds`.
- Spec binding: Revisions 14 to 22 answer review round 1 (RevReebeat16, CHANGES at `aa8df49`).
  Revisions 23 to 25 answer round 2 (PASS at `63a2f5c` with one residual and two lows).

## Round 2 items

| Item | State | Evidence |
| --- | --- | --- |
| `docs_get` followed a symlinked parent directory | done at `e1f7415`: the canonical path of the file must equal the checkout's canonical path plus the segments | `packages/mcp/test/docs.test.ts` (through the tool; link at glossary, skill file, skill dir, `skills`, `lifecycle`, `packages`; directory; missing; oversized; a regular file through a linked checkout); [before](0018-evidence/docs-parent-link-before.txt) |
| Exit 130 on a closed stdin | done: exit 0 after the end of input, 130 stays for a signal; the server finishes in-flight calls first (bounded by the 25 s observation deadline), by choice so `printf ... \| tsukuri-mcp` is answered | `src/endOfInput.ts`, `bin/tsukuri-mcp.ts`, `test/endOfInput.test.ts` (real executable, sleeping ffmpeg shims, no orphan, both exits); [before](0018-evidence/eof-before.txt) |
| `docs.test.ts:37` warning | done by the rewrite | `vp check`: no warnings |

Not done and not started: nothing from round 2. Open design note: EOF does not cancel an in-flight call at once. If a
prompt cancel is wanted, race the launch against "stdin ended, then a short grace"; the teardown mapping stays.

## Checks actually run on `e1f7415` (local)

- `devenv shell -- bunx vp check --fix` (twice): `Found no warnings, lint errors, or type errors in 398 files`.
- `bun run check:exceptions` (clean, 3 suppression exceptions), `bun run check:tiers` (0 findings), `bun run knip`
  (no output), `bun run cpd` (`Found 0 clones`), `bun run secrets` (run on the earlier head only).
- `packages/mcp` suite before the last import cleanup: 15 files, 100 tests passed. After it: `stdio.test.ts`,
  `docs.test.ts`, `endOfInput.test.ts` 7 passed.
- Pre-push hook `bun run test`: `vp run: 17/17 successful` for the push of `e1f7415`.
- Real stdio exchange by hand: `0018-evidence/stdio-smoke.txt` (eight tools, `initialize`, calls, ends `exit 0`).
- Not run on this head: `bun run ready`, `check-clients.sh`, `journey.sh` (model turns), `release:stage`.
  The round 1 `check-clients.sh` run (real claude 2.1.295, codex 0.162.0) was at `ed40ffb`; nothing since changed the
  generated client files.
- One unexplained flake: `results.test.ts` property test "a page of text never exceeds its budget" failed once under
  load while lint ran beside the suite; four later runs passed. No failure message was captured.

## Live processes

- A background job watching CI run `41119356046` (`gh run watch`, job `bg_5286`) may still be running. It writes
  nothing and can be left or killed. No servers, fixtures or conformance processes are owned.

## Next command

```sh
cd /srv/share/projects/reebeat/.worktrees/0018-mcp-inspector
gh run view 41119356046 --json status,conclusion,headSha   # CI of e1f7415
```

If green, report head `e1f7415` (plus this handoff commit if pushed) to the reviewer for the narrow round 3. Push the
handoff commit only with `git push origin feat/0018-mcp-inspector` in an async job (the hook runs the tests), and only
if the lead wants it. Never release or publish; that stays the operator's.
