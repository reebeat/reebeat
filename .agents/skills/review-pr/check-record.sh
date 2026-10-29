#!/usr/bin/env bash
# check-record.sh <pass|changes> <body-file>
# The header of a review record: three lines, in this order, at the top of the body file.
#   Author: <who wrote the change>
#   Reviewers: <name>[, <name>]...
#   Checked: <plan, implementation, agreement: the parts the reviewers judged>
# Exit 65 (with the reason on stderr) when a line is missing or out of order, a part is unknown, a pass leaves a part
# unchecked, or a pass lists the author among the reviewers: a review that the author records about their own change is not
# independent, so it cannot pass. A record that asks for changes may be written by anyone.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: check-record.sh <pass|changes> <body-file>" >&2; exit 64; }
verdict=$1; body=$2

refuse() { echo "review record refused: $1" >&2; exit 65; }
line() { sed -n "${1}p" "$body"; }

author=$(line 1 | sed -n 's/^Author: *//p')
reviewers=$(line 2 | sed -n 's/^Reviewers: *//p')
checked=$(line 3 | sed -n 's/^Checked: *//p')
[ -n "$author" ] || refuse "line 1 must be \"Author: <name>\""
[ -n "$reviewers" ] || refuse "line 2 must be \"Reviewers: <name>[, <name>]...\""
[ -n "$checked" ] || refuse "line 3 must be \"Checked: plan, implementation, agreement\" (the parts judged)"

norm() { tr 'A-Z' 'a-z' <<<"$1" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | sed '/^$/d'; }

for part in $(norm "$checked" | tr ' ' '_'); do
  case $part in plan|implementation|agreement) ;; *) refuse "Checked names \"$part\": use plan, implementation, agreement" ;; esac
done

if [ "$verdict" = pass ]; then
  for part in plan implementation agreement; do
    norm "$checked" | grep -qxF -e "$part" || refuse "a pass must check $part"
  done
  # Names are compared literally (-F): a name such as claude[bot] or a.b is text, never a pattern.
  norm "$reviewers" | grep -qxF -e "$(norm "$author")" && refuse "the author ($author) is among the reviewers: not independent"
fi
exit 0
