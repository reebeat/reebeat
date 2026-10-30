# Open-core boundary

What tsukuri publishes under Apache-2.0 and what stays closed, and the rule that draws the line. Every item carries one status: **Decided** (by the operator, with the date), **Proposed** (a draft by the lead that the operator has not confirmed) or **Open**. Licence of the open part: [`LICENSE`](../../LICENSE). Dependencies and their licences: [third-party.md](third-party.md). Spec: [0008](../specs/0008-apache-2-licence.md).

```text
        open (this repository, Apache-2.0)               closed source (separate repositories)
 ┌───────────────────────────────────────────┐     ┌──────────────────────────────────────┐
 │ compiler: Story ▶ Plan ▶ Deck / Video     │     │ collaborative multiplayer video editor│
 │ IR, JSON Schema, codecs                   │◀────│   editor UI                          │
 │ renderers, importers                      │ npm │   sync server          (paid)        │
 │ service + adapter seams  = plugin API     │     │   hosted AI agents     (paid)        │
 │ tool protocol for agents that edit the IR │     │   billing                            │
 └───────────────────────────────────────────┘     └──────────────────────────────────────┘
        products depend on published packages; nothing here depends on a product
```

## What is open

| Item | Status |
| --- | --- |
| The compiler (`core`, `pipeline`, `lint`, `subtitles`, `verify`, `cli`) | Decided 2026-10-29: Apache-2.0 |
| The IR, the JSON Schema generated from the Effect Schema, and the codecs between the formats | Decided 2026-10-29: Apache-2.0. The schema and the codecs are the contract that every product and plugin builds on. |
| Renderers (`render-reveal`, the Video capture and encode) and importers | Proposed: open |
| Plugins and extensions, with a modular design, written by users | Decided 2026-10-29: supported. Proposed shape: the service and adapter seams (`@tsukuri/services`: `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `Renderer`, `FrameCapturer`, `Encoder`, `AssetCache`, their contract suites and stand-ins) are the plugin API, and a plugin is an adapter Layer that passes `xContract`. Extension points beyond adapters (new effect kinds, new importers) are **open**. |
| Bring-your-own agents with the editing tools | Decided 2026-10-29: supported. Decided 2026-10-29 (`agent-protocol`): tools are declared once, protocol-neutrally, with MCP as the first adapter; the tool set stays **open**. Proposed: the tools let a user's own agent read a Story, apply an edit and run `check`, so it gets the same tools as a hosted one. See [ADR-0000](../decisions/0000-extension-architecture.md), row 17. |
| Publishing the packages to npm (the `tsukuri` npm org exists) | Decided 2026-10-29: pre-releases of `core`, `subtitles`, `lint`, `services`, `pipeline`, `sounds-synth` and `render-reveal` under the `alpha` tag, by trusted publishing from GitHub Actions; see [spec 0009](../specs/0009-npm-prereleases.md). `cli`, `verify` and the Node adapters are not published yet. |

## What is closed

| Item | Status |
| --- | --- |
| Products built on top (the first is a collaborative multiplayer video editor): closed source, in separate repositories that depend on the published packages | Decided 2026-10-29. Where each repository lives, its visibility and its licence are **open** per product; see "Not decided here" for `tsukuri-labs/studio`. |
| Sync server (multiplayer) | Decided 2026-10-29: closed source, paid |
| Hosted AI agents, deeply integrated | Decided 2026-10-29: closed source, paid |
| Billing | Proposed: closed |

## The rule: a feature is paid when it costs us money to run

Decided 2026-10-29.

| Costs nothing to run | Costs us money to run |
| --- | --- |
| Runs on the user's machine or in their browser: the compiler, local rendering, the editor's local features, bring-your-own agents and plugins | Needs our servers or our bills: the sync server, hosted agents (model inference), storage and egress of shared projects |
| **Free** | **Paid** |

The rule has a consequence for the open core: the open part never needs a server of ours, and a paid feature is never a local feature switched off. Anyone may run the Apache-2.0 compiler, and may build a hosted service of their own on it. Proposed: that is the price of Apache-2.0, accepted with it; the operator has not confirmed this reading.

Users can bring their own agents (through the tool protocol) and write plugins and extensions (through the adapter seams). Deeply integrated hosted agents are the paid part; the tools they use are not.

## Experimental dependencies

The compiler may depend on experimental or alpha packages (XState v6 alpha, `@xstate/effect` alpha), because they are build-time assets. The operator decided on 2026-10-29 that they are pinned exactly and that their types stay out of tsukuri's public API; the third rule is a proposal. Three rules keep that safe:

1. **Pinned exactly.** Decided 2026-10-29. The version in `package.json` and the catalog has no range, so an alpha release cannot arrive by `bun install`.
2. **Never in the public API.** Decided 2026-10-29. A type from an experimental package does not appear in the signature, error, schema or codec of anything a plugin author or a product imports. The IR and the JSON Schema are tsukuri's own.
3. **Behind an adapter.** Proposed (by the lead, not yet confirmed by the operator). The experimental package is used inside one package that the rest of the code reaches through a tsukuri-owned interface. A breaking alpha is then a change in one place and cannot reach plugin authors.

Whether to enforce rule 2 by a gate (for example, a test that scans the exported declarations for imports from a list of experimental packages) is **open**.

## Contributions

- Contributions to this repository are accepted under Apache-2.0, inbound equals outbound: section 5 of the licence says a contribution submitted for inclusion is under the licence's terms unless stated otherwise. Decided 2026-10-29.
- A Developer Certificate of Origin sign-off (`Signed-off-by`, checked by a commit hook or a CI step) is **recommended and not enforced** in this change. Whether to enforce it is **open**.
- Decided 2026-10-29: the copyright holder named in [`NOTICE`](../../NOTICE) is Philip Bjørknes Krogh, the individual (his sole proprietorship is not a separate legal person). If a company is founded later, the copyright in his own code moves to it by written assignment. Contributions stay with their authors under Apache-2.0, so this repository needs no contributor licence agreement. That holds for this Apache-2.0 repository only: the contribution terms of a closed product are **open**.

## Not decided here

- The name is `tsukuri` (formerly the working name `reebeat`, [README](../../README.md)); a trademark policy for it is still to be written. **Open.**
- Price, tiers and the sync-server design belong to the closed products' own repositories.
- `tsukuri-labs/studio`, the repository of the first product, is **public with no licence** (GitHub reports `license: null`; created 2026-10-29 14:01Z, described as "closed source"). Whether it stays public, what licence or notice it carries, and how it takes contributions are **open**. Without a licence the code is under default copyright and nobody may reuse it, but a public repository can be forked and read.
- The distribution of ffmpeg with libx264 (GPL) by a product: [issue #7](https://github.com/tsukuri-labs/tsukuri/issues/7). **Open.**
