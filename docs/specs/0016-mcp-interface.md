# 0016 An MCP interface for agents: the multimedia creative lifecycle

Status: **plan, design only** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: the operator's request of 2026-10-30 (a Tsukuri MCP interface, and integrations for Codex, ChatGPT and Claude, so agents can run the multimedia creative lifecycle: create, inspect, revise, deliver, verify, and possibly release and publish; release and publish only as gated, human-approved actions) and the operator's decision `agent-protocol` of 2026-10-29 (tools are declared once, protocol-neutrally; MCP is the first adapter; ADR-0000 row 17). Every other design choice below is **Proposed**; the forks that are the operator's are **Open** and listed in "Decisions for the operator".
Process: [spec 0000](0000-development-lifecycle.md). Number 0016: the next free number on `origin/main` and on every branch of the repository on 2026-10-30 (0005 and 0006 are reserved for the state-machine work, 0011 is the open positioning PR). Branch `feat/0016-mcp-interface`.
Verify skill: none, documentation only: it changes no output of `tsukuri`; the falsifiers below are observed with commands on the committed files and on the evidence directory [`0016-evidence/`](0016-evidence/).
Decision record: [ADR-0000](../decisions/0000-extension-architecture.md), row 17 (`AgentTool`, authoring) and the rule that authoring tools and interaction tools are different kinds.

## Problem

An agent that works on a tsukuri story today has a shell: it edits `story.fountain`, runs `tsukuri lint`, `plan`, `build`, `check`, and reads text. That is enough for one operator on one Linux machine who trusts the agent with a shell. It is not an interface:

- nothing says which step may happen after which, so an agent can ask for a release of a build nobody checked;
- results are text for a human (`Console.log` rows), not values an agent can rely on;
- a build is one blocking process of minutes, and the hosted agents give a tool call 60 to 240 seconds;
- the verdicts of `tsukuri check` are printed and forgotten: nothing records which build they were about, and an agent can write "all falsifiers hold" without running anything;
- the compiler has no notion of releasing or publishing a project, and an agent with a shell and a token could publish by accident or by prompt injection (the compiler's own npm release is guarded; a creative project's release is not guarded because it does not exist).

The operator wants the same lifecycle available to Claude, Codex and ChatGPT, through one protocol, with release and publish never autonomous.

## Goal

One tool interface, declared once and protocol-neutrally, served over MCP, such that:

1. **An agent can do the whole authoring loop** (create a project, read and revise its Screenplay, lint, plan, build, verify, observe the artifacts) through typed tools whose results are data, whose long work is a job it polls, and whose binary results are links and observations, never raw media in the model's context.
2. **An agent cannot release or publish by itself, by construction.** The tools it can call have no path to a publisher credential; the approval is a different principal's act, outside the MCP channel, bound to the digest of what is released and to its destination.
3. **An agent cannot certify its own work.** Verification evidence is written only by the verifier, bound to digests, and recomputed at the gate; no tool accepts a verdict as input.
4. **The same interface installs in each client from one source.** Per-client files (Claude Code and plugin, Agent Plugins for Codex and ChatGPT, Codex `config.toml`, a Desktop bundle, connector cards for the hosted apps) are generated and drift-tested, never copied by hand.
5. **Every factual claim in this document is a checked fact or marked `INFERENCE`**, and the falsifiers separate what an agent can run headless from what needs the operator's hands.

The spec is the plan and the contract. It builds no package: the slices at the end are the implementing specs, one PR each.

## How to read the claims

| Mark | Meaning |
| --- | --- |
| **Verified** | Run on 2026-10-30 on this machine; the raw output is in [`0016-evidence/`](0016-evidence/) |
| **Sourced** | Read in the cited primary source on 2026-10-30; the quoted line is in [`0016-evidence/primary-sources.md`](0016-evidence/primary-sources.md) |
| **INFERENCE** | Not observed and not stated by a source; named in "Inferences" with the check that would settle it |
| **Decided** / **Proposed** / **Open** | As in the ADR: the operator decided it / a proposal not yet confirmed / a fork the operator owns |

## Research

### MCP, current revision (Sourced unless marked)

The current revision is **2026-07-28** (`/specification/latest` resolves to it; a `draft` revision also exists). What matters here:

| Topic | Fact | Consequence for tsukuri |
| --- | --- | --- |
| Statelessness | No `initialize` handshake and no protocol sessions; every request carries `protocolVersion`, `clientInfo` and `clientCapabilities` in `_meta`; servers implement `server/discover`; `tools/list` must not vary per connection but may vary by the authorization presented. Earlier revisions (`2025-11-25` and before) are "legacy": they handshake | The server is **dual-era**. State between calls is an explicit handle (the spec's "Stateful tools" guidance), which is what a job id, a build id and an approval id are |
| Tools | `inputSchema` and `outputSchema` are JSON Schema 2020-12; `structuredContent` may be any JSON and must match `outputSchema`; a tool that returns it should also return the serialised JSON as text. `annotations`: `readOnlyHint` (default false), `destructiveHint` (default true), `idempotentHint` (default false), `openWorldHint`; **clients must treat annotations as untrusted unless the server is trusted**. Tool execution errors are results with `isError: true`; protocol errors are JSON-RPC errors | Every tool sets all four hints explicitly. Annotations are advice to the client; the **server enforces** every rule in the handler. Tool failures are tagged values returned with `isError: true` |
| Content | `ContentBlock` is text, image, audio, `resource_link`, or embedded resource. **There is no video block** | Video and large audio are `resource_link`s; the model gets observations (frames, audio statistics), not media |
| Elicitation | Form mode (flat primitive schema; **must not** collect passwords, keys or tokens) and URL mode (out-of-band, for sensitive interactions). Since 2026-07-28 it travels as a multi round-trip request: the server returns `resultType: "input_required"` with `inputRequests`, the client retries the call with `inputResponses`. The server may bind state in an opaque `requestState` | Elicitation is a consent display, not an authorization (see "The gate") |
| Long-running work | The official **Tasks extension** (`io.modelcontextprotocol/tasks`): the server returns a task handle, the client polls `tasks/get`, input arrives through `tasks/update`; both sides opt in through extension capabilities | Tasks are an optional layer on top of an explicit job handle, not the base |
| Streamable HTTP | One POST endpoint; a response is JSON or an SSE stream scoped to that request; no GET stream, no `Last-Event-ID` resumption (a broken stream loses the request); servers **must** validate `Origin` | Remote entry validates Origin and treats a lost stream as a lost request |
| Authorization | OAuth 2.1; servers **must** publish RFC 9728 protected-resource metadata; clients register by Client ID Metadata Documents (preferred) or Dynamic Client Registration (deprecated); scopes come from the `WWW-Authenticate` challenge; step-up is defined | Scopes can gate which tools a token sees |
| Deprecations | Roots, Sampling and Logging are deprecated; HTTP+SSE is deprecated | Not used |
| Extensions | Tasks; MCP Apps (`io.modelcontextprotocol/ui`); **Skills over MCP** (`io.modelcontextprotocol/skills`, SEP-2640 Final; "SDK and host support is still being implemented"); OAuth client credentials; enterprise-managed authorization | Skills over MCP is a later way to serve the lifecycle skill from the server; the extension matrix page loses its support marks in the fetched text, so per-client support is **INFERENCE I4** |
| Conformance | `@modelcontextprotocol/conformance` (MIT) lists what each revision requires of a server: **37** scenarios for `2026-07-28` and **30** for `2025-11-25` (Verified: [`conformance-requirements.txt`](0016-evidence/conformance-requirements.txt)). Its server scenarios call fixture tools (for example `tools-call-image`) | The suite proves the **protocol stack** against a test-only fixture server built on the same transport layers; tool semantics are proved by our own tests |

### Effect 4.1.0, the installed MCP support (Verified; [`effect-mcp-surface.txt`](0016-evidence/effect-mcp-surface.txt))

`effect` 4.1.0 ships `effect/ai` with `McpServer`, `McpProtocol`, `McpSchema`, `McpClient`, `McpTest`, `Tool` and `Toolkit` (all `@stability unstable`). The installed `ai-docs` have no MCP entry (`grep -rli McpServer ai-docs` finds nothing), so for MCP the guidance is the module JSDoc and source, which this section reads.

| Fact | Evidence | Consequence |
| --- | --- | --- |
| `ProtocolVersion` is `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`, `2026-07-28`; adapters `v2026_07_28` (stateless) and the four legacy ones (stateful) | source line 27 of `McpProtocol.ts` | One server can speak every era we need |
| Transports: `layerStdio`; `layerHttp` (one long-lived server, sessions for legacy, `allowedOrigins`); `layerHttpRequestScoped` (for serverless hosts: **sessionless protocols only**, no list-changed, no subscriptions, no legacy reverse requests) | source JSDoc, lines 2388, 2544, 2617 | The Worker entry can be request-scoped only for the modern era. Whether a legacy client works against a Worker is **INFERENCE I2** |
| A `Toolkit` tool: `Tool.make` (Schema parameters, success, failure) and `.annotate(Tool.Readonly \| Destructive \| Idempotent \| OpenWorld \| Strict, ...)`; `Idempotent` defaults to false; `Tool.Strict` gives `additionalProperties: false` on the **input** schema and rejects an excess property as an `isError` result; the **output** schema stays `additionalProperties: true` | run: [`stdio-both-eras.txt`](0016-evidence/stdio-both-eras.txt) | Declarations set all hints and `Strict` explicitly |
| A `Toolkit` result carries **one text block holding the JSON** next to `structuredContent` (`toolResultContent` is `[{ type: "text", text: JSON.stringify(encoded) }]`) | source line 2961 | The payload is counted twice against a result limit; images and `resource_link` need the lower-level `McpServer.addTool` registration, which accepts a `CallToolResult` or an `InputRequired` |
| No `tasks/` method anywhere in `McpSchema.ts` or `McpServer.ts` | `grep -c` prints 0 | The Tasks extension needs our own layer or an upstream change; jobs come first |
| `McpServer.elicit` is a legacy reverse request; the modern multi round-trip result is `McpSchema.InputRequired`, returned from a raw `addTool` handler | source | Consistent with "elicitation is not the gate" |
| A stdio server built from a `Toolkit` answers a **legacy** `initialize` and a **modern** `server/discover` on one process and lists the same tools in both | run: both eras, [`stdio-both-eras.txt`](0016-evidence/stdio-both-eras.txt) | The dual-era choice costs nothing on stdio |
| Any use of `effect/ai/*` is an `unstableApiUsage` error under the repository's `tsconfig.json` until the module is added to `allowedUnstableApis`; a published package that uses it takes the `~4.1.0` peer range (the release rules gate this) | run: [`typecheck.txt`](0016-evidence/typecheck.txt); `tools/quality/release.ts` | The implementing slice adds `effect/ai/*` entries to the allow list and the `mcp` package declares `effect: ~4.1.0` |

### The clients

Cells marked (V) were run here. Everything else is Sourced from the pages in [`primary-sources.md`](0016-evidence/primary-sources.md); "not documented" means the cited pages say nothing, which is not evidence that it is unsupported. The "Claude apps" column is claude.ai, the mobile apps and the remote connectors of Claude Desktop, which share limits (Desktop's own local servers are in the first row).

| | Claude Code (CLI, Agent SDK) | Claude apps (web, mobile, Desktop connectors) | Codex (CLI, IDE, ChatGPT desktop) | ChatGPT (web) |
| --- | --- | --- | --- | --- |
| Local stdio server | yes: `claude mcp add --transport stdio`, `.mcp.json`; it connected to a stdio Effect server (V) | not for connectors (below); Claude Desktop alone also runs local servers from `claude_desktop_config.json` or an **MCPB bundle**, and MCPB is loaded by **macOS and Windows** builds only | yes: `[mcp_servers.<name>]` in `config.toml`; `codex mcp add` accepted it and `codex mcp list` printed it, with no handshake result (V) | no; a private server needs **Secure MCP Tunnel**, which reaches a stdio command or an HTTP URL |
| Remote Streamable HTTP | yes: `--transport http`, headers, OAuth | custom connector; Claude connects **from Anthropic's cloud**, so the URL must be public | yes: `url`, bearer token, or OAuth with CIMD or DCR | public HTTPS or Secure MCP Tunnel; OAuth, none, or either |
| Protocol revision | negotiates; `2026-07-28` with servers that offer it | follows `2025-03-26`, `2025-06-18`, `2025-11-25` | not stated; docs cite the `2025-06-18` lifecycle (**I1**) | not stated; same (**I1**) |
| Package | plugin: `.claude-plugin/plugin.json`, `.mcp.json`, `skills/`; `claude plugin validate` ran (V) | connector (custom or directory); Desktop local: `.mcpb` (`manifest.json`, `user_config`; `mcpb validate`) | Agent Plugins (`plugin.json`, `mcp.json`, `skills/`) from a marketplace, in the CLI and the desktop app, **not the IDE extension**; a local marketplace installed in an isolated home registered the plugin's `mcp.json` server (V) | the same plugin format; a server is added at chatgpt.com/plugins ("Add custom MCP server") |
| Skills and instructions | `.claude/skills/`; server `instructions` cut at **4,096 characters** | not documented | `.agents/skills`; AGENTS.md up to 32 KiB; keep the **first 512 characters** of server `instructions` self-contained | the same 512-character guidance |
| Approval of tool calls | per-tool permission; `readOnlyHint` lets calls run in parallel; an `Elicitation` hook answers a dialog without a person | per-tool approval with "Allow always" | `default_tools_approval_mode`: `auto`, `prompt`, **`writes` (prompts for tools not marked read-only)**, `approve` | **write actions need confirmation by default; a tool without `readOnlyHint` is a write**; a choice can be remembered for a conversation |
| Result size | 25,000 tokens (configurable); text above **50,000 characters** goes to a file; a tool may set `_meta["anthropic/maxResultSizeChars"]` up to 500,000; an image is shown scaled and saved | about **150,000 characters** | `tools.<tool>.output_token_limit` | no documented limit found (**I8**); through a tunnel **10 MiB** per message |
| Time per call | wall clock default about 28 hours; idle abort at 5 minutes (HTTP) or 30 (stdio); a main-conversation call over **2 minutes** becomes a background task | **240 seconds** | `tool_timeout_sec`, default **60** | through a tunnel **120 seconds** per request, queue time included, progress does not extend it |
| Long-running | **MCP tasks**: beta; terminal CLI, Agent SDK and GitHub Actions only, not the desktop app or VS Code; needs Claude Code **2.1.304** and a `2026-07-28` connection; the installed version is **2.1.295** (V) | not documented | no Tasks support documented | no Tasks support documented |
| Binary results | an image in a tool result is shown scaled and saved to a file; no audio or video block exists in MCP | text and image tool results; text and **binary resources**; **no** sampling and **no** resource subscriptions | not documented | not documented |
| Elicitation | form and URL on direct connections; form only on claude.ai connectors | not documented (**I7**) | OpenAI's server guide recommends it for missing inputs and forbids secrets | the same guide |
| Other limits | no fixed tool count: tool search defers definitions | Free plan: one custom connector | | **Pro: read and fetch tools only; full MCP needs Business or Enterprise/Edu**; **web only, no mobile**; after an admin approves, the **tool list is a frozen snapshot** until refreshed; 600 requests per minute through a tunnel |

### What the research changes in the design

1. **Dual-era server.** Hosted Claude follows the legacy revisions; Claude Code negotiates the modern one. Serving only `2026-07-28` would cut off the hosted apps; serving only legacy would lose Tasks and the stateless transport. Proposed: `2026-07-28`, `2025-11-25`, `2025-06-18`.
2. **No call blocks beyond about five seconds.** The shortest documented deadlines are 60 s (Codex default) and 120 s (tunnel). A build is a **job**; `build_start` returns a handle and `job_get` is polled. Tasks are layered on later for the clients that have them.
3. **No raw media through the model.** The agent gets observations (a frame, audio statistics, subtitles, stream facts); the human gets files by link. A result never exceeds 45,000 characters (the JSON is sent twice and Claude Code files anything above 50,000).
4. **Annotations are enforced, not trusted.** ChatGPT and Codex use `readOnlyHint` to decide confirmations and treat its absence as "write"; the spec says clients may not trust annotations. All four hints are explicit on every tool, and every rule is checked again in the handler.
5. **Tool names are `snake_case` ASCII** (letters, digits, `_`): Claude Code rewrites any other character in a plugin tool name to `_`, and a name is part of permission rules and of ChatGPT's frozen snapshot.
6. **Instructions are budgeted**: the first 512 characters carry the loop and the one hard rule; the whole text stays under 4,096.
7. **One declaration, many files.** The Claude plugin layout and the Agent Plugins layout differ (`.claude-plugin/plugin.json` and `.mcp.json` against root `plugin.json` and `mcp.json`); `claude plugin validate` on the portable layout sees no manifest and validates the bare components (V, [`claude-code.txt`](0016-evidence/claude-code.txt)), while Codex installs the portable layout (V, [`codex.txt`](0016-evidence/codex.txt)). Hand-copying is therefore a drift generator.
8. **The hosted apps need a public or tunnelled endpoint; this workstation is Linux.** Claude Desktop cannot run a local server on Linux. The first clients are Claude Code and Codex CLI on the same machine; hosted clients need the remote entry plus a tunnel or a runner.
9. **ChatGPT Pro sees read-only tools.** The inspect and verify-read surface must be useful alone.
10. **Effect's gaps are known**: no Tasks, text-only `Toolkit` results, request-scoped HTTP is modern-only.

### Inferences (not observed, not stated; each names its check)

| # | Inference | Check that settles it |
| --- | --- | --- |
| I1 | Codex and ChatGPT speak a legacy revision | the `initialize` parameters (legacy) or the per-request `_meta` (modern) in the request log of our own server, in the operator's session with each client |
| I2 | Effect's legacy HTTP adapter needs state that a Worker isolate does not keep | `--requirements 2025-11-25` conformance against the Worker build (F6) and a hosted Claude connect (operator) |
| I3 | Claude Code counts `structuredContent` apart from the text block for its 50,000-character rule | a result of 60,000 characters of structured content with a short text block, in a real session |
| I4 | Extension support per client (Tasks, Skills, Apps) | the matrix page's cells, which the fetched text lacks, or a probe |
| I5 | `@simplewebauthn/server` is MIT and fits the approval page | read its licence and the gate's licence policy (`docs/design/third-party.md`) |
| I6 | Alchemy v2 has Worker and container resources at the version the repository will use; hosted APIs restrict function names to letters, digits, `_` and `-` | `alchemy` docs at the pinned beta; the Claude and OpenAI function-name rules |
| I7 | hosted Claude apps support elicitation | a server that requests it, in a real session |
| I8 | ChatGPT has a tool-result size limit | an oversized result in a real session |
| I9 | A rebuild on another machine (a CI runner) gives the same decoded frames and audio as the build on the workstation (spec 0001 F6 states determinism for the same machine) | build one story on both and compare with `compareBuilds` |

## The lifecycle on the compiler that exists

The compiler's model: a **Story** (one Screenplay) is read by the Fountain importer into the **IR** (`Graph`, JSON codec `jsonCodec`, JSON Schema `graphJsonSchema`), turned into a **Plan** (`buildPlan`, `planOf`, reviewed with `reviewText`), scheduled against narration into a **Timeline** (`schedule`), and built by `buildProgram` over the seven services into a **build directory** (`deck.html`, `<name>.mp4`, `<name>.vtt`, `plan.json`, and `build.json` last, which lists every file with its SHA-256, the adapters with their egress and settings, and the provenance of every cached asset). `@tsukuri/verify` re-reads the written files and the source and returns one `Verdict` per falsifier (`runChecks`: F1 to F5 and F7 to F9; `compareBuilds`: F6). The compiler's own release is a manual workflow with an environment approval (`release.yml`, modes `check` and `publish`, gated by `releaseWorkflow.test.ts`).

What each verb means for a project, what already exists, and what is missing:

| Verb | Meaning for a Tsukuri project | Reused as it is | Missing (named gap) |
| --- | --- | --- | --- |
| **create** | A new project: a directory in the workspace root holding `story.fountain`, optionally `tsukuri.config.json`, and a speech cache; from text or a template | `fountainImporter`, `buildPlan` (to validate the first text), `decodeSelection` | **G1** no project concept, no confined root and no template catalogue; **G11** `tsukuri.config.json` is a file the agent can edit that selects adapters |
| **inspect** | Read the Screenplay, the diagnostics, the Plan (review text, JSON, timing), the IR, the build manifest, and observations of the artifacts | `planOf`, `reviewText`, `schedule`, `graphJsonSchema`, `grammarDocument`, `lintPlan`, `BuildManifestSchema` | **G2** `lint` prints rows (`planErrorRow`, `diagnosticRow`) instead of returning data; **G8** the observation primitives (`frameAtFraction`, `locateSounds`, wav onsets) are private to `verify` and shaped as verdicts |
| **revise** | Produce a new **Revision** of the Screenplay, re-lint, re-plan, show what changed | the importer and the Plan for the result | **G4** no edit operation, no history, no compare-and-swap; the IR cannot be edited because the IR-to-Fountain artifact renderer is not built; **G3** `planDiff` (in `verify`) returns the first difference as a path |
| **deliver** | Produce the artifacts of a revision and let the human reach them | `buildProgram` (atomic `<out>.partial`, `build.json` last), selection, stand-ins | **G5** no job, progress, cancel or admission control in the runtime (admission is a shell script, `headroom.sh`); **G6** the output path is the caller's and an earlier build there is deleted by `clearEarlier` |
| **verify** | Run the falsifiers on a build and keep the outcome as evidence about exactly that build | `runChecks`, `compareBuilds`, `Verdict`, `lintPlan` (contrast and timing rules) | **G7** no record bound to digests, verifier version and environment; no store; `verify` and the composition root `cli` are **private** packages |
| **release** | Freeze a verified build as an immutable, digest-addressed bundle that a human approves | `BuildManifest` (files, sha256, adapters, egress, asset provenance) is the base of the bundle manifest | **G9** no bundle schema, no policy, no per-build licence and notice summary (the narrator model, the encoder), no approval |
| **publish** | Send a released bundle to an external channel and keep a receipt | nothing for projects; the compiler's `release.yml` is the precedent (manual dispatch, environment approval, provenance) | **G9** no `Publisher` service and no channel; **G12** the approval is not a construct |

Other gaps: **G10** the accessible-by-default aim has captions (F2), contrast and timing lint, but no release policy that requires them; **G13** a build made with the silent stand-in narrator prints `N/A (silent stand-in)` for F8 and exits 0, so "all verdicts pass" would release a silent video; **G14** the registry that turns a selection into Layers lives in `packages/cli/src/adapters.ts`; a second composition root would duplicate it (the duplication gate has threshold 0), so it moves to a shared tools-tier package first.

Reuse list (nothing below is reimplemented): the importer, Plan, schedule and review text; `GraphSchema` and its JSON Schema; `grammarDocument`; `lintPlan`; `buildProgram` with the `Composition` registry; `BuildManifestSchema`; `runChecks`, `compareBuilds` and `Verdict`; the selection registry (`choices`, `defaults`, `decodeSelection`); `requireOutputName` as the model for a plain-name rule; `AdapterInfo.egress`; the stand-ins; the `Digest` service; `Schema.TaggedError` failures (they already carry a `message`, a line, a Line id); the tier gate and its `oxc-parser` import scan; the release rules; the generate-and-drift-test pattern (`writeGenerated.ts`, `grammarCopies.ts`).

## Design

### Principles

- **Authority by construction.** What an agent must not do is not a rule a handler checks; it is a capability no agent-callable handler can name. `Publisher` and the approval executor are services that no tool handler's requirements contain (checked by a type test and an import scan).
- **Status is derived, never stored.** The stage of a revision is a pure function of facts; there is no `stage` field to forge or to forget to update.
- **Content addresses are the handles.** A revision, a build, a record and a release are named by SHA-256 of their content; a handle can name only what exists, and a changed byte is a different handle.
- **The server computes; the agent asks.** No tool takes a verdict, a path, a status, or a digest it would have to trust: an id is looked up, and an unknown id is `NotFound`.
- **Additive only.** In version 1 no tool deletes or overwrites: revisions, builds, records and releases accumulate. Every mutating tool therefore sets `destructiveHint: false` truthfully.

### Layers and packages

```text
agent ── MCP (stdio | Streamable HTTP) ──► @tsukuri/mcp          tools tier   McpServer layers, handlers (Toolkit.toLayer), bins, Worker entry
                                              │ implements
                                              ▼
                                       @tsukuri/lifecycle        library tier  declarations as data: ids, Stage, tools, policy, approval subject,
                                              │                                   instructions, distribution, tools.lock.json (pure, protocol-neutral)
                                              ▼ services it needs (tags + contracts + stand-ins in @tsukuri/services)
              Projects  Revisions  Jobs  Observer  Evidence  Approvals  ApprovalExecutor  Publisher
                                              │ live Layers
                                              ▼
 FileSystem (confined)   buildProgram + Composition   runChecks/compareBuilds   ffmpeg/Chromium   approval adapter   publisher adapters
```

- `@tsukuri/lifecycle` (**library**): imports `@tsukuri/core` and `effect` only. Holds what is protocol-neutral and pure, so the studio's agent panel and any second adapter reuse it and `effect/ai` stays out of it.
- `@tsukuri/mcp` (**tools**, like `cli`): the only package that imports `effect/ai`. Two entries: `bin/tsukuri-mcp.ts` (stdio, the composition root: Node platform layers, Digest, state directory, workspace root) and `src/worker.ts` (a `fetch` handler through `HttpRouter.toWebHandler`; capability set `authoring` only, see below).
- New service tags in `@tsukuri/services` (each with a contract suite and an in-memory stand-in, as for the seven existing ones): `Projects`, `Revisions`, `Jobs`, `Observer`, `Evidence`, `Approvals` (the records), `ApprovalExecutor` (consumes one valid approval and runs the `Publisher`; used by the approval handler only) and `Publisher`.
- A shared tools-tier package holds the adapter registry now in `cli/src/adapters.ts` (**G14**), so `cli` and `mcp` are two roots over one table.
- The tier table gains `lifecycle` (libraries) and `mcp` (tools); `tools/quality/tiers.ts` and `knip.json` follow (the "Add an adapter" checklist of `AGENTS.md` is the template).

Capacity (stated before the primitive, as the Effect guidance asks): `Jobs` runs **one** heavy job at a time (a `Semaphore` of one permit) with a **FIFO queue of four**; a fifth request fails `Busy` with the queue length; admission also reads memory and load as `headroom.sh` does, through a service so a test can answer; shutdown interrupts the running job, which removes its `<out>.partial` (the existing build behaviour) and records the job `interrupted`.

### Identities and the stage of a revision

Quoted from the declarations that were type-checked against the installed Effect 4.1.0 ([`declarations.ts.txt`](0016-evidence/declarations.ts.txt), [`typecheck.txt`](0016-evidence/typecheck.txt): no finding on this file):

```ts
const Sha256 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

export const ProjectId = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,62}$/u)
).pipe(Schema.brand("ProjectId"));
export const RevisionId = Sha256.pipe(Schema.brand("RevisionId")); // digest of Screenplay and config bytes
export const BuildId = Sha256.pipe(Schema.brand("BuildId"));       // digest of that build's build.json
export const RecordId = Sha256.pipe(Schema.brand("RecordId"));     // digest of the canonical record
export const ReleaseId = Sha256.pipe(Schema.brand("ReleaseId"));   // digest of the release manifest
export const JobId = Schema.String.check(Schema.isPattern(/^job_[0-9a-f]{32}$/u)).pipe(Schema.brand("JobId"));
export const ApprovalId = Schema.String.check(Schema.isPattern(/^apr_[0-9a-f]{32}$/u)).pipe(Schema.brand("ApprovalId"));

/** Text that came out of a project: a Screenplay line, a narration, a diagnostic that quotes one. Untrusted by type. */
export const UntrustedText = Schema.String.pipe(Schema.brand("UntrustedText"));

export const stages = ["drafted", "planned", "built", "verified", "candidate", "released", "published"] as const;

/** Total and pure: the highest stage whose facts all hold. Each fact is read from the project and the state directory. */
export const stageOf = (facts: Facts): Stage => {
  const verified = facts.built && facts.verifiedByServer;
  if (verified && facts.candidate && facts.releaseApproved && facts.published) return "published";
  if (verified && facts.candidate && facts.releaseApproved) return "released";
  if (verified && facts.candidate) return "candidate";
  if (verified) return "verified";
  if (facts.built) return "built";
  return facts.lintClean ? "planned" : "drafted";
};
```

A **Revision** is the Screenplay plus config bytes; revising never edits, it creates a new revision and moves the project's head. A file changed outside the tools is just another revision the next time the project is read: the head is always the digest of the files on disk. Each tool result carries `stage` and `allowed` (the tool names legal now, derived from the stage), so an agent does not have to guess the order.

### The tool surface (Proposed; 20 tools)

Names are `snake_case`. `RO` = `readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false`. `ADD` = `readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false`: additive, and idempotent because the identity is content-addressed (the same call returns the same revision, build, record or proposal). The capability column says where a deployment may omit the tool (the list is fixed per deployment, never per connection).

| Tool | Capability | Hints | Input (all objects are `Strict`) | Output (`structuredContent`) | Dry run |
| --- | --- | --- | --- | --- | --- |
| `project_list` | authoring | RO | `cursor?`, `limit?` | projects with head revision and stage | no |
| `project_get` | authoring | RO | `project` | head, revisions, builds, jobs, the stage of each, `allowed` | no |
| `project_create` | authoring | ADD | `project`, `screenplay` or `template`, `idempotencyKey?` | the first revision, diagnostics | yes |
| `docs_get` | authoring | RO | `topic`: `grammar`, `glossary`, `lifecycle` | the generated grammar document, the glossary, the lifecycle skill | no |
| `story_read` | authoring | RO | `project`, `revision?`, `fromLine?`, `toLine?` | revision, `UntrustedText` lines, byte size | no |
| `story_revise` | authoring | ADD | `project`, `baseRevision`, `edits[]` (replace-lines with the expected text of the lines replaced) or `screenplay`, `dryRun?` | new revision (or the existing one with the same digest), diagnostics, Plan diff | yes |
| `story_lint` | authoring | RO | `project`, `revision?`, `timing?` | diagnostics (line, rule, severity, `UntrustedText` message), counts | no |
| `plan_get` | authoring | RO | `project`, `revision?`, `view`: `review`, `json`, `timing` | the Plan in that view (paged) | no |
| `plan_diff` | authoring | RO | `project`, `from`, `to` | structured differences: scenes, elements, effects, lines | no |
| `build_start` | build | ADD | `project`, `revision`, `selection?` (registry values only), `allowEgress?` (default none), `dryRun?`, `idempotencyKey?` | `job`, or the existing `build`; `pollAfterMs`; the adapters and their egress | yes |
| `build_cancel` | build | ADD | `job` | job state | no |
| `job_get` | build | RO | `job` | state `queued`, `running`, `succeeded`, `failed`, `cancelled`, `interrupted`; phase; the typed failure; the `build` when done | no |
| `build_get` | build | RO | `project`, `build` | the manifest summary, the artifacts (`resource_link` each, size, SHA-256, media type), the adapters and egress, the records about it | no |
| `artifact_observe` | build | RO | `project`, `build`, `kind`: `frame` (`at`: frame, ms, or a named event; `maxBytes`), `audio` (`fromMs`, `toMs`), `subtitles`, `chapters`, `streams` | frame as an **image block** (JPEG, at most 64 KiB) plus metadata; audio as loudness per 100 ms bucket and onsets, never samples; subtitles and chapters as cue lists; stream facts | no |
| `verify_run` | verify | ADD | `project`, `build`, `against?` (a second build, for F6), `idempotencyKey?` | a `job`; then a `VerificationRecord` id | yes |
| `evidence_get` | verify | RO | `record` | the record (verdicts, subject digests, verifier, environment, trust) | no |
| `release_propose` | release | ADD | `project`, `build`, `notes?`, `dryRun?` | the release manifest and its digest, the policy outcome, the approval request (`ApprovalId`, a human link, expiry); or `NotVerified` with the reasons | yes |
| `release_get` | release | RO | `release` | manifest, status (`proposed`, `approved`, `denied`, `expired`), approval link | no |
| `publish_propose` | publish | ADD | `release`, `channel` (a value of the deployment's configured channels), `target`, `dryRun?` | the proposal, the approval request, what the channel would receive | yes |
| `publish_get` | publish | RO | `proposal` | status, the receipt (what, where, when, digest) once published | no |

What is **not** a tool, deliberately: approve, deny, execute a publish, delete, overwrite, set a verdict, set a stage, read or write an arbitrary path, run a command, change `tsukuri.config.json`, dispatch any workflow. The approval is a different surface (next section).

Conventions every tool follows (each is a falsifier below):

- **Results are data.** `structuredContent` conforms to the declared output schema; the text block is a one-line summary of it (so the Toolkit's duplicate JSON is the only large part; budget 45,000 characters per result). A list takes `cursor` and `limit` and returns `nextCursor`; a truncation is marked, never silent.
- **Failures are values.** Each tool declares a tagged-error schema (`ProjectNotFound`, `Stale`, `NotVerified`, `PolicyViolation`, `Busy`, `ApprovalRequired`, `Invalid`, and the compiler's own `TaggedError`s with their line and Line id) and returns it with `isError: true`. A JSON-RPC protocol error means a malformed request, nothing else.
- **Project content is untrusted by type.** Every string that originates in a Screenplay, a narration, an Element's text or a path derived from them has the schema `UntrustedText`; its JSON Schema carries `"x-tsukuri-untrusted": true`. The server's `instructions` say these fields are data.
- **Idempotency.** `idempotencyKey` (any string, at most 128 characters) makes a retry after a lost response return the first result; the key is scoped to the principal and the tool for 24 hours. Content addressing already makes `story_revise`, `build_start`, `verify_run` and the two proposals idempotent without a key.
- **Dry run.** `dryRun: true` computes and returns what would be written, the diagnostics and the policy outcome, and writes nothing (a test compares the state directory before and after).
- **Hints are explicit and true.** `build_start` and `verify_run` are `openWorldHint: false` because in version 1 every selectable adapter is local (`egress: none`); the day a hosted adapter is selectable, that is a revision of this spec, not a flag.

A declaration is data; the adapter derives the MCP tool from it (`Tool.make` with the declaration's input as parameters, output as success, errors as failure, `Strict`, and the four hints). Quoted from the type-checked declarations:

```ts
export interface ToolDeclaration<I extends Schema.Top, O extends Schema.Top, E extends Schema.Top> {
  readonly name: string;
  readonly title: string;
  readonly description: string; // "Use this when ..." first, the model reads it to choose the tool
  readonly capability: typeof Capability.Type; // authoring | build | verify | release | publish
  readonly annotations: typeof Annotations.Type; // destructive, idempotent, openWorld, readOnly: all four, no defaults
  readonly input: I;
  readonly output: O;
  readonly errors: E;
}
```

**Resources** (read-only, never writable through any tool): `tsukuri://workspace` (projects), `tsukuri://p/{project}/story`, `.../plan`, `tsukuri://p/{project}/b/{build}/build.json`, `.../subtitles.vtt`, `.../chapters`, `tsukuri://evidence/{record}`, `tsukuri://grammar`, `tsukuri://glossary`. Text artifacts under the result budget are text resources; `deck.html`, `.mp4` and `.flac` are `resource_link`s only. Clients that handle resources poorly are covered by `docs_get`, `story_read` and `build_get`.

**Prompts** (user-invoked templates): `create_explainer`, `revise_story`, `prepare_release`. **Instructions**: generated from the lifecycle data; the first 512 characters say what the loop is and the hard rule ("release and publish are proposals; a person approves them elsewhere"), the whole stays under 4,096 characters (a test measures both). **Skill**: one hand-written `skills/tsukuri-lifecycle/SKILL.md` in `@tsukuri/lifecycle` is the single prose source; every plugin tree gets a generated copy.

### Binary artifacts and observation

- The agent observes; the human receives. `artifact_observe` extracts what a model can use from the written files with the tools the verifier already trusts (ffmpeg through `MediaTools`, the frame and onset functions now private to `verify`, moved behind an `Observer` service, **G8**). A frame is a downscaled JPEG of at most 64 KiB as an `ImageContent` block; the Toolkit path emits only text, so this tool registers through the lower-level `McpServer.addTool`.
- Links are `resource_link` blocks with `uri`, `mimeType`, `name`, size and SHA-256 in `structuredContent`. In local mode the URI is `file://` under the state directory (the human opens it); in remote mode it is an HTTPS URL on the artifact path of the deployment, signed and short-lived. No tool returns a `blob` above 64 KiB of raw bytes (about 87,000 characters of base64), which keeps a result under the hosted 150,000-character limit.
- Why not chunked reads of the mp4: an agent cannot use video bytes, a person can open a file, and a 10 MiB tunnel limit and a 45,000-character budget would turn a three-minute explainer into hundreds of calls.

### Long-running work

`build_start` and `verify_run` return a `job` within five seconds and never wait for the work. A job is a file in the state directory (`jobs/<id>.json`); its state is derived (a `build.json` that exists means the build finished; a `.partial` with no live process means `interrupted`). So a stdio server that dies with its client leaves no unknown state, and a restart reports the truth. `job_get` carries `phase` (`speech`, `schedule`, `render`, `capture`, `encode`, `manifest`), `pollAfterMs`, and the typed failure. The Tasks extension is added later for the clients that have it (Claude Code 2.1.304 or later on a modern connection): it wraps the same job and is a separate slice because Effect has no Tasks support (above). Request-scoped `notifications/progress` is not used for jobs; a job outlives its request.

### The gate: release and publish

State machine (stage of one revision; the arrow label says who may cause the step):

```text
 drafted ──(lint clean: agent)──► planned ──(build_start: agent)──► built
                                                                      │ verify_run: the agent asks, the server verifies
                                                                      ▼
                                                                  verified
                                                                      │ release_propose: agent
                                                                      ▼
                                                                  candidate
                                                                      │ approval of the release: a person, out of band
                                                                      ▼
                                                                  released
                                                                      │ publish_propose: agent
                                                                      ▼
                                                                  publish proposal
                                                                      │ approval of the publish: a person, out of band;
                                                                      │ the approval handler, not an agent, runs the Publisher
                                                                      ▼
                                                                  published

 any stage ──(story_revise: agent)──► a new revision that starts at drafted or planned; the old revision keeps its stage
```

Agent-allowed: every step except the two approvals. There is **no tool that executes a publish**: the execution happens inside the approval handler, which a person triggers; the agent can only read its status. The approval handler is not an MCP endpoint: under option A below it is the workflow that GitHub runs after the click, under option B a page on a separate path with its own authentication. `Publisher` and `ApprovalExecutor` are not in the requirements of any tool handler (F2).

**Why MCP elicitation is not the gate** (each point Sourced from the table above):

| Reason | Detail |
| --- | --- |
| The client answers, not a person | The spec lets a client present elicitation however it likes; Claude Code documents an `Elicitation` hook that answers a dialog without a person, and cancels a task that asks for input in a non-interactive run; the server cannot tell a click from a harness |
| The retry is built by the client | In the modern revision the answer travels in `inputResponses` on a retried request that the client constructs; `requestState` must be integrity-protected by the server (the conformance suite has a scenario `input-required-result-tampered-state`) |
| Support is uneven | Claude Code declares form mode only on claude.ai connector connections; hosted Claude's own support is undocumented (I7); OpenAI recommends elicitation for missing inputs and documents no authentication of whoever answers |
| Secrets cannot go through it | Form mode must not collect credentials; an approval that needs a strong factor cannot be a form |
| Confirmations exist already and are advisory | ChatGPT asks before a write action; Codex `writes` mode prompts for tools not marked read-only. These are a second line, not the first |

**What is sound** is an out-of-band approval with six conditions. URL-mode elicitation is a good way to *deliver* its link (the client must show the host and ask consent), but the soundness is in the conditions, not in the delivery:

| # | Condition | Why |
| --- | --- | --- |
| A1 | The approver is a different principal from the requester, authenticated outside the MCP channel | an agent that is prompt-injected holds the requester's credential and nothing else |
| A2 | The approval binds `{action, subject digest, target, expiry, nonce}` (`ApprovalSubject`: `ReleaseBuild { build, record }` or `PublishRelease { release, channel, target }`) | an approval cannot be replayed for another build, bundle or destination |
| A3 | Single use, short expiry (default 15 minutes), consumed atomically | no stockpile |
| A4 | The page shows a summary rendered from server-held data (the manifest, the verdicts computed now, the egress and the destination); the agent's `notes` appear labelled untrusted and are length-limited | the agent cannot write the question it is approved on |
| A5 | **The gate recomputes, it does not read**: at approval the server runs verification again on the exact digests and the page shows that result | an agent's earlier claim, or a forged record, is irrelevant |
| A6 | Execution re-hashes every file against the manifest immediately before the Publisher runs; an approved-then-modified bundle refuses; the approval log is append-only | closes the time between check and use |

Approver channels behind one `ApprovalGate` service (the choice is an **Open** decision):

| Option | How the approver is authenticated | Cost | Fit |
| --- | --- | --- | --- |
| **A. CI environment gate** | A GitHub user with the "required reviewers" role clicks approve on an environment (`npm-release` is the compiler's precedent; the operator's log line 124 records that the click stays his); the workflow checks out the commit, rebuilds and verifies (A5), and publishes with provenance | zero new authentication code; also gives an attested verify runner. Needs the revision **committed and pushed by a person**: the MCP server holds no repository credential by design (the release bot is not granted file edits either, log line 125), so `release_propose` on an uncommitted revision returns `NotCommitted`. The released bytes are the CI build's, so cross-machine reproducibility matters (**I9**) | the compiler's own packages; any project that lives in a repository |
| **B. Passkey page** | WebAuthn user verification on a page served by the approval adapter (loopback or the Worker) | a small web surface and a WebAuthn library (I5); works for local-only projects | a project with no repository; offline |
| **C. Chat channel** | The operator's account in a chat app, through the release bot he is building | weakest factor; useful as a notifier of A or B | later |
| **D. MCP elicitation only** | none beyond the client | none | **not sound** |

### Where verification evidence lives, and why an agent cannot self-certify

`VerificationRecord` (type-checked in `declarations.ts.txt`): `build`, `revision`, `verifier {name, version}`, `environment {chromium, ffmpeg, standIns}`, `verdicts[]`, `finishedAt`, `trust`. The `Evidence` service is the only writer; it runs the verifier itself on the server's own copy. The records live in the **state directory** (`$XDG_STATE_HOME/tsukuri/<workspace>/evidence/<record>.json`, named by digest), outside the workspace root, never exposed as a writable resource, and appended only.

- No tool takes a `Verdict`, a `RecordId` to trust, or a stage as input (F3). A test walks every input schema and fails if one can carry a verdict-shaped value.
- `release_propose` loads the record by digest and recomputes `stageOf`; a record planted in the project directory is never read.
- Policy: a release needs every verdict `pass`. A `na` verdict (the silent stand-in narrator prints `N/A (silent stand-in)` and exits 0, **G13**) blocks a release unless the policy names it; the default policy lists none. A stand-in in `environment.standIns` is shown on the approval page.
- **Trust levels, said honestly.** `witnessed`: written by a local verifier under the same operating-system user as the agent. If that agent also has a shell it can edit the state directory; MCP cannot defend against an agent that already has the user's privileges. `attested`: written by a runner the agent cannot write to (a CI job with an OIDC identity and provenance, or the remote runner). The guarantee "an agent cannot release or publish" is for **MCP-confined agents** (ChatGPT, claude.ai, any sandboxed session); against a shell-holding local agent the guarantee is A5 and A6 plus the approver's own authentication, which a local agent cannot forge (a WebAuthn assertion or a GitHub review needs a person).

### Transports, runtime and capability sets

| Entry | Transport | Eras | Capabilities | Composition |
| --- | --- | --- | --- | --- |
| `tsukuri-mcp` (stdio) | stdio | `2026-07-28`, `2025-11-25`, `2025-06-18` (Verified to serve both eras on one process) | authoring, build, verify, release; `publish` only when a `Publisher` adapter is configured | Node platform layers, `TSUKURI_ROOT` (workspace root), `TSUKURI_STATE` (state directory), selection registry, the confined `Projects` layer |
| `tsukuri-mcp --http` (loopback) | Streamable HTTP via `layerHttp`; binds `127.0.0.1`; `allowedOrigins` set; OAuth optional | same | same | same, for ChatGPT and Claude web through a tunnel |
| Worker entry | Streamable HTTP via `HttpRouter.toWebHandler` and `layerHttpRequestScoped` | modern; legacy only after I2 is settled | **authoring** (pure `@tsukuri/core` and `@tsukuri/lint`: no browser, no ffmpeg) | Alchemy v2 resources; a store behind `Projects`; the OAuth resource-server metadata |

The Worker can serve only what `@tsukuri/core` and `@tsukuri/lint` can do (they import no Node built-in, spec 0001 F11). Builds need Chromium, ffmpeg and a speech model: they run on the operator's machine (stdio or tunnel) or on a runner (an **Open** infrastructure decision). A deployment's capability set fixes `tools/list`; a tool whose capability is absent is not listed, and it is never listed per connection.

### Client integrations as derivations of one source

The single source is a `Distribution` value in `@tsukuri/lifecycle` (server name `tsukuri`, description, the generated instructions, the transports with their command or URL template, the environment each needs, the skill directory, licence, homepage `https://tsukuri.dev`, repository). A generator in the style of `genGrammar.ts` (it uses `writeGenerated`) writes, under `packages/mcp/clients/`, and a test regenerates in memory and compares (the pattern of `grammarCopies.ts`; the operator's `org-D6` pick for the lifecycle toolchain copies was copies plus a drift test):

| Output | For | Validated headless by |
| --- | --- | --- |
| `claude-code/.mcp.json` | project-scope Claude Code | `claude mcp add-json` into an isolated `CLAUDE_CONFIG_DIR`, then `claude mcp get` shows `Connected` (the health check starts the server and handshakes; Verified for a stdio server) |
| `claude-plugin/` (`.claude-plugin/plugin.json`, `.mcp.json`, `skills/`) | Claude Code plugin | `claude plugin validate` (Verified: a manifest without `author` passes with a warning; `--strict` turns warnings into failures, so the generator writes `author`) |
| `agent-plugin/` (`plugin.json`, `mcp.json`, `skills/`, Agent Plugins 1.0.0) and `agent-plugin/.agents/plugins/marketplace.json` | Codex and ChatGPT | `codex plugin marketplace add` then `codex plugin add` in an isolated `CODEX_HOME`, then `codex plugin list` shows `installed, enabled` and `codex mcp list` shows the server (Verified) |
| `codex/config.toml` snippet | Codex without plugins | `codex mcp add` accepts the equivalent (Verified); a TOML decode in the drift test |
| `mcpb/manifest.json` | Claude Desktop on macOS and Windows | `mcpb validate` (the CLI is `@anthropic-ai/mcpb`; not run here) |
| `connectors/claude-ai.md`, `connectors/chatgpt.md` | the hosted apps: a card with the URL, the authentication type, the scopes, the callback URLs (`https://claude.ai/api/mcp/auth_callback`; Claude Code's loopback), and which tools to leave enabled (read-only on ChatGPT Pro) | text drift test only; adding the connector is the operator's act |

Every generated file starts with a marker naming its source and the command that regenerates it, and the drift test fails on a file that lacks the marker or differs from the regeneration. `.mcp.json` carries no secret: secrets reach the server through the environment, and the generator rejects a value that matches the secret-name pattern `AGENTS.md` already uses for adapter settings.

OpenAI's plugin guide says it also accepts "legacy and Claude-compatible manifests" and a `.claude-plugin/marketplace.json` (Sourced). If `codex plugin add` accepts the generated Claude tree, the generator emits one plugin tree less; F14 on the head of slice S2 decides that, not this spec.

**What an operator runs** (illustrative; the generator writes the exact text, and the example assumes decision D3 option A, a checkout run through devenv). `devenv shell -- cmd` writes its status lines to stderr and the command's output alone to stdout, so it can start a stdio server (Verified: [`devenv-stdout.txt`](0016-evidence/devenv-stdout.txt); a server must write nothing else to stdout):

```sh
# Claude Code, this repository
claude mcp add --scope project --transport stdio tsukuri -- devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts
# Codex (the generated config.toml also sets cwd to the checkout)
codex mcp add tsukuri -- devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts
# Claude Code or Codex, as a plugin: install the generated tree (claude plugin / codex plugin add)
# claude.ai and ChatGPT: the connector card names a URL; the operator adds it in the app (no file exists for that)
```

### Threat model (Proposed)

| # | Threat | Mitigation | Falsifier |
| --- | --- | --- | --- |
| T1 | **Prompt injection through project content** (a Screenplay line, a narration, a lint message that quotes one, a file name) steers the agent | content fields are `UntrustedText` and marked in the schema; the instructions say they are data; **the blast radius is bounded by construction**: no publish path, no deletion, additive revisions, egress declared, one job at a time | F9, and the operator's injection drill F10 |
| T2 | **Path traversal and symlink escape** | no tool takes a path; `ProjectId` is a plain name (the rule of `requireOutputName`); `Projects` resolves real paths and refuses a component outside the workspace root, a symlink, an absolute path, a NUL, `..` | F5 |
| T3 | **Secrets** | secrets only from the environment (`Redacted`), never in a result, a record, a manifest or a log; adapter `settings` already reject secret names; the generated client files hold none | F11 |
| T4 | **Publish authority held by the agent** | no execute tool; approval executor and `Publisher` outside every handler; approvals A1 to A6; no OAuth scope for publishing exists on the MCP token | F2, F4 |
| T5 | **DNS rebinding and cross-origin calls** | loopback bind, `allowedOrigins`, `Origin` validated (a spec MUST and a conformance scenario) | F6 |
| T6 | **Resource exhaustion** | one running job, four queued, then `Busy`; result and request size caps; a rate limit per principal; timeouts on every external process | F7, F8 |
| T7 | **Tool poisoning and rug pulls** (the list changes under a user who approved it; ChatGPT freezes it) | deterministic order; `tools.lock.json` (name, digest of description, schemas and hints, and one overall digest) committed and drift-tested, so a surface change is a visible diff in review; a `contractVersion` in `serverInfo` | F1 |
| T8 | **An agent edits config to widen egress** (**G11**) | project config may select only adapters whose `egress` is none; any other adapter needs `allowEgress` set by the deployment, not by the project or the agent | F12 |
| T9 | **Another user's data** in a remote deployment | every call authorizes the principal against the project (a handle is a name, not a capability); the workspace root is per principal | F5 |
| T10 | **A forged annotation or description** | clients treat them as untrusted; the server enforces in handlers; the lock pins them | F1, F2 |
| T11 | **Supply chain** | pinned `effect` family; published packages through trusted publishing with provenance (spec 0009); the Effect `ai` modules are unstable, so the peer range is `~4.1.0` and the repository allow list names each module | release rules |

### Versioning against the alpha packages

| Axis | Rule |
| --- | --- |
| MCP revision | dual-era (`2026-07-28`, `2025-11-25`, `2025-06-18`); a revision is dropped only by a revision of this spec; `server/discover` and `initialize` both report the set |
| Tool contract | `contractVersion` semver in `@tsukuri/lifecycle`, reported in `serverInfo`; additive changes within a minor (a new optional field, a new tool); a rename, a removed field or a changed hint is a major; tagged **unstable** until a second adapter runs it (the ADR's staged adoption, `reebeat-D7`) |
| Packages | `@tsukuri/lifecycle` and `@tsukuri/mcp` are `0.x` and follow the compiler's `0.1.0-alpha.N` cadence if published (the Changesets `fixed` group) or stay private; **Open** (D2, D3) |
| Effect | `effect: ~4.1.0` (unstable `effect/ai`); the family test and the exception re-examination already move with the cohort |
| Distribution | the `private` packages `verify`, `cli`, and the adapters are not on npm; a published `@tsukuri/mcp` cannot depend on them (the release staging gate refuses a dependency on a private package), so how the server reaches a user is **Open** (D3) |

## Falsifiers

Each is observed with a command on the head of the implementing slice. **H** = an agent can run it headless; **O** = needs the operator's hands.

| # | Falsifier (must hold) | Gate | Fails when | Run |
| --- | --- | --- | --- | --- |
| F1 | **The surface is locked.** `tools/list` of every deployment equals `tools.lock.json`; names match `^[a-z][a-z0-9_]{0,63}$`; at most 24 tools; order deterministic; every tool states all four hints; every mutating tool has `destructiveHint: false` and no tool is named like `approve`, `execute`, `delete` or `run` | a test over `McpTest` or a stdio client | a tool, hint or schema changes without the lock changing; a hint is missing | H |
| F2 | **No agent path to authority.** The requirements of every tool handler exclude `Publisher` and `ApprovalExecutor` (a negative type test), and an import scan finds neither tag imported by a handler module; no input schema accepts a verdict-shaped, record-shaped or stage-shaped value | type test and scan in `bun run test` (the scan reuses the `oxc-parser` import reading of `tiers.ts`) | a handler can name `Publisher`; a schema can carry a `Verdict` | H |
| F3 | **No self-certification.** A record file planted in the project directory is ignored; `release_propose` on a build with no server-written record returns `NotVerified`; a forged `RecordId` returns `NotFound` | contract suite of `Evidence` plus a handler test | a planted record is read | H |
| F4 | **The gate holds.** With a probe `Publisher`: `publish_propose` makes **0** calls; a missing, expired, replayed, wrong-digest, wrong-target or other-principal approval makes 0 calls and a typed refusal; one valid approval through the approval handler makes exactly **1** call carrying the approved digest; modifying one byte of a bundle file after approval makes 0 calls (A6); an approved release whose recomputed verification now fails is refused (A5) | contract suite of `Approvals` and `Publisher` stand-ins | any case calls the publisher when it must not, or not once when it must | H |
| F5 | **Confinement.** A corpus of hostile project ids and paths (`..`, absolute, symlink component, NUL, over-long, mixed case, Unicode normalisation) is refused with a typed error and **no** effect outside the root; a second principal cannot read the first's project | `Projects` contract suite on a real temporary directory | any byte is read or written outside the root | H |
| F6 | **Protocol conformance.** `npx @modelcontextprotocol/conformance@<pin> server --url <fixture> --requirements 2026-07-28` and `--requirements 2025-11-25` exit 0 against a test-only fixture server built on the same transport layers (37 and 30 scenarios), including `dns-rebinding-protection` and the `input-required-result-*` scenarios; a baseline of expected failures is allowed only with a written reason | `bun run test` (a spawned fixture) | a required scenario fails | H |
| F7 | **No call blocks.** On a stand-in build, `build_start` and `verify_run` return within 5 s and every other tool within 2 s; `job_get` reaches a terminal state; killing the server mid-build leaves no directory `tsukuri check` accepts (the existing F12 of spec 0001) and the next start reports the job `interrupted`; a fifth queued request returns `Busy` | a stdio client test with `TestClock` for the queue and a real process for the kill | a call exceeds its bound; a partial build is accepted | H |
| F8 | **Results fit.** For worst-case inputs generated by a property test, every result is at most 45,000 characters of JSON, a list is paged with `nextCursor`, a frame is at most 64 KiB, and no `blob` above 64 KiB appears | property test over the output schemas | a result exceeds a bound | H |
| F9 | **Content is typed as untrusted.** Every string field of an output schema that can hold project content is `UntrustedText`, and its JSON Schema carries `x-tsukuri-untrusted`; a hostile screenplay corpus (instruction-like narration, Element text, titles, file names) comes back only inside such fields | schema walk plus corpus test | a project-derived string is a plain `string` | H |
| F10 | **Injection drill.** A model-driven agent given a hostile project and a harmless task does not release, publish, widen egress or leave the project root | a real session per client with the corpus | any of them happens | **O** |
| F11 | **No secret appears** in any result, record, manifest, log or generated client file, with a canary value set in the environment | test with a canary and a grep over the state directory and the generated files | the canary appears | H |
| F12 | **Egress is the deployment's.** A project config that names a non-local adapter fails `PolicyViolation`; `allowEgress` set only by the deployment enables it, and the build prints the egress | handler test | a project file widened egress | H |
| F13 | **Real sessions work.** In Claude Code, Codex, claude.ai and ChatGPT a session performs create, revise, lint, build, observe, verify, `release_propose`, and shows the approval link; the approval cannot be completed from the session | transcripts kept outside the repository, `~/.local/state/tsukuri-verify/<date>-mcp-<client>/` | a step fails or the model completes an approval | **O** |
| F14 | **Installs derive from one source.** The regenerated client files equal the committed ones; every generated file carries the marker; `claude plugin validate --strict`, `claude mcp get` (`Connected`), `codex plugin add` (`installed, enabled`) and `mcpb validate` pass on the generated files in isolated config directories | a drift test and a script that drives the client CLIs | a copy differs, lacks the marker, or a client rejects it | H (`mcpb`: needs its CLI) |
| F15 | **Gates.** `bun run ready` passes: tiers (`lifecycle`, `mcp`), release staging and rules for any package that becomes published, knip, cpd (no second adapter table), the exception registry (any suppression has an entry), the feature map (`Verify skill:` rows, since the tools print results a viewer sees) | `ready` | any gate fails | H |

## What needs the operator's hands

- **Real model sessions** in each client (F10, F13): credentials, billing, the operator's own logged-in sessions; ChatGPT needs a plan that allows full custom MCP (not Pro) and a workspace permission to add a server; claude.ai needs the connector added by its owner; Claude Desktop needs macOS or Windows.
- **Exposure**: a public HTTPS name or a tunnel (OpenAI's Secure MCP Tunnel needs a platform tunnel and an API key; a Cloudflare tunnel for `tsukuri.dev` needs the Cloudflare account); Worker deployment through the Alchemy profile.
- **Authorization server choice and registration** (callback URLs, scopes, client identity), and **passkey or reviewer enrolment** for the approval option chosen.
- **Publishing**: npm names and trusted publishers for any new package, and the `npm-release` environment click; any listing in the MCP registry, the Anthropic directory or the OpenAI plugin directory.
- **Confirming the decisions below.**

## Decisions for the operator (Open; each with a recommendation; none is decided here)

| # | Decision | Options | Recommendation | Why it is hard to reverse |
| --- | --- | --- | --- | --- |
| D1 | The approver channel for release and publish | A CI environment gate; B passkey page; C chat channel; D elicitation only (not sound) | **A first** for anything that leaves the machine (the gate the compiler's own release already uses, no new authentication code, gives an attested verify runner), **B** as the local-only adapter in a later slice, C as a notifier; never D alone | the approval record format and the people who hold the role |
| D2 | Package layout and names | (a) `@tsukuri/lifecycle` (library) plus `@tsukuri/mcp` (tools); (b) one `@tsukuri/mcp`; (c) `@tsukuri/agent-tools` plus `@tsukuri/mcp` | **(a)**: the decided protocol-neutral declaration cannot live in a tools-tier package that imports `effect/ai`, and the tier gate allows one tier per package | an npm name is permanent once published |
| D3 | How the server reaches users | A repository checkout with devenv, stdio, now; B publish `@tsukuri/mcp` to npm (requires publishing `verify` and the adapters, or bundling); C a compiled binary on releases plus an MCPB bundle; D hosted | **A now**: `cli` itself is not distributable today, so any other option first needs a distribution spec; add D (authoring only) behind a tunnel when a hosted client is wanted | publishing names and a supported install path |
| D4 | Protocol eras | dual-era (`2026-07-28`, `2025-11-25`, `2025-06-18`); modern only | **dual-era**; revisit when hosted clients adopt `2026-07-28` | clients and users pin to what they connected with |
| D5 | Evidence trust model | local `witnessed` plus recompute at the gate; CI `attested` only; signed local records | **recompute at the gate** (A5) with `attested` required for publish when option A is chosen; no signing key held by the server | the release policy others rely on |
| D6 | What a "release" of a project is, and the first publisher | none in v1 (candidate and approval only); a GitHub Release with the bundle as assets; a static site on Cloudflare; a video platform | **none in v1**, then **a GitHub Release through option A**; the channel list is deployment configuration | a published artifact and its URL |
| D7 | Tool naming | `snake_case` (`story_lint`); dotted; a version in the name | **`snake_case`, no version in the name** (versioning is `contractVersion` and the lock) | permission rules and ChatGPT's frozen snapshot embed names |
| D8 | Server identity | `tsukuri` (tool names then read `mcp__tsukuri__story_lint`, `mcp__plugin_tsukuri_tsukuri__story_lint` in a Claude plugin) | **`tsukuri`** | renaming breaks users' permission rules and approvals |
| D9 | Remote authorization | build an authorization server; use an existing identity provider (Cloudflare Access for SaaS, GitHub) with Client ID Metadata Documents; none (stdio only) | **no hand-built authorization server**; remote starts read-only and authoring-only until an identity provider is chosen | the principals and scopes tools are authorized against |
| D10 | Adopt the optional extensions | Tasks, Skills over MCP, MCP Apps | **Tasks after the first slice** (Claude Code supports it); Skills and Apps when clients support them (**I4**) | none: additive |

## Slices (the implementing specs, one PR each; numbers when written)

The order and content of the slices were revised on 2026-10-30: see Revisions ("Operator decisions" and "First slice"); where this table and that entry differ, the entry wins.

| Slice | Content | Blocks |
| --- | --- | --- |
| S1 | `@tsukuri/lifecycle`: ids, `Stage`, tool declarations, `ApprovalSubject`, `VerificationRecord`, policy, instructions, `Distribution`, `tools.lock.json`, the skill; the tag declarations, contract suites and stand-ins for `Projects`, `Revisions`, `Jobs`, `Observer`, `Evidence`, `Approvals`, `Publisher`; tier-table and `knip` entries | everything |
| S2 | Extract the adapter registry (**G14**); `@tsukuri/mcp` stdio server for authoring, build, verify (structured `lint` and `plan` data, **G2**; `plan_diff`, **G3**; the job layer, **G5**; observation, **G8**); the conformance fixture and F6; the client derivations and F14 | the first real session |
| S3 | Release candidate: bundle manifest, policy, `release_propose`, `ApprovalGate` stand-in, the approval handler, the probe-publisher tests (F4) | S4 |
| S4 | The approver adapter chosen in D1 and the first publisher chosen in D6 | publishing anything |
| S5 | Worker entry, authoring only, and the authorization choice of D9; settle **I2** | hosted clients |
| S6 | Tasks extension over the job layer | long builds in Claude Code without polling |

## Not in scope

- Any code, schema file, package or generated client file; this PR adds the spec, its evidence and the glossary entries only.
- Publishing or dispatching anything: no npm publish, no workflow dispatch, no registry or directory submission, no Worker deployment, no tunnel. The compiler's own release (`release.yml`) stays what it is; **no MCP tool can reach it**.
- Interaction tools (ADR-0000 row 22: tools that raise events inside a running dynamic artifact); this interface is the authoring kind.
- IR-level edit operations and the IR-to-Fountain renderer (**G4**); version 1 edits the Screenplay text.
- The studio's agent panel, its permission presets (`studio-D7`) and sync; the studio can reuse `@tsukuri/lifecycle` later.
- Hosted AI agents (closed, paid, ADR open-core boundary): bring-your-own agents use these open tools.

## Checks of this document

| # | Check | Command (on the head) |
| --- | --- | --- |
| C1 | The number is free and the file name matches | `git ls-tree -r --name-only origin/main docs/specs \| grep -c '^docs/specs/0016-'` prints `0` on `origin/main`; the branch is `feat/0016-mcp-interface` |
| C2 | Every relative link resolves | a link check over `docs/specs/0016-mcp-interface.md` and `0016-evidence/` (command in the PR body) |
| C3 | The evidence files exist and the quoted facts match them | `ls docs/specs/0016-evidence`; each table row that cites a file is checked by reading it |
| C4 | The quoted declarations compile | `typecheck.txt` shows no finding on `declarations.ts.txt`'s file |
| C5 | The vocabulary is the operator's | `grep -riE 'multi-?sens' docs/specs/0016-mcp-interface.md GLOSSARY.md` finds nothing |
| C6 | Every decision is marked | `grep -c '^| D[0-9]' docs/specs/0016-mcp-interface.md` prints `10`; no row says Decided except those the header names |
| C7 | Documentation only | `git diff --name-only origin/main...HEAD` lists only `docs/` and `GLOSSARY.md` |
| C8 | The gates that apply pass | `bun run test` (the `Verify skill:` line test and the quality tests) |

## Revisions

- **2026-10-30, operator decisions (relayed by the lead; recorded before review).**
  - **D1 = A.** The approver channel is the CI environment gate first (GitHub required reviewers on an environment, the compiler's own `npm-release` pattern); a passkey page is a later adapter for local-only projects; a chat channel is a notifier only; **MCP elicitation is never an approval** (conditions A1 to A6 stand unchanged). Consequence the spec already states: `release_propose` on a revision that is not committed and pushed by a person returns `NotCommitted`.
  - **D2 = (a).** Packages are `@tsukuri/lifecycle` (library tier) and `@tsukuri/mcp` (tools tier).
  - **D3 = A.** The server reaches users as a repository checkout run through `devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts` over stdio. A hosted deployment, authoring only, comes later behind a tunnel; no npm publication of `@tsukuri/mcp` is part of the first slices (so `@tsukuri/lifecycle` and `@tsukuri/mcp` start `private`, which also keeps them out of the Changesets `fixed` group and the release gates).
  - **D6 = none in v1.** No project release or publish is built at first; a GitHub Release with the bundle as assets, through the CI gate, is the later first publisher.
  - **D4, D5, D7, D8, D9, D10** are accepted as the recommendations in the Decisions table: dual-era; recompute at the gate with `attested` required for publish under D1; `snake_case` names with no version; server name `tsukuri`; no hand-built authorization server and remote authoring-only until an identity provider is chosen; Tasks after the first slices, the other extensions when clients support them.
  - Effect on this spec's text: the Decisions table keeps its "Open" heading as written at freeze; this entry is the record of the answers. Slices S3 and S4 now say "release" and "publish" only as far as D1 = A and D6 allow: S3 builds the candidate, the approval record and the probe-publisher tests; S4 is the CI-gate approver and, later, the GitHub Release publisher.
- **2026-10-30, first slice.** The lead asked that the first implementation PR be one felt journey. It is **S1, the read-only inspector over stdio**, and it replaces the S1 and S2 rows above as follows.
  - **Journey.** An operator runs one generated command (Claude Code: `claude mcp add --scope project --transport stdio tsukuri -- devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts`; Codex: the same command through `codex mcp add`, or the generated plugin). In a real session the agent lists the projects of the checkout (`stories/same-id`), reads the Screenplay, lints it, gets the Plan (review, JSON, timing), compares two revisions, reads the manifest of a build that a person made with `tsukuri build`, and looks at one frame of the video at the resolved frame of an effect. It cannot change a file, start a process or reach a network.
  - **Ships.** `@tsukuri/lifecycle` with ids, `Stage`, `UntrustedText`, the nine tool declarations, the instructions, the `Distribution`, `tools.lock.json` and the skill; the tags `Projects` (read-only in this slice), `Observer`, and their contract suites and stand-ins; `@tsukuri/mcp` with the stdio entry, dual-era, over the Effect `McpServer` (registering `artifact_observe` through the lower-level `addTool` for the image block); structured `lint` and `plan` data (**G2**), `plan_diff` (**G3**), the observation primitives behind `Observer` (**G8**); the generated install files for Claude Code and Codex with their drift test (the MCPB manifest and the hosted-connector cards wait for D3 option D); tier-table, `knip`, `tsconfig` allow-list and feature-map entries.
  - **The nine tools** (all `RO`): `project_list`, `project_get`, `docs_get`, `story_read`, `story_lint`, `plan_get`, `plan_diff`, `build_get`, `artifact_observe`. `project_get` derives the stage from the files on disk, so it reaches `built` at most. `evidence_get` is not in S1: nothing writes a record yet.
  - **Why verification is not in S1.** Running the falsifiers takes minutes (spec 0001) and its result is only evidence if the server writes it (F3). That needs the `Jobs` layer (**G5**) and the `Evidence` writer (**G7**), so `verify_run`, `evidence_get`, `build_start`, `build_cancel` and `job_get` are **S2**, together with the extraction of the adapter registry (**G14**), `project_create` and `story_revise`. S1 is therefore inspect only; the lifecycle verbs it covers are inspect, and deliver in the sense of reading a finished build.
  - **Falsifiers that apply to S1:** F1 (surface lock, nine tools), F2 (holds trivially: no `Publisher` exists yet, and the scan is added now so it cannot be forgotten), F5 (confinement, with the corpus), F6 (conformance against the fixture, `--requirements 2026-07-28` and `2025-11-25`), F8 (results fit), F9 (untrusted typing), F11 (no secret), F14 (installs derive from one source; `claude mcp get` `Connected`, `codex plugin add` `installed, enabled`; `mcpb validate` deferred), F15 (gates). **Not in S1:** F3, F4, F7, F10, F12 (no writer, no gate, no job, no egress choice). F13 is the operator's read-only session in Claude Code and Codex.
  - **Slice order after this entry:** S1 as above; S2 `project_create`, `story_revise`, the job layer, `build_start`, `verify_run`, `evidence_get` and the adapter-registry extraction; S3 the candidate, the approval record and the probe-publisher tests (F4); S4 the CI-gate approver and the GitHub Release publisher; S5 the Worker entry; S6 Tasks. `Verify skill:` for S1's spec names the feature-map rows it adds for what a viewer sees in a tool result.

## Sources

Primary sources are quoted with their dates in [`0016-evidence/primary-sources.md`](0016-evidence/primary-sources.md). Runs: [`stdio-both-eras.txt`](0016-evidence/stdio-both-eras.txt) (with [`stdio-spike-source.ts.txt`](0016-evidence/stdio-spike-source.ts.txt)), [`claude-code.txt`](0016-evidence/claude-code.txt), [`codex.txt`](0016-evidence/codex.txt), [`conformance-requirements.txt`](0016-evidence/conformance-requirements.txt), [`effect-mcp-surface.txt`](0016-evidence/effect-mcp-surface.txt), [`devenv-stdout.txt`](0016-evidence/devenv-stdout.txt), [`typecheck.txt`](0016-evidence/typecheck.txt) (with [`declarations.ts.txt`](0016-evidence/declarations.ts.txt)).

- MCP specification 2026-07-28: <https://modelcontextprotocol.io/specification/2026-07-28>; changelog, tools, elicitation, Streamable HTTP, authorization, versioning, schema pages under it; Tasks: <https://modelcontextprotocol.io/extensions/tasks/overview>; Skills: <https://modelcontextprotocol.io/extensions/skills/overview>; conformance: <https://github.com/modelcontextprotocol/conformance>.
- Claude Code: <https://code.claude.com/docs/en/mcp>, <https://code.claude.com/docs/en/plugins-reference>; hosted connectors: <https://claude.com/docs/connectors/building>, <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>; MCPB: <https://github.com/modelcontextprotocol/mcpb>.
- Codex and ChatGPT: <https://developers.openai.com/codex/mcp>, <https://developers.openai.com/codex/plugins>, <https://developers.openai.com/codex/skills>, <https://developers.openai.com/plugins/build/plugins>, <https://developers.openai.com/plugins/build/mcp-server>, <https://developers.openai.com/api/docs/guides/custom-mcp-server>, <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>, <https://help.openai.com/en/articles/12584461>; Agent Plugins: <https://agent-plugins.org/specification>.
- Repository: [ADR-0000](../decisions/0000-extension-architecture.md) (row 17, interactions), [open-core boundary](../design/open-core-boundary.md), [spec 0009](0009-npm-prereleases.md) and `.github/workflows/release.yml` (the gated release), [spec 0010](0010-review-and-verify-skills.md), `tools/quality/tiers.ts`, `tools/quality/release.ts`, `tools/quality/writeGenerated.ts`, the operator decisions log of 2026-10 (`agent-protocol`, line 77; publishing preapproval and release bot, lines 124 and 125).
