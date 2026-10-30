#!/bin/sh
# The felt journey of the inspector (spec 0018), headless: a real Claude Code session and a real Codex session each list,
# read, lint and plan a project, read its build and look at one frame of its video through the generated server
# command, and the transcripts are checked for the calls and the image. It uses the operator's logged-in `claude` and
# `codex` (a few short turns each) and changes no setting of either: Claude Code gets the server through
# `--mcp-config --strict-mcp-config`, Codex through `-c` overrides. Run from the repository root inside `devenv shell`:
#
#   devenv shell -- sh packages/mcp/scripts/journey.sh [output-directory]
#
# With TSUKURI_ROOT and TSUKURI_BUILDS set (and JOURNEY_PROJECT, JOURNEY_SCENE, JOURNEY_EFFECT) it reads that workspace,
# for example `stories` and a directory holding `same-id/` made by `tsukuri build`; otherwise it writes the tests'
# workspace (`harbour`, with a small real build) to a temporary directory.
set -eu

checkout=$(pwd)
out=${1:-"$HOME/.local/state/tsukuri-verify/$(date +%F)-journey"}
work=$(mktemp -d)
mkdir -p "$out" "$work/cwd"

if [ -z "${TSUKURI_ROOT:-}" ]; then
  eval "$(bun packages/mcp/test/makeWorkspace.ts "$work/workspace" | sed 's/^/export /')"
fi
project=${JOURNEY_PROJECT:-harbour}
scene=${JOURNEY_SCENE:-pier}
effect=${JOURNEY_EFFECT:-f1}
server="cd '$checkout' && exec devenv shell -- bun packages/mcp/bin/tsukuri-mcp.ts"

prompt="Use only the tsukuri MCP tools (their names start with mcp__tsukuri__; load them with tool search if they are deferred); do not run shell commands. Work on the project $project: project_list, project_get $project, story_read $project, story_lint $project, plan_get $project with view timing, build_get $project, then artifact_observe $project with kind frame at {scene: \"$scene\", effect: \"$effect\"}. Answer in three short lines: the stage of $project and whether its build is of the head Screenplay; the number of lint errors; the frame number observed and what the image shows. End with the line JOURNEY-DONE."

cat > "$work/mcp.json" <<JSON
{ "mcpServers": { "tsukuri": { "type": "stdio", "command": "sh", "args": ["-c", "$server"], "env": { "TSUKURI_ROOT": "$TSUKURI_ROOT", "TSUKURI_BUILDS": "$TSUKURI_BUILDS" } } } }
JSON

echo "== workspace: TSUKURI_ROOT=$TSUKURI_ROOT TSUKURI_BUILDS=$TSUKURI_BUILDS project=$project"

echo "== Claude Code $(claude --version)"
(cd "$work/cwd" && claude -p "$prompt" --mcp-config "$work/mcp.json" --strict-mcp-config \
  --allowedTools "mcp__tsukuri__project_list,mcp__tsukuri__project_get,mcp__tsukuri__story_read,mcp__tsukuri__story_lint,mcp__tsukuri__plan_get,mcp__tsukuri__build_get,mcp__tsukuri__artifact_observe,ToolSearch" \
  --output-format stream-json --verbose --max-turns 20) > "$out/claude.jsonl"

echo "== Codex $(codex --version)"
codex exec --ephemeral --json -s read-only --skip-git-repo-check -C "$work/cwd" \
  -c 'mcp_servers.tsukuri.command="sh"' \
  -c "mcp_servers.tsukuri.args=[\"-c\",\"$server\"]" \
  -c "mcp_servers.tsukuri.env={TSUKURI_ROOT=\"$TSUKURI_ROOT\",TSUKURI_BUILDS=\"$TSUKURI_BUILDS\"}" \
  -c 'mcp_servers.tsukuri.startup_timeout_sec=60' \
  "$prompt" > "$out/codex.jsonl" 2> "$out/codex.err"

bun packages/mcp/bin/journeyCheck.ts "$out/claude.jsonl" "$out/codex.jsonl" | tee "$out/journey.txt"
rm -rf "$work"
