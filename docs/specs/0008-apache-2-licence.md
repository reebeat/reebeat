# 0008 Apache-2.0 licence, third-party audit and open-core boundary

Status: **plan, built** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-29. Decided by: the operator, 2026-10-29.
Process: [spec 0000](0000-development-lifecycle.md). Number 0008: the lead named 0007 as the last number taken; this repository's `main` holds 0000 to 0003 and an open branch holds 0004. Branch `chore/apache-2-licence`, named by the lead (the convention is `feat/NNNN-<slug>`).

## Goal

Replace "licence deferred, all rights reserved" with a published licence, and record the decisions that go with it.

- **Open source, Apache-2.0:** the compiler and its formats: the IR, the JSON Schema generated from the Effect Schema, and the codecs.
- **Closed source:** products built on top, in separate repositories that depend on the published packages (see the 2026-10-29 revision on `reebeat/studio`). The first is a collaborative multiplayer video editor. Free: features that cost nothing to run. Paid: costly features (the sync server, deeply integrated hosted AI agents). Users can bring their own agents, give them the editing tools, and write plugins and extensions.
- **Dependencies:** the compiler may depend on experimental or alpha packages (XState v6 alpha, `@xstate/effect` alpha), pinned exactly, because they are build-time assets.

## Journey

```text
cat LICENSE NOTICE                                   # the licence and its notice
devenv shell -- bun run test                         # the licence gates, with the rest of the tests
$EDITOR docs/design/third-party.md docs/design/open-core-boundary.md
```

A reader opens the repository and sees `LICENSE` and `NOTICE`; every `package.json` says `"license": "Apache-2.0"`; `docs/design/third-party.md` says what reebeat depends on and under which licence, and what a product that distributes ffmpeg takes on; `docs/design/open-core-boundary.md` says what is open and what is closed, each item decided (by the operator, with its date), proposed (by the lead) or open. Everything is real: the licence text comes from apache.org, every dependency licence from its own source.

## What is built

| Part | Where |
| --- | --- |
| `LICENSE`: the Apache-2.0 text, fetched from `https://www.apache.org/licenses/LICENSE-2.0.txt` (SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`) | `LICENSE` |
| `NOTICE`: the copyright line. Holder: Philip Bjørknes Krogh, decided 2026-10-29 (see Revisions). | `NOTICE` |
| `"license": "Apache-2.0"` in the root and the 15 workspace manifests | every `package.json` |
| README "Licence" section; AGENTS.md "No LICENSE file yet" line replaced | `README.md`, `AGENTS.md` |
| Third-party audit | `docs/design/third-party.md`; the per-package list is `tools/quality/third-party-licences.json`, the only copy |
| Licence gate: lockfile against `tools/quality/third-party-licences.json` and an allowlist; manifests declare Apache-2.0 | `tools/quality/thirdPartyLicences.ts`, `tools/quality/test/thirdPartyLicences.test.ts` |
| Open-core boundary | `docs/design/open-core-boundary.md` |

The GLOSSARY and STATE do not mention the licence and are unchanged.

## Falsifiers

- **F-lic1, the licence is the real text.** `LICENSE` is byte-identical to the file at the apache.org URL. Check: `curl -fsSL <url> | cmp - LICENSE`. Falsified by any changed byte.
- **F-lic2, every manifest says Apache-2.0.** The test `licence declared by every manifest` reads the root manifest and every `packages/*` and `tools/*` manifest. Falsified by a manifest with another licence or none (a new package forgotten).
- **F-lic3, no GPL, AGPL, SSPL or unknown licence in the lockfile.** The test `every package of the real bun.lock has a recorded licence the policy allows`. Falsified by a locked package with no recorded licence, a recorded package that left the lock, or a licence outside the allowlist. Negative controls in the same file: a GPL package added to the real `bun.lock` is rejected by name; AGPL, SSPL and `SEE LICENSE IN ...` are rejected; an `OR` expression passes on one allowed alternative and an `AND` expression only on all; `LGPL-3.0-or-later` passes for `@img/sharp-*` only; a parenthesised group inside an expression is rejected.
- **F-lic4, the audit covers what the lock holds.** The same test: the 505 packages of `bun.lock` and the recorded packages are the same set.
- **F-lic5, no stale statement.** `git grep -i -e "all rights reserved" -e "No LICENSE file" -e "licence to be decided" -- ':!docs/specs' ':!docs/design/keyframe-engine.md'` finds nothing. The earlier specs keep their text: they are dated records.
- **F-lic6, the full gate.** `bun run ready` passes on the head.

## Not in scope

- Publishing to npm (the packages stay `"private": true`), a DCO check, a trademark policy, any code of a closed product.
- Deciding the distribution of ffmpeg with libx264: [issue #7](https://github.com/reebeat/reebeat/issues/7).
- Reading licence files inside packages: the gate reads the declared `license` field.

## Open questions for the operator

1. **Copyright holder.** Closed 2026-10-29: Philip Bjørknes Krogh, see Revisions.
2. **The donor repository.** Closed 2026-10-29, see the second round-2 entry in Revisions: one human contributor plus three commits by an agent identity, all the operator's work.
3. The open items of the open-core note: the licence, visibility and contribution terms of `reebeat/studio`, the tool protocol, plugin extension points beyond adapters, a gate for experimental types in the public API, and DCO enforcement.

## Revisions

- **2026-10-29, built with the plan.** The licence check of every manifest is a test, not a one-off edit, so a package added later without `license` fails `bun run test`. The package gate keeps one JSON file of `name@version` to licence because `bun.lock` carries no licences and `node_modules` does not hold the optional packages of other platforms.
- **2026-10-29, copyright holder decided (supersedes the first open question and the `NOTICE` row's earlier name).** The operator decided that the holder is **Philip Bjørknes Krogh**, his full legal name. His sole proprietorship is not a separate legal person, so the holder is the individual, and `NOTICE` reads `Copyright 2026 Philip Bjørknes Krogh`. If a company is founded later, the copyright in his own code moves to it by written assignment. Contributions stay with their authors under Apache-2.0, inbound equals outbound, so closed products need no contributor licence agreement. No organisation number and no business name is published.
- **2026-10-29, review round 1 (supersedes statements above).**
  - `reebeat/studio`, the first product's repository, is **public with no licence** (`gh api repos/reebeat/studio`: `visibility: public`, `license: null`, created 2026-10-29 14:01Z, after this spec was written). This supersedes "separate private repositories" in the Goal and "a separate private repository" in the first version of the note: the products are closed source in separate repositories, and whether `reebeat/studio` stays public, its licence and its contribution terms are open. The "no contributor licence agreement" statement of the entry above holds for this Apache-2.0 repository only.
  - Only the operator's decisions are marked decided in `open-core-boundary.md`: the compiler and formats are open, products are closed, a feature is paid when it costs money to run, bring-your-own agents, plugins and extensions with a modular design, pinned experimental dependencies with their types kept out of the public API. The plugin shape (an adapter Layer that passes `xContract`), open renderers and importers, an open tool protocol, closed billing and "the price of Apache-2.0 was accepted" are marked proposed.
  - The per-package list `docs/design/third-party-packages.md` and the counts table of `third-party.md` were hand-kept copies of `tools/quality/third-party-licences.json`; both are removed. The JSON file, tied to `bun.lock` by the gate, is the only list.
  - The donor repository question is closed with its evidence (second open question); round 2 corrects the evidence below.
- **2026-10-29, review round 2.**
  - `open-core-boundary.md`: of the three rules for experimental dependencies, "pinned exactly" and "types kept out of the public API" are decided; "behind an adapter" is marked proposed.
  - **Donor repository, closed.** `phibkro/vektorprogrammet-reimagined` has no licence file. `gh api "repos/phibkro/vektorprogrammet-reimagined/contributors?anon=1"` lists phibkro (User, 81 contributions) and `vektorprogrammet modernization` (Anonymous, 3 contributions). The three are commits 8c17cf0, d272a59 and 4a12578, authored as `vektorprogrammet modernization <noreply@localhost>` (checked with `gh api repos/phibkro/vektorprogrammet-reimagined/commits/<sha>`). The operator confirmed on 2026-10-29 that his own agents made those commits for him, so they are his work and need no other consent. This supersedes the round 1 sentence "one contributor" (without `?anon=1` the API hides the anonymous identity).
