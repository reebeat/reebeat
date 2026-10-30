# Primary-source excerpts behind the research tables of spec 0016

Each excerpt is the line, or the few lines, of a page fetched on 2026-10-30 (the `.md` rendering the site serves) that carries the claim, cut at 600 characters. Pages change; the date is part of the claim. Lines are numbered in the fetched text.

## MCP specification, revision 2026-07-28
- **Stateless: no initialize handshake; version and capabilities in every request**
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog.md>, lines 14,14 of the page as fetched on 2026-10-30:
  > 2. Make MCP stateless: remove the `initialize`/`notifications/initialized` handshake. Every request now carries its protocol version and client capabilities in `_meta` (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`). Clients SHOULD identify themselves on each request (`io.modelcontextprotocol/clientInfo`), and servers SHOULD identify themselves in each result's `_meta` (`io.modelcontextprotocol/serverInfo`). Version mismatches return `UnsupportedProtocolVersionError` ([SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575)). 

- **Tasks became an official extension**
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog.md>, lines 22,22 of the page as fetched on 2026-10-30:
  > 6. Move experimental tasks out of the core protocol and into an official extension (`io.modelcontextprotocol/tasks`). The redesigned extension replaces the blocking `tasks/result` method with polling via `tasks/get` and a new `tasks/update` for client-to-server input, removes `tasks/list`, and allows servers to return task handles unsolicited without per-request opt-in ([SEP-2663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2663)). 

- **Server-to-client requests such as elicitation travel as input_required results that the client retries**
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog.md>, lines 24,24 of the page as fetched on 2026-10-30:
  > 7. Multi Round-Trip Requests (MRTR) pattern introduced which replaces the previous approach of sending server-initiated requests, such as `roots/list`, `sampling/createMessage`, or `elicitation/create`. Servers return an `InputRequiredResult` (`resultType: "input_required"`) whose `inputRequests` field carries the requests for the additional information needed to process the request. Clients respond with `inputResponses` on a retry of the original request providing the requested information. ([SEP-2322](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2322)). 

- **A broken response stream loses the in-flight request**
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog.md>, lines 28,28 of the page as fetched on 2026-10-30:
  > 9. Remove SSE stream resumability and message redelivery (the `Last-Event-ID` header and SSE event IDs) from the Streamable HTTP transport. A broken response stream loses the in-flight request; clients **MUST** re-issue it as a new request with a new request ID ([SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575)). 

- **Roots, Sampling and Logging are deprecated**
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog.md>, lines 73,73 of the page as fetched on 2026-10-30:
  > 1. Deprecate the Roots, Sampling, and Logging features 

- **tools/list must not vary per connection; it may vary by authorization**
  <https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md>, lines 61,64 of the page as fetched on 2026-10-30:
  > with the set of tools currently available to the requesting client. This set **MAY** be empty and **MAY** change over time (see [List Changed Notification](#list-changed-notification)), but **MUST NOT** vary per-connection or as a side effect of other requests on the connection. The set 

- **Annotations are untrusted unless they come from a trusted server**
  <https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md>, lines 303,305 of the page as fetched on 2026-10-30:
  > For trust & safety and security, clients **MUST** consider tool annotations to > be untrusted unless they come from trusted servers. 

- **A human in the loop with the ability to deny tool invocations**
  <https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md>, lines 33,34 of the page as fetched on 2026-10-30:
  > For trust & safety and security, there **SHOULD** always > be a human in the loop with the ability to deny tool invocations. 

- **Explicit handles replace protocol sessions**
  <https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md>, lines 683,686 of the page as fetched on 2026-10-30:
  > MCP has no protocol-level session, so a server cannot rely on implicit per-connection state to relate one tool call to the next. Servers that need to maintain state across calls — a shopping cart, an open browser context, a database transaction — should do so by returning an explicit handle from a 

- **Form-mode elicitation must not collect secrets; URL mode is for them**
  <https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation.md>, lines 30,33 of the page as fetched on 2026-10-30:
  > Servers **MUST NOT** use form mode elicitation to request sensitive information such as > passwords, API keys, access tokens, or payment credentials > * Servers **MUST** use [URL mode](#url-mode-elicitation-requests) for interactions involving > such sensitive information 

- **Servers validate Origin to stop DNS rebinding**
  <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http.md>, lines 55,57 of the page as fetched on 2026-10-30:
  > 1. Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks. * If the `Origin` header is present and invalid, servers **MUST** respond 

- **Modern, legacy and dual-era implementations**
  <https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning.md>, lines 35,38 of the page as fetched on 2026-10-30:
  > capabilities as per-request metadata (revision `2026-07-28` and later). * **Legacy**: protocol versions that establish a session with an `initialize` handshake (`2025-11-25` and earlier). * **Dual-era**: an implementation that supports both modern and legacy 

- **Tool annotation hints and their defaults (schema page)**
  <https://modelcontextprotocol.io/specification/2026-07-28/schema.md>, lines 1567,1567 of the page as fetched on 2026-10-30:
  > received from untrusted servers. title?: string[Permalink](#toolannotations-title) A human-readable title for the tool. readOnlyHint?: boolean[Permalink](#toolannotations-readonlyhint) If true, the tool does not modify its environment. Default: false destructiveHint?: boolean[Permalink](#toolannotations-destructivehint) If true, the tool may perform destructive updates to its environment. 

## Claude Code
- **Output limits**
  <https://code.claude.com/docs/en/mcp.md>, lines 442,442 of the page as fetched on 2026-10-30:
  > Claude Code displays a warning when MCP tool output exceeds 10,000 tokens and limits output to 25,000 tokens by default. To change the token limit, set the `MAX_MCP_OUTPUT_TOKENS` environment variable, for example `MAX_MCP_OUTPUT_TOKENS=50000`. The warning threshold is fixed. Unless the server raises a tool's own limit, successful text results longer than 50,000 characters are saved to a file regardless of this variable. See [MCP output limits and warnings](#mcp-output-limits-and-warnings) 

- **Text results above 50,000 characters are saved to a file**
  <https://code.claude.com/docs/en/mcp.md>, lines 1508,1508 of the page as fetched on 2026-10-30:
  > Character limit for text results**: for a tool that doesn't declare [`anthropic/maxResultSizeChars`](#raise-the-limit-for-a-specific-tool), Claude Code saves a successful result with no image content to a file once it's longer than 50,000 characters, whatever its token count. Setting `MAX_MCP_OUTPUT_TOKENS` doesn't change this threshold 

- **A tool may raise its own limit with _meta anthropic/maxResultSizeChars**
  <https://code.claude.com/docs/en/mcp.md>, lines 1520,1520 of the page as fetched on 2026-10-30:
  > If you're building an MCP server, you can allow individual tools to return results larger than the default persist-to-disk threshold of 50,000 characters by setting `_meta["anthropic/maxResultSizeChars"]` in the tool's `tools/list` response entry. Claude Code raises that tool's threshold to the annotated value, up to a hard ceiling of 500,000 characters. 

- **Tool call wall-clock limit**
  <https://code.claude.com/docs/en/mcp.md>, lines 452,452 of the page as fetched on 2026-10-30:
  > The per-server `timeout` is a hard wall-clock limit per tool call, and progress notifications from the server don't extend it. Values below 1000 are ignored and fall through to `MCP_TOOL_TIMEOUT`, or to its default of about 28 hours when that variable is unset. For an HTTP, SSE, or [claude.ai connector](https://code.claude.com/docs/en/mcp.md#use-mcp-servers-from-claude-ai) server there is also a second, per-request timer that covers each request through to the server's first response byte. Claude Code sets that timer to the greatest of three values: 60 seconds, the tool timeout that applies to

- **Idle timeout**
  <https://code.claude.com/docs/en/mcp.md>, lines 456,456 of the page as fetched on 2026-10-30:
  > A tool call to an MCP server that sends no response and no progress notification for the idle window aborts with an error instead of waiting for the wall-clock limit. The idle timeout applies to every server type except IDE servers and SDK in-process servers. The idle window defaults to five minutes for HTTP, SSE, WebSocket, and [claude.ai connector](#use-mcp-servers-from-claude-ai) servers, and to 30 minutes for stdio servers. 

- **A main-conversation call still running after two minutes moves to a background task**
  <https://code.claude.com/docs/en/mcp.md>, lines 466,466 of the page as fetched on 2026-10-30:
  > An MCP tool call in the main conversation that is still running after two minutes moves to a background task instead of blocking the session. Claude receives the task ID immediately and keeps working, and the result arrives as a task notification when the call settles. 

- **MCP tasks need a server connected on revision 2026-07-28**
  <https://code.claude.com/docs/en/mcp.md>, lines 530,530 of the page as fetched on 2026-10-30:
  > The server is an HTTP, stdio, or claude.ai connector server connected on [protocol revision 2026-07-28](#mcp-client-runtimes). Setting [`MCP_SDK_GENERATION=v1` or `MCP_PROTOCOL_NEGOTIATION=legacy`](https://code.claude.com/docs/en/env-vars) rules that out 

- **MCP tasks: terminal CLI, Agent SDK and GitHub Actions only (not the desktop app or VS Code)**
  <https://code.claude.com/docs/en/mcp.md>, lines 532,536 of the page as fetched on 2026-10-30:
  > Anthropic has turned MCP tasks on for your kind of session. On v2.1.304 or later that covers terminal CLI sessions, [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview.md) sessions, and [GitHub Actions](https://code.claude.com/docs/en/github-actions.md) runs. Other surfaces, such as the [VS Code extension](https://code.claude.com/docs/en/vs-code.md) and the [desktop app](https://code.claude.com/docs/en/desktop.md), don't have MCP tasks * The call comes from the main conversation, not from a [subagent](https://code.claude.com/docs/en/sub-agents.md) * Either the session is interactive

- **MCP tasks are in public beta and need Claude Code v2.1.304 or later**
  <https://code.claude.com/docs/en/mcp.md>, lines 493,493 of the page as fetched on 2026-10-30:
  > MCP tasks are in public beta in the Claude Code CLI and require Claude Code v2.1.304 or later. [What a call needs to become an MCP task](#requirements-for-mcp-tasks) lists the sessions and servers that get them. 

- **Server instructions are cut at 4,096 characters**
  <https://code.claude.com/docs/en/mcp.md>, lines 1728,1728 of the page as fetched on 2026-10-30:
  > Server instructions, and the description of a tool that loads upfront**: 4,096 characters 

- **readOnlyHint lets Claude Code run calls in parallel**
  <https://code.claude.com/docs/en/mcp.md>, lines 1628,1628 of the page as fetched on 2026-10-30:
  > `readOnlyHint`**: the tool changes nothing. Claude Code also runs the tool's calls in parallel with other read-only calls. 

- **Elicitation modes Claude Code declares**
  <https://code.claude.com/docs/en/mcp.md>, lines 1658,1658 of the page as fetched on 2026-10-30:
  > If you build an MCP server, the client capabilities Claude Code sends when it connects tell your server which elicitation modes it can request. Claude Code declares `elicitation: {form: {}, url: {}}` on the following connections, so a server on any of them can request both modes: 

- **On claude.ai connector connections Claude Code declares form mode only**
  <https://code.claude.com/docs/en/mcp.md>, lines 1663,1663 of the page as fetched on 2026-10-30:
  > On its other connections on the earlier revisions, such as to [claude.ai connectors](#use-mcp-servers-from-claude-ai), Claude Code declares the bare `elicitation: {}`, which permits elicitation requests in form mode only. 

- **Plugin MCP servers: .mcp.json at the plugin root or inline in plugin.json**
  <https://code.claude.com/docs/en/mcp.md>, lines 652,652 of the page as fetched on 2026-10-30:
  > Plugins define MCP servers in `.mcp.json` at the plugin root or inline in `plugin.json` 

- **Where the plugin manifest lives**
  <https://code.claude.com/docs/en/plugins-reference.md>, lines 34,34 of the page as fetched on 2026-10-30:
  > Save the manifest at `.claude-plugin/plugin.json` under the plugin root. Put every other plugin file at the plugin root, not inside `.claude-plugin/`. That includes `skills/`, `commands/`, and `hooks/`. 

## Claude on the web, Desktop and mobile (custom connectors)
- **Hosted Claude follows these authorization specification versions**
  <https://claude.com/docs/connectors/building.md>, lines 43,43 of the page as fetched on 2026-10-30:
  > Specification version**: Claude follows the [2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization), [2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), and [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) authorization specifications 

- **Maximum tool result size**
  <https://claude.com/docs/connectors/building.md>, lines 75,75 of the page as fetched on 2026-10-30:
  > | Maximum tool result size | \~150,000 characters | 25,000 tokens, configurable with `MAX_MCP_OUTPUT_TOKENS` | 

- **Tool call timeout**
  <https://claude.com/docs/connectors/building.md>, lines 76,76 of the page as fetched on 2026-10-30:
  > | Tool call timeout | 240 seconds per tool call | Configurable with `MCP_TOOL_TIMEOUT` | 

- **Features hosted Claude does not support**
  <https://claude.com/docs/connectors/building.md>, lines 61,66 of the page as fetched on 2026-10-30:
  > Claude doesn't yet support these MCP features, so don't build a feature that depends on them: * Resource subscriptions * Sampling * Advanced or draft capabilities 

- **Remote connectors connect from Anthropic's cloud, not from the device**
  <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>, lines 31,31 of the page as fetched on 2026-10-30:
  > When you add a custom connector, Claude connects to your remote MCP server from Anthropic's cloud infrastructure, rather than from your local device. This is true across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps. 

- **MCPB bundles are loaded by Claude for macOS and Windows**
  <https://github.com/modelcontextprotocol/mcpb/blob/main/README.md>, lines 13,13 of the page as fetched on 2026-10-30:
  > This repository provides three components: The bundle specification in [MANIFEST.md] (MANIFEST.md), a CLI tool for creating bundles (see [CLI.md] (CLI.md)), and the code used by Claude for macOS and Windows to load and verify MCPB bundles ([src/index.ts] (src/index.ts)). 

## Codex
- **tool_timeout_sec default**
  <https://developers.openai.com/codex/mcp.md>, lines 316,316 of the page as fetched on 2026-10-30:
  > `tool_timeout_sec` (optional): Timeout (seconds) for the server to run a tool. Default: `60`. 

- **Approval modes; writes prompts for tools that are not marked read-only**
  <https://developers.openai.com/codex/mcp.md>, lines 321,323 of the page as fetched on 2026-10-30:
  > `default_tools_approval_mode` (optional): Default approval behavior for tools from this server. Supported values are `auto`, `prompt`, `writes`, and `approve`. The `writes` mode prompts for tools that aren't marked read-only. 

- **Server instructions: first 512 characters**
  <https://developers.openai.com/codex/mcp.md>, lines 199,199 of the page as fetched on 2026-10-30:
  > If you build or maintain an MCP server for Codex, use `instructions` for cross-tool workflows, constraints, and rate limits that apply across the server. Keep the first 512 characters self-contained so the most important guidance is available when Codex is deciding how to use the server. 

- **Codex supports stdio and Streamable HTTP, bearer and OAuth (CIMD and DCR)**
  <https://developers.openai.com/codex/mcp.md>, lines 192,196 of the page as fetched on 2026-10-30:
  > Streamable HTTP servers**: Servers that you access at an address. - Bearer token authentication - OAuth authentication, including Client ID Metadata Documents (CIMD) and Dynamic Client Registration (DCR) - ChatGPT session authentication for trusted first-party servers 

- **Codex skill locations**
  <https://developers.openai.com/codex/skills.md>, lines 138,138 of the page as fetched on 2026-10-30:
  > Codex reads skills from repository, user, admin, and system locations. For repositories, Codex scans `.agents/skills` in every directory from your current working directory up to the repository root. If two skills share the same `name`, Codex doesn't merge them; both can appear in skill selectors. 

- **Plugins are not in the IDE extension**
  <https://developers.openai.com/codex/plugins.md>, lines 17,18 of the page as fetched on 2026-10-30:
  > and in Codex in the ChatGPT desktop app. Codex CLI also has a plugin browser for Codex environments. The IDE extension doesn't support plugins. 

## ChatGPT
- **Write actions need confirmation by default**
  <https://developers.openai.com/api/docs/guides/custom-mcp-server.md>, lines 67,67 of the page as fetched on 2026-10-30:
  > Write actions by default require confirmation. Carefully review the tool input which will be sent to a write action to ensure the behavior is as desired. Incorrect write actions can inadvertently destroy, alter, or share data! 

- **readOnlyHint is respected; a tool without it is a write action**
  <https://developers.openai.com/api/docs/guides/custom-mcp-server.md>, lines 68,68 of the page as fetched on 2026-10-30:
  > Read-only detection: We respect the `readOnlyHint` tool annotation (see [MCP tool annotations](https://modelcontextprotocol.io/legacy/concepts/tools#available-tool-annotations)). Tools without this hint are treated as write actions. 

- **Supported transports**
  <https://developers.openai.com/api/docs/guides/custom-mcp-server.md>, lines 33,33 of the page as fetched on 2026-10-30:
  > Supported MCP protocols: SSE and streaming HTTP. 

- **Secure MCP Tunnel message size**
  <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md>, lines 100,100 of the page as fetched on 2026-10-30:
  > | Serialized request or response | 10 MiB (10,485,760 bytes) | Applies to the complete serialized tunnel envelope, including headers and protocol metadata, so usable MCP content is slightly smaller. The service applies the limit to each streaming notification and final response. | 

- **Secure MCP Tunnel request deadline**
  <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md>, lines 101,101 of the page as fetched on 2026-10-30:
  > | Request deadline | 120 seconds | One absolute budget from when the request enters the hosted queue through final response delivery. Queue time consumes this budget, and progress notifications do not reset it. | 

- **Secure MCP Tunnel request rate**
  <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md>, lines 99,99 of the page as fetched on 2026-10-30:
  > | MCP request rate | 600 requests per minute (10 per second sustained) | Shared by requests with the same tunnel ID and calling application ID across MCP channels. If the calling application ID is unavailable, requests with the same tunnel ID and user share the limit. Running more than one `tunnel-client` process does not multiply the allowance. | 

(The help-center page refuses plain HTTP clients; the next three excerpts were read with the harness `read` tool on 2026-10-30 and are quoted from its output.)

- **Pro: read/fetch only; full MCP for Business and Enterprise/Edu**
  <https://help.openai.com/en/articles/12584461>, as read on 2026-10-30:
  > Pro users can connect custom MCP servers with read/fetch permissions. Full MCP is only available to Business and Enterprise/Edu users, currently.

- **ChatGPT freezes the tool list after an admin approves**
  <https://help.openai.com/en/articles/12584461>, as read on 2026-10-30:
  > After an admin first approves an MCP server connection for the workspace, ChatGPT uses a "frozen" snapshot of its available tools and inputs. Changes made later by the server's developer are not applied until an admin reviews and publishes an update.

- **Web only**
  <https://help.openai.com/en/articles/12584461>, as read on 2026-10-30:
  > Can I connect custom MCP servers on mobile? No - web only. 

## Agent Plugins
- **plugin.json is required at the plugin root**
  <https://agent-plugins.org/specification.md>, lines 69,69 of the page as fetched on 2026-10-30:
  > 2. A plugin MUST include a manifest at `plugin.json` in the plugin root. 

- **mcp.json at the plugin root; no inline MCP configuration**
  <https://agent-plugins.org/specification.md>, lines 311,311 of the page as fetched on 2026-10-30:
  > The MCP configuration path is `mcp.json` at the plugin root. MCP configuration MUST NOT be declared inline in `plugin.json` or loaded from any alternative core path. 

## More excerpts, by source
- **MCP: Dynamic Client Registration deprecated in favour of Client ID Metadata Documents**
  <https://modelcontextprotocol.io/specification/2026-07-28/changelog.md>, lines 93,96 of the page as fetched on 2026-10-30:
  > 4. Deprecate the OAuth 2.0 Dynamic Client Registration Protocol ([RFC7591](https://datatracker.ietf.org/doc/html/rfc7591)) as a client registration mechanism in favor of [Client ID Metadata Documents](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md#client-id-metadata-documents) 

- **MCP: servers publish protected-resource metadata**
  <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/index.md>, lines 72,73 of the page as fetched on 2026-10-30:
  > 4. MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata ([RFC9728](https://datatracker.ietf.org/doc/html/rfc9728)). MCP clients **MUST** use OAuth 2.0 Protected Resource Metadata for [authorization server discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery.md). 

- **MCP: Skills over MCP is Final but host support is still being implemented**
  <https://modelcontextprotocol.io/extensions/skills/overview.md>, lines 12,14 of the page as fetched on 2026-10-30:
  > The [Skills Over MCP Working Group](https://modelcontextprotocol.io/community/working-groups/skills-over-mcp.md) maintains the extension. SDK and host support is still being implemented; 

- **MCP: the extension support matrix, as fetched, carries no marks in its cells**
  <https://modelcontextprotocol.io/extensions/client-matrix.md>, lines 30,30 of the page as fetched on 2026-10-30:
  > | [Claude Code](https://claude.com/claude-code) | | | | | | 

- **Claude Code: tool search defers definitions; no fixed per-server tool cap**
  <https://code.claude.com/docs/en/mcp.md>, lines 1710,1710 of the page as fetched on 2026-10-30:
  > Tool search keeps MCP context usage low by deferring tool definitions until Claude needs them. Only tool names and server instructions load at session start, so adding more MCP servers has minimal impact on your context window. Claude Code doesn't impose a fixed per-server tool cap; the practical limit is your context window budget. 

- **Claude Code: an Elicitation hook answers a dialog without a person**
  <https://code.claude.com/docs/en/mcp.md>, lines 1652,1652 of the page as fetched on 2026-10-30:
  > To auto-respond to elicitation requests without showing a dialog, use the [`Elicitation` hook](https://code.claude.com/docs/en/hooks#elicitation). 

- **Claude Code: a non-interactive run cancels a task that asks for input**
  <https://code.claude.com/docs/en/mcp.md>, lines 511,511 of the page as fetched on 2026-10-30:
  > In a [non-interactive](https://code.claude.com/docs/en/headless.md) session, Claude Code asks the server to cancel a task that requests input, without running your [`Elicitation` hooks](https://code.claude.com/docs/en/hooks#elicitation) or calling the Agent SDK's `onElicitation` callback. 

- **Claude Code: plugin tool names rewrite other characters to underscore**
  <https://code.claude.com/docs/en/mcp.md>, lines 714,714 of the page as fetched on 2026-10-30:
  > Tools from a plugin-bundled MCP server include both the plugin name and the server key in their callable name. The full form is `mcp__plugin_<plugin-name>_<server-name>__<tool-name>`, where any character outside `A-Z`, `a-z`, `0-9`, `_`, and `-` is replaced with `_`. For the `database-tools` server bundled in a plugin named `my-plugin`, a `query` tool is callable as: 

- **Claude Code: images in tool results are shown scaled and saved to a file**
  <https://code.claude.com/docs/en/mcp.md>, lines 1538,1538 of the page as fetched on 2026-10-30:
  > When an MCP tool returns a PNG, JPEG, GIF, or WebP image, Claude sees the image inline in the conversation. The inline copy may be scaled down or compressed to fit the model's image size limits. Claude Code also saves the original bytes to a file in the session's `tool-results` directory under [`~/.claude/projects/`](https://code.claude.com/docs/en/claude-directory#cleaned-up-automatically) and gives Claude the path. Claude can then crop, convert, or reuse the full-resolution file with tools such as Bash. 

- **Claude Code: personal skills location (project skills are under .claude/skills)**
  <https://code.claude.com/docs/en/skills.md>, lines 159,159 of the page as fetched on 2026-10-30:
  > | Personal | `~/.claude/skills/<skill-name>/SKILL.md` | All your projects on this machine, but not [Cowork or cloud sessions](#skills-in-cowork-and-cloud-sessions) | 

- **Claude apps: Free plan, one custom connector**
  <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>, lines 3,3 of the page as fetched on 2026-10-30:
  > Custom connectors using remote MCP are available on Claude, Cowork, and Claude Desktop for users on Free, Pro, Max, Team, and Enterprise plans. Free users are limited to one custom connector. 

- **Claude apps: per-tool approval with Allow always**
  <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>, lines 177,177 of the page as fetched on 2026-10-30:
  > Review Claude's tool approval requests carefully and only click "Allow always" when using a server and tool that you trust to run unsupervised. 

- **Claude apps: text and image tool results, text and binary resources**
  <https://claude.com/docs/connectors/building.md>, lines 58,59 of the page as fetched on 2026-10-30:
  > [Text](https://modelcontextprotocol.io/specification/latest/schema#textcontent) and [image-based](https://modelcontextprotocol.io/specification/latest/server/tools#image-content) tool results * [Text](https://modelcontextprotocol.io/specification/latest/schema#textresourcecontents) and [binary](https://modelcontextprotocol.io/specification/latest/schema#blobresourcecontents) resources 

- **Codex: per-tool output token limit**
  <https://developers.openai.com/codex/mcp.md>, lines 325,327 of the page as fetched on 2026-10-30:
  > `tools.<tool>.output_token_limit` (optional): Positive token budget for one tool's output, before the standard 20% serialization allowance. Overrides the model's default output truncation budget for that tool. 

- **Codex: AGENTS.md size limit (32 KiB by default)**
  <https://developers.openai.com/codex/guides/agents-md.md>, lines 15,15 of the page as fetched on 2026-10-30:
  > Codex skips empty files and stops adding files once the combined size reaches the limit defined by `project_doc_max_bytes` (32 KiB by default). For details on these knobs, see [Project instructions discovery](https://learn.chatgpt.com/docs/config-file/config-advanced#project-instructions-discovery). Raise the limit or split instructions across nested directories when you hit the cap. 

- **OpenAI: use MCP elicitation for missing inputs; never for secrets**
  <https://developers.openai.com/plugins/build/mcp-server.md>, lines 185,187 of the page as fetched on 2026-10-30:
  > Use MCP elicitation when the server needs structured information that was not provided in the original tool call. Keep elicitation focused on information the user can reasonably supply. Do not use it to collect secrets or bypass 

- **OpenAI: annotations choose confirmation behaviour and replace no authorization**
  <https://developers.openai.com/plugins/build/mcp-server.md>, lines 181,183 of the page as fetched on 2026-10-30:
  > Annotations help ChatGPT and Codex choose appropriate confirmation and safety behavior. They do not replace authorization, validation, or confirmation in your server. 

- **Secure MCP Tunnel reaches a stdio command or an HTTP URL**
  <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md>, lines 56,56 of the page as fetched on 2026-10-30:
  > An MCP server that `tunnel-client` can reach over stdio or HTTP from inside your network. 

- **ChatGPT: Add custom MCP server at chatgpt.com/plugins**
  <https://developers.openai.com/api/docs/guides/custom-mcp-server.md>, lines 26,29 of the page as fetched on 2026-10-30:
  > Add an MCP server as a plugin:** 1. Go to [ChatGPT Plugins](https://chatgpt.com/plugins). 2. Select the plus button, then **Add custom MCP server**. 3. Enter a name and, optionally, a description. Under **Connection**, enter your **Server URL**, or select **Tunnel** for a [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels). 

- **OpenAI accepts legacy and Claude-compatible manifests; the portable plugin.json is the new format**
  <https://developers.openai.com/plugins/build/plugins.md>, lines 595,596 of the page as fetched on 2026-10-30:
  > The root `plugin.json` is the portable entry point. OpenAI also accepts legacy and Claude-compatible manifests, but new packages should use this format. 

- **MCPB: the validate command**
  <https://github.com/modelcontextprotocol/mcpb/blob/main/CLI.md>, lines 61,64 of the page as fetched on 2026-10-30:
  > ### `mcpb validate <path>` Validates a MCPB manifest file against the schema. You can provide either a direct path to a manifest.json file or a directory containing one. 

