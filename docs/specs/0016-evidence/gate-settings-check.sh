#!/usr/bin/env bash
# F16 of spec 0016: reads, never writes, what an agent session could do to the release gate of one environment.
# usage: gate-settings-check.sh <owner/repo> <environment>      (run it as the OS user and with the credentials an agent session has)
# Needs `gh` and `jq`. Every check prints PASS or FAIL; the exit status is 0 only when all pass.
set -u
repo=${1:?owner/repo}; env=${2:?environment}; fail=0
check() { if [ "$2" = true ]; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }

status=$(gh auth status --hostname github.com 2>&1)
accounts=$(printf '%s\n' "$status" | grep -c 'Logged in to')
scopes=$(printf '%s\n' "$status" | sed -n "s/.*Token scopes: //p" | head -1)
me=$(gh api user | jq -r .login)
perms=$(gh api "repos/$repo" | jq -c .permissions)
envjson=$(gh api "repos/$repo/environments/$env")
rules=$(printf '%s' "$envjson" | jq -c '[.protection_rules[]|select(.type=="required_reviewers")]')
bypass=$(printf '%s' "$envjson" | jq -r .can_admins_bypass)

echo "OS user: $(id -un); gh accounts logged in on github.com: $accounts; active: $me; token scopes: ${scopes:-none shown (fine-grained or app token)}"
echo "repository permissions of the active account: $perms"
echo "environment $env: can_admins_bypass=$bypass; required_reviewers rules: $(printf '%s' "$rules" | jq -c '[.[]|{prevent_self_review,reviewers:[.reviewers[]|{type,who:(.reviewer.login // .reviewer.slug)}]}]')"

check "exactly one gh account is logged in for this OS user (another account's credential is one 'gh auth switch' away)" "$([ "$accounts" = 1 ] && echo true || echo false)"
check "a required_reviewers rule exists" "$(printf '%s' "$rules" | jq 'length>0')"
check "every required reviewer is a user (a team's membership is not examined, so a team fails)" "$(printf '%s' "$rules" | jq '[.[].reviewers[].type]|length>0 and all(.=="User")')"
check "the active account is not a required reviewer" "$(printf '%s' "$rules" | jq --arg me "$me" '[.[].reviewers[]|select(.type=="User")|.reviewer.login]|index($me)==null')"
check "prevent_self_review is true on every required_reviewers rule" "$(printf '%s' "$rules" | jq 'length>0 and all(.[]; .prevent_self_review==true)')"
check "can_admins_bypass is false" "$([ "$bypass" = false ] && echo true || echo false)"
check "the active account has no repository admin" "$(printf '%s' "$perms" | jq '.admin==false')"
check "the active token has no classic 'repo' scope" "$(printf '%s' "$scopes" | grep -q "'repo'" && echo false || echo true)"
echo "NOTE  not checkable here: whether a fine-grained token has Deployments: write, and who else can read the credential files of this OS user (M3). Read them in the token's settings and on the machine."
echo "result: $([ $fail = 0 ] && echo pass || echo FAIL)"; exit $fail
