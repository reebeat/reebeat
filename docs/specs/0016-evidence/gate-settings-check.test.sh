#!/usr/bin/env bash
# Controls for gate-settings-check.sh with a stub `gh`: one good scenario that must pass, and one scenario per check that must fail
# with exactly that check's FAIL line. Usage: gate-settings-check.test.sh   (needs jq on PATH). Exit 0 only when every control behaves.
set -u
here=$(cd "$(dirname "$0")" && pwd); tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; rc=0
cat > "$tmp/gh" <<'STUB'
#!/usr/bin/env bash
# Stub gh: answers from the scenario variables only; it never touches the network or a credential.
case "$*" in
  "auth status --hostname github.com") printf '%s\n' "$S_STATUS" ;;
  "api user") printf '{"login":"%s"}\n' "$S_ME" ;;
  "api repos/o/r") printf '{"permissions":{"admin":%s}}\n' "$S_ADMIN" ;;
  "api repos/o/r/environments/e")
    if [ -n "${S_NORULE:-}" ]; then printf '{"can_admins_bypass":%s,"protection_rules":[{"type":"branch_policy"}]}\n' "$S_BYPASS"
    else printf '{"can_admins_bypass":%s,"protection_rules":[{"type":"required_reviewers","prevent_self_review":%s,"reviewers":%s}]}\n' "$S_BYPASS" "$S_SELF" "$S_REVIEWERS"; fi ;;
  *) echo "stub gh: unexpected call: $*" >&2; exit 2 ;;
esac
STUB
cat > "$tmp/secret-tool" <<'STUB'
#!/usr/bin/env bash
# Stub secret-tool: prints one item header per entry of S_SECRETS (a number), like `secret-tool search --all`.
n=${S_SECRETS:-0}; i=0; while [ "$i" -lt "$n" ]; do echo "[/org/freedesktop/secrets/collection/login/$i]"; echo "label = gh:github.com"; i=$((i+1)); done
STUB
chmod +x "$tmp/gh" "$tmp/secret-tool"
mkdir -p "$tmp/run"; export XDG_RUNTIME_DIR="$tmp/run"; unset DBUS_SESSION_BUS_ADDRESS
good() {
  rm -f "$tmp/run/bus"; unset DBUS_SESSION_BUS_ADDRESS S_SECRETS
  export S_STATUS="  ✓ Logged in to github.com account agent (keyring)
  - Token scopes: 'read:org'" S_ME=agent S_ADMIN=false S_BYPASS=false S_SELF=true
  export S_REVIEWERS='[{"type":"User","reviewer":{"login":"second"}}]'
}
run() { # name expected-exit expected-fail-substring (empty: no FAIL line at all; otherwise exactly one FAIL line, containing it)
  out=$(PATH="$tmp:$PATH" "$here/gate-settings-check.sh" o/r e 2>&1); code=$?
  fails=$(printf '%s\n' "$out" | grep -c '^FAIL'); okay=false
  if [ "$code" = "$2" ]; then
    if [ -z "$3" ]; then [ "$fails" = 0 ] && okay=true
    else [ "$fails" = "${4:-1}" ] && printf '%s\n' "$out" | grep '^FAIL' | grep -q "$3" && okay=true; fi
  fi
  if [ "$okay" = true ]; then echo "ok    $1"; else echo "WRONG $1 (exit $code, $fails FAIL lines)"; printf '%s\n' "$out" | sed 's/^/        /'; rc=1; fi
}
good; run "good: one reduced account, one user reviewer, self-review prevented, no bypass, no admin" 0 ""
good; export S_STATUS="  ✓ Logged in to github.com account agent (keyring)
  - Token scopes: 'read:org'
  ✓ Logged in to github.com account operator-admin (keyring)
  - Active account: false"; run "an inactive second account is logged in" 1 "exactly one gh account"
good; export S_REVIEWERS='[{"type":"Team","reviewer":{"slug":"releasers"}}]'; run "the reviewer is a team (no login)" 1 "every required reviewer is a user"
good; export S_REVIEWERS='[{"type":"User","reviewer":{"login":"agent"}}]'; run "the active account is the reviewer" 1 "active account is not a required reviewer"
good; export S_SELF=false; run "prevent_self_review is false" 1 "prevent_self_review"
good; export S_BYPASS=true; run "admins can bypass" 1 "can_admins_bypass"
good; export S_ADMIN=true; run "the active account is a repository admin" 1 "no repository admin"
good; export S_STATUS="  ✓ Logged in to github.com account agent (keyring)
  - Token scopes: 'gist', 'repo'"; run "the token has the classic repo scope" 1 "classic 'repo' scope"
good; touch "$tmp/run/bus"; run "a session bus is reachable (XDG_RUNTIME_DIR/bus exists)" 1 "no session bus"
good; export DBUS_SESSION_BUS_ADDRESS=unix:path=/x; run "DBUS_SESSION_BUS_ADDRESS is set" 1 "no session bus"
good; export S_SECRETS=1; run "the secret service holds a gh:github.com entry" 1 "secret service holds no gh"
good; export S_NORULE=1; run "no required_reviewers rule at all (the two checks that need a rule fail with it)" 1 "required_reviewers rule exists" 3
unset S_NORULE
exit $rc
