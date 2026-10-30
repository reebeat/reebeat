<!-- Generated from packages/lifecycle/src/distribution.ts by `bun run --cwd packages/mcp generate`; edit the source, never this file. -->
# tsukuri: install the MCP server

Read a tsukuri project from an agent: its Screenplay, lint, Plan, build and a frame of the video. Read-only; release and publish are not tools.

The release and publish gate holds for MCP-confined agents (ChatGPT, claude.ai, any session with no `gh` credential). Against an agent with a shell it holds only if M1, M2 and M3 are in place: the approving account is a second account never logged in on the agent's machine, with self-review prevented and administrator bypass off; the agent runs as a separate unix user whose `gh` holds only a reduced token. The server cannot check this; it is the operator's responsibility.

Every file here holds `__TSUKURI_CHECKOUT__` where the absolute path of this checkout goes. Put it there with `sed`, then install. The server is started by the client through `devenv shell`, so `devenv` must be on the client's `PATH`; nothing is sent anywhere and no file holds a secret.

```sh
# Claude Code, one command (user scope, available in every project)
claude mcp add --scope user --transport stdio tsukuri -- sh -c "cd '$PWD' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"

# Claude Code, this repository only: put the checkout path into the project file, then approve it in `claude`
sed "s#__TSUKURI_CHECKOUT__#$PWD#g" packages/mcp/clients/claude-code/.mcp.json > .mcp.json

# Claude Code, as a plugin (includes the skill)
cp -R packages/mcp/clients/claude-plugin /tmp/tsukuri-claude-plugin
sed -i "s#__TSUKURI_CHECKOUT__#$PWD#g" /tmp/tsukuri-claude-plugin/.mcp.json
claude plugin validate --strict /tmp/tsukuri-claude-plugin

# Codex, one command
codex mcp add tsukuri -- sh -c "cd '$PWD' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"

# Codex, as a plugin (includes the skill)
cp -R packages/mcp/clients/agent-plugin /tmp/tsukuri-agent-plugin
sed -i "s#__TSUKURI_CHECKOUT__#$PWD#g" /tmp/tsukuri-agent-plugin/plugins/tsukuri/mcp.json
codex plugin marketplace add /tmp/tsukuri-agent-plugin
codex plugin add tsukuri@tsukuri-local
```

`codex/config.toml` is the same server as a `config.toml` section for a Codex that does not install plugins. claude.ai and ChatGPT need a URL: no file here serves them yet.
