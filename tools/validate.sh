#!/usr/bin/env bash
# LOGEN repository validator — structural checks run during the build (and in CI).
# Exits non-zero only on malformed files; artifact counts may be incomplete mid-build (reported, not failed).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
ok()   { printf 'ok    %s\n' "$*"; }
bad()  { printf 'FAIL  %s\n' "$*"; fail=1; }

# 1. JSON files must parse.
for j in .claude-plugin/plugin.json hooks/hooks.json package.json; do
  [ -f "$j" ] || continue
  if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$j" 2>/dev/null; then
    ok "json: $j"
  else
    bad "json: $j (parse error)"
  fi
done

# 2. Every hook + lib script must pass `node --check`.
for h in scripts/hooks/*.js scripts/lib/*.js; do
  [ -e "$h" ] || continue
  if node --check "$h" 2>/dev/null; then ok "syntax: $h"; else bad "syntax: $h"; fi
done

# 3. Markdown artifacts must be non-empty.
for m in rules/*.md skills/*/SKILL.md agents/*.md commands/*.md; do
  [ -e "$m" ] || continue
  [ -s "$m" ] && ok "doc: $m" || bad "doc: $m (empty)"
done

# 4. Every hook referenced in hooks.json must exist on disk.
if [ -f hooks/hooks.json ]; then
  while IFS= read -r ref; do
    [ -f "$ref" ] && ok "wired: $ref" || bad "wired: $ref (referenced but missing)"
  done < <(grep -oE 'scripts/hooks/[a-z-]+\.js' hooks/hooks.json | sort -u)
fi

# 5. Registry counts (ECC_OPS.md §XVIII). With --strict, enforce the full target (fail on mismatch);
#    otherwise just report progress (used mid-build).
count() { find "$1" -maxdepth 2 -name "$2" 2>/dev/null | wc -l | tr -d ' '; }
sk=$(count skills 'SKILL.md'); ag=$(count agents '*.md'); cm=$(count commands '*.md')
ru=$(count rules '*.md'); hk=$(count scripts/hooks '*.js')
printf '\nregistry: skills %s/28 · subagents %s/9 · commands %s/24 · rules %s/3 · hooks %s/8\n' "$sk" "$ag" "$cm" "$ru" "$hk"

if [ "${1:-}" = "--strict" ]; then
  [ "$sk" = 28 ] || bad "skills count $sk != 28"
  [ "$ag" = 9 ]  || bad "subagents count $ag != 9"
  [ "$cm" = 24 ] || bad "commands count $cm != 24"
  [ "$ru" = 3 ]  || bad "rules count $ru != 3"
  [ "$hk" = 8 ]  || bad "hooks count $hk != 8"
fi

if [ "$fail" -eq 0 ]; then echo "VALIDATE: PASS"; else echo "VALIDATE: FAIL"; fi
exit "$fail"
