#!/bin/sh
# F14, the half the drift test cannot do (spec 0016): drive the real client CLIs on the generated files, in isolated
# configuration directories, so nothing of the operator's Claude Code or Codex setup is read or changed. Run it from
# the repository root inside `devenv shell`:
#
#   devenv shell -- sh packages/mcp/scripts/check-clients.sh [output-directory]
#
# It prints each command and its output, and exits non-zero at the first expectation that fails. It needs `claude`
# and `codex` on the PATH and starts the server once (`claude mcp list` connects to it); it sends nothing anywhere.
set -eu

checkout=$(pwd)
out=${1:-"$HOME/.local/state/tsukuri-verify/$(date +%F)-clients"}
work=$(mktemp -d)
mkdir -p "$out"
log="$out/check-clients.txt"
: > "$log"

say() { printf '%s\n' "$*" | tee -a "$log"; }
run() { say "\$ $*"; "$@" 2>&1 | tee -a "$log"; }
expect() { # expect <text> <what> : the last output must contain <text>
  if ! grep -q -- "$1" "$log"; then say "FAIL: $2 (no \"$1\" in the output)"; exit 1; fi
  say "ok: $2"
}

export CLAUDE_CONFIG_DIR="$work/claude"
export CODEX_HOME="$work/codex"
mkdir -p "$CLAUDE_CONFIG_DIR" "$CODEX_HOME"

# The install step: the files hold a token where the checkout goes; a copy holds the real path.
cp -R packages/mcp/clients "$work/clients"
find "$work/clients" -type f -exec sed -i "s#__TSUKURI_CHECKOUT__#$checkout#g" {} +
server="cd '$checkout' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"

say "== Claude Code $(claude --version)"
say "-- the server entry of the generated claude-code/.mcp.json goes in with add-json"
entry=$(node -e 'const f=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(JSON.stringify(f.mcpServers.tsukuri))' "$work/clients/claude-code/.mcp.json")
run claude mcp add-json --scope user tsukuri "$entry"
run claude mcp list
expect "tsukuri: .*Connected" "claude mcp list shows tsukuri Connected (the health check started the server and completed the handshake)"
run claude mcp get tsukuri
run claude mcp remove --scope user tsukuri
say "-- the one-command install of the card"
run claude mcp add --scope user --transport stdio tsukuri -- sh -c "$server"
run claude mcp list
run claude plugin validate --strict "$work/clients/claude-plugin"
expect "Validation passed" "claude plugin validate --strict accepts the generated plugin"

say "== Codex $(codex --version)"
run codex mcp add tsukuri -- sh -c "$server"
run codex mcp list
expect "tsukuri .*enabled" "codex mcp list shows the server"
run codex plugin marketplace add "$work/clients/agent-plugin"
run codex plugin add tsukuri@tsukuri-local
run codex plugin list
expect "installed, enabled" "codex plugin list shows tsukuri installed, enabled"

say "== done: every expectation held; evidence in $log"
rm -rf "$work"
