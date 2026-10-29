# Open-core boundary

What reebeat publishes under Apache-2.0 and what stays closed, and the rule that draws the line. Decided by the operator on 2026-10-29 unless an item says **open**. Licence of the open part: [`LICENSE`](../../LICENSE). Dependencies and their licences: [third-party.md](third-party.md). Spec: [0008](../specs/0008-apache-2-licence.md).

```text
        open (this repository, Apache-2.0)               closed (private repositories)
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
| Renderers (`render-reveal`, the Video capture and encode) and importers | Decided 2026-10-29: open |
| The service and adapter seams (`@reebeat/services`: `SpeechSynthesizer`, `WordAligner`, `SoundLibrary`, `Renderer`, `FrameCapturer`, `Encoder`, `AssetCache`, their contract suites and stand-ins) as the **plugin API** | Decided 2026-10-29: a plugin is an adapter Layer that passes `xContract`. Extension points beyond adapters (new effect kinds, new importers) are **open**. |
| A tool protocol for agents that edit the IR (for example MCP tools: read a Story, apply an edit, run `check`) | Decided 2026-10-29: open, so a user's own agent gets the same tools as a hosted one. Which protocol and its tool set are **open**; MCP is the first candidate. |
| Publishing the packages to npm (they are `"private": true` today; the `reebeat` npm org is reserved) | **Open**: products need it; it is the next spec after the licence. |

## What is closed

| Item | Status |
| --- | --- |
| Editor UI | Decided 2026-10-29: closed, a separate private repository that depends on the published packages |
| Sync server (multiplayer) | Decided 2026-10-29: closed, paid |
| Hosted AI agents, deeply integrated | Decided 2026-10-29: closed, paid |
| Billing | Decided 2026-10-29: closed |

## The rule: a feature is paid when it costs us money to run

Decided 2026-10-29.

| Costs nothing to run | Costs us money to run |
| --- | --- |
| Runs on the user's machine or in their browser: the compiler, local rendering, the editor's local features, bring-your-own agents and plugins | Needs our servers or our bills: the sync server, hosted agents (model inference), storage and egress of shared projects |
| **Free** | **Paid** |

The rule has a consequence for the open core: the open part never needs a server of ours, and a paid feature is never a local feature switched off. Anyone may run the Apache-2.0 compiler, and may build a hosted service of their own on it. That is the price of Apache-2.0 and was accepted with it.

Users can bring their own agents (through the tool protocol) and write plugins and extensions (through the adapter seams). Deeply integrated hosted agents are the paid part; the tools they use are not.

## Experimental dependencies stay behind adapters

Decided 2026-10-29. The compiler may depend on experimental or alpha packages (XState v6 alpha, `@xstate/effect` alpha), because they are build-time assets. Three rules keep that safe:

1. **Pinned exactly.** The version in `package.json` and the catalog has no range, so an alpha release cannot arrive by `bun install`.
2. **Never in the public API.** A type from an experimental package does not appear in the signature, error, schema or codec of anything a plugin author or a product imports. The IR and the JSON Schema are reebeat's own.
3. **Behind an adapter.** The experimental package is used inside one package that the rest of the code reaches through a reebeat-owned interface. A breaking alpha is then a change in one place and cannot reach plugin authors.

Whether to enforce rule 2 by a gate (for example, a test that scans the exported declarations for imports from a list of experimental packages) is **open**.

## Contributions

- Contributions are accepted under Apache-2.0, inbound equals outbound: section 5 of the licence says a contribution submitted for inclusion is under the licence's terms unless stated otherwise. Decided 2026-10-29.
- A Developer Certificate of Origin sign-off (`Signed-off-by`, checked by a commit hook or a CI step) is **recommended and not enforced** in this change. Whether to enforce it, and whether closed products need a contributor licence agreement instead, is **open**.
- The copyright holder named in [`NOTICE`](../../NOTICE) is the author of the git history. Who holds the copyright when the project has more than one contributor, and whether a legal entity is set up for the products, is **open**.

## Not decided here

- The name `reebeat` is working ([README](../../README.md)); a trademark policy waits for the final name. **Open.**
- Price, tiers and the sync-server design belong to the closed products' own repositories.
- The distribution of ffmpeg with libx264 (GPL) by a product: [issue #7](https://github.com/reebeat/reebeat/issues/7). **Open.**
