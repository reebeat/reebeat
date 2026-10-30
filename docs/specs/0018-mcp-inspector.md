# 0018 The MCP inspector: an agent reads a tsukuri project (slice S1 of spec 0016)

Status: **plan and build** (frozen when its PR opens; revisions are dated entries at the end). Date: 2026-10-30. Decided by: [spec 0016](0016-mcp-interface.md), reviewed and merged first (PR #39, merge commit `655c25c`), and the lead's brief for its first implementation slice: one felt journey, runnable headless.
Process: [spec 0000](0000-development-lifecycle.md). Number 0018: 0017 is held by the merged spec 0017 (the tier gate on ox-dep-lint, PR #48) and by the open PR #50; `git ls-tree -r origin/main docs/specs` and every remote branch show no 0018 on 2026-10-30. Branch `feat/0018-mcp-inspector`.
Verify skill: mcp-install, mcp-journey, mcp-frame, mcp-readonly, mcp-untrusted, mcp-confined
Those rows are what a viewer of the agent sees: the results of the tools and the install they start from.
Decision record: spec 0016 and its Revisions (D1 to D13 as answered there). This spec decides nothing that spec left open; where building taught something, a dated Revision at the end says so.

## Problem

Spec 0016 designs an MCP interface for the whole multimedia creative lifecycle. It is a plan: no package, no tool, no install file exists, and the claims about Claude Code, Codex and the Effect `McpServer` are spiked facts, not a running system. The lead asked for the first implementation to be one felt journey rather than a foundation: an operator installs one generated command, and a real agent session reads a project.

## Goal

An operator runs one command (Claude Code: `claude mcp add --scope user --transport stdio tsukuri -- sh -c "cd '<checkout>' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"`; Codex: `codex mcp add tsukuri -- sh -c …`; or the generated plugin of either). In a real session the agent then:

1. lists the projects of the workspace and their stage;
2. reads a Screenplay in pages, and lints it (the importer's errors and the lint rules as data, with lines);
3. gets the Plan (review text, JSON, and with timing from a build);
4. reads a build a person made with `tsukuri build` (files with digests, adapters and their egress, whether it is a build of the head Screenplay) and gets links to its files;
5. looks at one frame of the video, at the frame an effect fires at, as a small image; and can read audio loudness and onsets, subtitle cues, chapters and stream facts.

It cannot change a file, start a process but ffmpeg, reach a network, or release or publish anything. All of it is checked headless with the real `claude` and `codex` CLIs, and what needs the operator's own hands is listed.

## Constraints

- **Spec 0016 as revised.** Eight tools, all read-only; `plan_diff`, `verify_run`, `evidence_get`, `build_start`, `project_create`, `story_revise` are slice S2. Only the head revision exists (any other fails `Stale`). The server is a checkout run through devenv over stdio (D3 = A), dual-era (D4), and the packages are private (`@tsukuri/lifecycle` service tier, D11 = P2; `@tsukuri/mcp` tools tier).
- **Native Effect 4.1.0.** `McpServer` and `McpProtocol` are `@stability unstable`: each module used is in `allowedUnstableApis`; nothing published depends on them.
- **No secret, no write, no egress.** The server holds no credential and its tools have no write path; a failure that carries a path or a stack is logged to stderr and fails with a fixed message.
- **The repository's gates.** `bun run ready` on the head; the tier table, the feature map, the exception registry, knip and cpd (threshold 0).

## Values

Correctness by construction: a tool is a declaration, and the list, the schemas, the hints, the instructions, the client install files and the surface lock are derived from it, never copied. Untrusted text is typed by the output schema. A result that does not fit is paged by construction. No agent path to authority exists, because no tool names one.

## What ships

- **`@tsukuri/lifecycle`** (private, service tier; imports `@tsukuri/core` and `effect` only): the ids (`ProjectId`, `RevisionId`, `BuildId`) and `UntrustedText`; `Stage` and `stageOf`; the eight tool declarations (`src/tools.ts`: name, hints, capability, input, output and failures as schemas); the errors; the read models (`BuildSummary`, `MatchesHead`, media facts); the two services `Projects` and `Observer`; `gateSentence`, the instructions generated from the declarations, and the `distribution` value every install file is derived from; the lifecycle skill (`skills/tsukuri-lifecycle/SKILL.md`); contract suites (P1 to P5, O1 to O4) and stand-ins (`memoryProjects`, `fixedObserver`) with tests that prove the suites can fail; a typed reading of the output JSON Schema (`contract/schemaWalk.ts`) used by the F9 tests.
- **`@tsukuri/mcp`** (private, tools tier): `bin/tsukuri-mcp.ts`, the composition root (stdio, logs to stderr); `src/server.ts` and `src/bind.ts` (every declaration registered with `McpServer.addTool`: strict arguments, JSON text plus `structuredContent`, an image block for a frame, `resource_link` blocks for files, a declared failure as `isError`); `src/handlers.ts` and `src/observe.ts` (the eight programs); `src/projectsFs.ts` (the confined file-system `Projects`); `src/observerFfmpeg.ts` (the ffmpeg `Observer`: a JPEG frame of at most 64 KiB, audio buckets and onsets, probe facts, two at a time); `src/pages.ts`; `src/clients.ts` and `src/lock.ts` with `bin/generate.ts` (the client files under `clients/` and `tools.lock.json`); `scripts/check-clients.sh` and `scripts/journey.sh`; the tests.
- **Repository wiring:** the tier table (`oxDepLint.config.ts`: `lifecycle` a service, `mcp` a tool), `vite.config.ts` effect groups, `knip.json`, `allowedUnstableApis`, the feature-map rows, `AGENTS.md` and `README.md`.

## The eight tools

| Tool | Reads | Result (all structured, all paged where a list or text can be long) |
| --- | --- | --- |
| `project_list` | the workspace | each project: head revision, stage, bytes, whether it has a config and a build |
| `project_get` | one project | the same, the lines, the tools worth calling now, and its build (with `matchesHead`) |
| `docs_get` | the checkout | the grammar (generated from the core), `GLOSSARY.md`, or the lifecycle skill, in pages |
| `story_read` | the Screenplay | numbered lines in pages; the text is typed untrusted |
| `story_lint` | the Screenplay | errors and the absolute times listed, each with rule, line and scene |
| `plan_get` | the Plan | `review`, `json`, or `timing` (needs a build of the head Screenplay) in pages |
| `build_get` | `build.json` | files with digests, adapters with egress, `matchesHead`, and links to the deck, video, subtitles and plan |
| `artifact_observe` | the build's files | `frame` (image block; by frame, millisecond or `{scene, effect}`), `audio` (at most 20 s), `subtitles`, `chapters`, `streams` |

A tool's declared failures are `ProjectNotFound`, `BuildNotFound`, `Stale`, `Invalid`, `StoryInvalid`, `Unreadable` and `ObserveFailed`; none carries a foreign cause or a quotation of the Screenplay.

## Falsifiers

**H** = an agent runs it headless; **O** = needs the operator's hands. Each is observed with a command on the head; raw output is in [`0018-evidence/`](0018-evidence/) or the run directory the PR names.

| # | Falsifier (must hold) | Run | Fails when |
| --- | --- | --- | --- |
| F1 | **The surface is locked.** `tools/list` equals `tools.lock.json` in every protocol era; names match `^[a-z][a-z0-9_]{0,63}$`; at most 24 tools; four hints each; every tool `readOnlyHint: true` and `destructiveHint: false`; no `_`-segment of a name is `approve`, `deny`, `execute`, `delete`, `dispatch` or `overwrite`; the lock is regenerated from the declarations | `bun run test` (`packages/mcp/test/surface.test.ts`) | a tool, hint, schema or description changes without the lock changing |
| F2 | **No agent path to authority.** The requirements of every program are exactly `Docs`, `Observer` and `Projects` (a type test); no module that answers a call imports a name or a module matching publish, approve, release, execute, dispatch, credential, token or secret; no input schema has a property named like a verdict, record, stage, status, approval, decision, digest or signature | the same file | a program can name a publisher; an input can carry a verdict |
| F5 | **Confinement.** 27 hostile ids (`..`, absolute, traversal, separators, case, whitespace, NUL, percent and Unicode forms, over-long) are refused with no file touched; a project that is a symbolic link, a story that is a link or a directory, a build directory or `build.json` or video that is a link, a story over 8 MiB: a typed failure and the outside canary appears in no result; deleting the link refusal makes the test fail | `confinement.test.ts`; the control is in [`confinement-mutation.txt`](0018-evidence/confinement-mutation.txt) | any byte outside the root is read |
| F6 | **Protocol conformance.** The pinned MCP conformance suite (`@modelcontextprotocol/conformance@0.2.0-alpha.12`) against the shared server core over `McpServer.layerHttp`, with `--requirements 2026-07-28` and `--requirements 2025-11-25`, exits 0, with a baseline of expected failures that each have a written reason | `conformance.test.ts` (a spawned fixture; needs the network for `npx`); raw output in [`conformance-2026-07-28.txt`](0018-evidence/conformance-2026-07-28.txt) and [`conformance-2025-11-25.txt`](0018-evidence/conformance-2025-11-25.txt) | a required scenario outside the baseline fails |
| F8 | **Results fit.** For worst-case inputs (a 4.5 MB single line, 1,500 lines, 800 diagnostics, a build of 5,000 files, 6,000 subtitle cues) every page of every paged tool is at most 45,000 characters (the text blocks plus the JSON of `structuredContent`), the pages together hold every line and item, a page of generated text or items never exceeds its budget, a frame is at most 64 KiB, and no blob above 64 KiB appears | `results.test.ts` (a property test over generated text and a workspace built to the limits) | a result exceeds a bound; a page loses a line |
| F9 | **Content is typed untrusted.** Every plain string field of every output schema is a decision in an allowlist (an id, a digest or a literal); a hostile project (instruction-like title, section, scene, element, narration, effect reason, file name, subtitle cue) comes back only at paths whose schema carries `x-tsukuri-untrusted`, never in a summary line or an error | `untrusted.test.ts`, `packages/lifecycle/test/surface.test.ts` | a project string in a plain field, a summary or an error |
| F11 | **No secret appears.** The executable is started with a canary in `GH_TOKEN`, `GITHUB_TOKEN`, `NPM_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `CLOUDFLARE_API_TOKEN`, every tool is called, and the canary is in nothing on stdout or stderr; no generated file looks like a secret | `stdio.test.ts`, `clients.test.ts` | the canary appears |
| F13h | **A real session works, headless.** A real Claude Code and a real Codex session, started with `claude -p` and `codex exec` and the generated server command, make the seven calls (list, get, read, lint, plan timing, build, frame), Claude Code receives the frame as an image block, and both end their answer with a marker; stdout of the server holds only protocol frames | `packages/mcp/scripts/journey.sh`; raw: [`journey-same-id.txt`](0018-evidence/journey-same-id.txt) (the real `stories/same-id` and a build of it: frame 372 is the frame [`plan-same-id-f1.txt`](0018-evidence/plan-same-id-f1.txt) prints for `sc2.f1`; [`frame-psnr.txt`](0018-evidence/frame-psnr.txt) compares the image with ffmpeg's own decoding of frame 372 at 47.19 dB against 23.44 dB for another frame) and [`journey-fixture.txt`](0018-evidence/journey-fixture.txt) (the tests' workspace) | a call is missing or no image arrives |
| F14 | **Installs derive from one source.** Every committed file under `clients/` equals its regeneration from `distribution`, carries the marker (the one closed-schema `mcp.json` of Agent Plugins excepted), states the gate sentence where a person reads it (the card, the Codex section, the skill of each plugin) and the instructions state it; `claude mcp add-json` of the generated entry then `claude mcp list` shows `Connected`; `claude plugin validate --strict` passes; `codex plugin marketplace add` and `codex plugin add` show `installed, enabled` | `clients.test.ts`; `packages/mcp/scripts/check-clients.sh`; raw: [`check-clients.txt`](0018-evidence/check-clients.txt) | a copy differs, lacks the marker or the sentence; a client rejects a file or the server does not start |
| F15 | **Gates.** `bun run ready` passes: tiers, release staging and rules (the new packages are private and outside the published set), knip, cpd, the exception registry (no new suppression), the feature map | `devenv shell -- bun run ready` | any gate fails |
| F10, F13 (sessions), F16 | operator | real model sessions in Claude Code, Codex, claude.ai and ChatGPT; the second reviewer account, the `agent` unix user and the `project-release` environment | see "What needs the operator" |

Not in this slice (no writer, no gate, no job, no egress choice): F3, F4, F7, F10, F12.

## What needs the operator's hands

- **Real model sessions** in each client with the operator's own sessions (F10, F13): claude.ai and ChatGPT need a URL, and nothing here serves one; `journey.sh` ran headless with the operator's logged-in `claude` and `codex` for a few short turns each.
- **M1, M2, M3 and F16** (the second reviewer account, the reduced token, the separate `agent` unix user, `gate-settings-check.sh`): not needed by S1, which releases nothing, and still the operator's before S3 and S4.
- **Hosted exposure and MCPB.** A public HTTPS name or a tunnel, Worker deployment, `mcpb validate` (needs `@anthropic-ai/mcpb`) are deferred; no file here serves them.
- **A decision on the one deviation below** (the marker of closed-schema files), if the operator prefers another form.

## Not in scope

Everything spec 0016 puts in S2 to S6: creating and revising a project, building and verifying from a tool, evidence records, candidates, approvals, publishers, the hosted entry, Tasks. No npm publication of either package. No change to the compiler's output, so the existing journey of `bun run journey` is untouched.

## Revisions

- **2026-10-30, spec 0016 was reviewed and merged first (the lead's condition).** This spec implements slice S1 as revised in the Revisions of [spec 0016](0016-mcp-interface.md) (rounds 1 to 3 and the operator's answers): PR #39, three review rounds by RevReebeat16, merge commit `655c25c`. Where this spec differs from that text, a later entry below says so.
- **2026-10-30, what building taught (each entry supersedes the text of 0016 it names).**
  1. **Every tool, not only `artifact_observe`, registers through `McpServer.addTool`** (0016: "Toolkit for the rest"). A result carries a summary line, the JSON, and sometimes an image or links; one derivation (`bind.ts`) serves all eight, and the Toolkit's `Tool.make` path is not used at all. The arguments are decoded strictly with the declaration's own schema (`onExcessProperty: "error"`).
  2. **A malformed request is a result with `isError` and the problem named, not a JSON-RPC error** (0016, "Failures are values": "a protocol error means a malformed request"). Effect 4.1.0's `McpServer` answers an argument that fails the input schema as a tool result with `isError: true` in the `2025-11-25` and `2026-07-28` eras and as a JSON-RPC error in the `2025-06-18` era (observed once with a probe test; `tools.test.ts` accepts either); the declared failures of a well-formed request are always results with their tag.
  3. **Errors carry no foreign cause and no quotation of a project.** 0016 allowed `cause` "for the human". A cause can hold a path or a stack and a failure's text can quote the Screenplay, so `Unreadable` and `ObserveFailed` have no `cause` field (the layer logs it to stderr and fails with a fixed message), and `plan_get` on a Screenplay that does not import fails `StoryInvalid` with the line and no importer text (`story_lint` has the text, typed untrusted).
  4. **The server's logger writes to stderr.** A first run of the stdio test failed because a `WARN` line (a refused manifest) reached stdout, which corrupts the protocol. The executable provides `Logger.LogToStderr`; `stdio.test.ts` decodes every stdout line as a JSON-RPC frame and checks that the warning is on stderr.
  5. **The size bound is stated as characters a client counts:** the text blocks plus the JSON of `structuredContent`, each at most 45,000 together (a page is at most 20,000 JSON characters; the JSON is sent twice). The escaping of a JSON string inside the wire frame is the transport's. An audio window is at most 20,000 ms (200 buckets).
  6. **`VerdictSchema` and its drift test move to S2.** S1 has no verdict anywhere in a result; `BuildSummary` is the only read model with a drift test (`drift.test.ts`: `BuildManifest` from pipeline is assignable to it and a manifest written by `encodeBuildManifest` decodes with it).
  7. **The Agent Plugin tree is a marketplace root:** `clients/agent-plugin/.agents/plugins/marketplace.json` and the plugin at `plugins/tsukuri/` (`plugin.json`, `mcp.json`, `skills/`); `codex plugin marketplace add` requires the plugin below the marketplace root (0016 said `agent-plugin/` held the plugin files directly). The manifest and `mcp.json` carry `$schema`, and a server entry carries `type: "stdio"`, as Agent Plugins 1.0.0 requires.
  8. **The marker of a file with a closed schema.** Spec 0016: "every generated file starts with a marker". A JSON file whose schema is closed has no room for one: the Claude `plugin.json` carries it in `description` (Claude Code's `--strict` rejects an unknown field), the Agent Plugin `plugin.json` under `extensions["dev.tsukuri"]`, `.mcp.json` and `marketplace.json` as `_generated`, and `agent-plugin/plugins/tsukuri/mcp.json` (the Agent Plugins schema admits no other top-level field) carries none: the drift test names it as the one exception.
  9. **The generated TOML is the formatter's layout** (oxfmt reformats `config.toml`), so a committed file equals its regeneration after `vp check --fix`.
  10. **`startup_timeout_sec = 60` in the Codex section.** The first `devenv shell` of a checkout evaluates the environment; Codex's default start-up allowance is shorter.
  11. **The executable's file name is `tsukuri-mcp.ts`** (the command the cards, the spec and the clients use) and `vite.config.ts` turns off `unicorn/filename-case` for that one file; every other module is camelCase.
  12. **F6 fixture.** The suite's required scenarios look for diagnostic tools, resources, prompts and multi round-trip tools by name, so the fixture (`test/conformanceFixture.ts`, `test/conformanceExtras.ts`) adds them beside the eight real tools; none is shipped. For `2026-07-28` 36 of the 37 scored scenarios pass and `server-stateless` fails two checks that need `MissingRequiredClientCapabilityError` (-32021), which Effect 4.1.0's server cannot emit, and one that needs a streaming elicitation tool; for `2025-11-25` six legacy server-to-client scenarios (sampling, elicitation, resource subscription) are baselined because the inspector never asks a client for anything. Each baseline entry has its reason in `packages/mcp/conformance/`.
  13. **The F2 scan reads the local name of an import as well as the imported name.** The first negative control (an aliased import `Docs as Publisher`) passed a scan that read only the imported name; a second control now fails as it should. The controls of F1, F2, F6, F8, F9, F11 and F14 are in [`controls.txt`](0018-evidence/controls.txt), F5's in [`confinement-mutation.txt`](0018-evidence/confinement-mutation.txt).
