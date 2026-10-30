#!/usr/bin/env bash
# F14, the half the drift test cannot do (spec 0016): drive the real client CLIs on the generated files, in isolated
# configuration directories, so nothing of the operator's Claude Code or Codex setup is read or changed. Run it from
# the repository root inside `devenv shell`:
#
#   devenv shell -- bash packages/mcp/scripts/check-clients.sh [output-directory]
#
# It prints each command and its output, fails at the first command that exits non-zero (the exit status of the CLI, not
# of `tee`: `pipefail`), and checks each expectation against the output of the command it follows, not the whole log.
# It needs `claude` and `codex` on the PATH and starts the server once (`claude mcp list` connects to it); it sends
# nothing anywhere. Isolation is checked, not assumed: `HOME` is an empty directory (so `~/.agents/plugins`, the
# operator's personal marketplace, is not listed), and the operator's real client files are hashed before and after and
# must not change.
set -euo pipefail

checkout=$(pwd)
out=${1:-"$HOME/.local/state/tsukuri-verify/$(date +%F)-clients"}
work=$(mktemp -d)
real_home=$HOME
mkdir -p "$out"
log="$out/check-clients.txt"
: > "$log"

say() { printf '%s\n' "$*" | tee -a "$log"; }

last=""
run() { # run <command...>: show it, keep its output in $last, stop if it fails
  say "\$ $*"
  local status=0
  last=$("$@" 2>&1) || status=$?
  printf '%s\n' "$last" | tee -a "$log"
  if [ "$status" -ne 0 ]; then say "FAIL: exit $status"; exit 1; fi
}
expect() { # expect <pattern> <what>: the output of the last command must match
  if ! printf '%s\n' "$last" | grep -Eq -- "$1"; then say "FAIL: $2 (no match for /$1/ in the output above)"; exit 1; fi
  say "ok: $2"
}

fingerprint() { # the operator's real client files: names and hashes only
  for f in "$real_home/.claude.json" "$real_home/.claude/settings.json" "$real_home/.codex/config.toml" "$real_home/.agents/plugins/marketplace.json"; do
    if [ -f "$f" ]; then printf '%s %s\n' "$(sha256sum < "$f" | cut -c1-16)" "$f"; else printf 'absent %s\n' "$f"; fi
  done
}
before=$(fingerprint)

# The isolated environment: an empty home, and the caches `devenv shell` and Nix need from the real one.
export HOME="$work/home"
export CLAUDE_CONFIG_DIR="$work/claude"
export CODEX_HOME="$work/codex"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$real_home/.cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$real_home/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$real_home/.local/share}"
export XDG_STATE_HOME="${XDG_STATE_HOME:-$real_home/.local/state}"
mkdir -p "$HOME" "$CLAUDE_CONFIG_DIR" "$CODEX_HOME"

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
expect "Status: .*Connected" "claude mcp get shows Connected"
run claude mcp remove --scope user tsukuri
say "-- the one-command install of the card"
run claude mcp add --scope user --transport stdio tsukuri -- sh -c "$server"
run claude mcp list
expect "tsukuri: .*Connected" "the card's one-command install connects"
say "-- the plugin: validate, then install from a local marketplace (needs the marketplace file)"
run claude plugin validate --strict "$work/clients/claude-plugin"
expect "Validation passed" "claude plugin validate --strict accepts the generated marketplace"
run claude plugin validate --strict "$work/clients/claude-plugin/plugins/tsukuri"
expect "Validation passed" "claude plugin validate --strict accepts the generated plugin"
run claude plugin marketplace add "$work/clients/claude-plugin"
run claude plugin install "tsukuri@tsukuri-local"
run claude plugin list
expect "tsukuri@tsukuri-local" "claude plugin list shows the plugin installed"
expect "enabled" "the plugin is enabled"

say "== Codex $(codex --version)"
run codex mcp add tsukuri -- sh -c "$server"
run codex mcp list
expect "tsukuri +sh .*enabled" "codex mcp list shows the server enabled"
run codex plugin marketplace add "$work/clients/agent-plugin"
run codex plugin add tsukuri@tsukuri-local
run codex plugin list
expect "tsukuri@tsukuri-local +installed, enabled" "codex plugin list shows tsukuri installed, enabled"
if printf '%s\n' "$last" | grep -q "personal"; then say "FAIL: the operator's personal marketplace was listed: HOME is not isolated"; exit 1; fi
say "ok: the operator's personal marketplace was not read"

after=$(HOME=$real_home fingerprint)
if [ "$before" != "$after" ]; then say "FAIL: the operator's client files changed"; say "$before"; say "$after"; exit 1; fi
say "ok: the operator's client files are unchanged:"
say "$after"

say "== done: every expectation held; evidence in $log"
rm -rf "$work"
