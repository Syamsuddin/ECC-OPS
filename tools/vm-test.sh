#!/usr/bin/env bash
# LOGEN host-side validation — run INSIDE a throwaway Linux VM (systemd + nginx + node).
# Proves the host-dependent behaviour the local macOS dry-run CANNOT: real native validators,
# real systemd-run containment confinement, caps-probe, a live-service pipeline, and that the
# unit suite + dry-run also pass on Linux.
#
# ⚠️ Run ONLY on a disposable VM — it edits nginx config (then reverts) and runs root-confined
#    commands. State goes to a temp LOGEN_HOME that is removed at the end.
# Usage:  bash tools/vm-test.sh [repo-dir]
set -uo pipefail
ROOT="${1:-$HOME/logen}"; cd "$ROOT" 2>/dev/null || { echo "LOGEN repo not found at $ROOT"; exit 1; }
H="$(mktemp -d)/logen"; mkdir -p "$H/profiles" "$H/shadow"; export LOGEN_HOME="$H"
echo '{"host":"vm01","operator":"vm-tester"}' > "$H/active.json"
HELP=/usr/local/bin/logen-sandbox-helper
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$*"; }
ng(){ FAIL=$((FAIL+1)); printf '  \033[31m✗ %s\033[0m\n' "$*"; }
hdr(){ printf '\n\033[1m══ %s ══\033[0m\n' "$*"; }

command -v systemd-run >/dev/null || { echo "no systemd-run — this must run on a real systemd VM, not a plain container"; exit 1; }
[ -x "$HELP" ] || { echo "helper not installed — run tools/vm-bootstrap.sh first"; exit 1; }

hdr "A. Native T1 validators actually execute (ops-shadow real)"
# Validators commonly need root to read all of /etc/nginx + open logs, so run the rehearsal via sudo -E.
sudo -E env LOGEN_HOME="$H" node scripts/shadow.js rehearse "systemctl reload nginx" >/tmp/lg-a1 2>&1
grep -q "T1 PASS" /tmp/lg-a1 && ok "valid nginx config → rehearsal T1 PASS (real nginx -t ran)" || ng "expected T1 PASS — got: $(cat /tmp/lg-a1)"
echo 'invalid_directive_logen_xyz;' | sudo tee /etc/nginx/conf.d/zz-logen-bad.conf >/dev/null
sudo -E env LOGEN_HOME="$H" node scripts/shadow.js rehearse "systemctl reload nginx" >/tmp/lg-a2 2>&1
grep -q "T1 FAIL" /tmp/lg-a2 && ok "broken nginx config → rehearsal T1 FAIL (caught the real error)" || ng "expected T1 FAIL"
sudo rm -f /etc/nginx/conf.d/zz-logen-bad.conf

hdr "B. caps-probe on real Linux"
node -e 'const c=require("./scripts/lib/sandbox").detectCapabilities();console.log(JSON.stringify(c));process.exit((c.namespaces.length||c.seccomp||c.landlock)?0:1)' \
  && ok "lib caps-probe detected real primitives" || ng "caps-probe empty (unexpected on Linux)"
sudo "$HELP" caps-probe >/tmp/lg-b 2>&1 && [ -s /tmp/lg-b ] && ok "helper caps-probe ran as root → $(tr '\n' ' ' </tmp/lg-b)" || ng "helper caps-probe empty"

hdr "C. systemd-run containment ACTUALLY confines (the key Linux-only proof)"
sudo mkdir -p /var/lib/logen-test
sudo "$HELP" contain t1 /var/lib/logen-test -- bash -c 'touch /var/lib/logen-test/ok' 2>/tmp/lg-c1
[ -f /var/lib/logen-test/ok ] && ok "write to ALLOWED ReadWritePaths succeeded" || ng "allowed write failed: $(cat /tmp/lg-c1)"
sudo "$HELP" contain t2 /var/lib/logen-test -- bash -c 'touch /etc/logen-escape' 2>/dev/null || true
if [ -f /etc/logen-escape ]; then ng "ESCAPE — write to /etc was NOT blocked"; sudo rm -f /etc/logen-escape; else ok "write to /etc BLOCKED by ProtectSystem=strict"; fi
sudo "$HELP" contain t3 / -- echo hi >/dev/null 2>&1 && ng "helper accepted rw=/ (should refuse)" || ok "helper refuses rw=/ even invoked directly as root (defense-in-depth)"
sudo rm -rf /var/lib/logen-test

hdr "D. Live-service pipeline (ops-post-verify against real systemctl)"
sudo systemctl reload nginx
printf '%s' '{"tool_input":{"command":"systemctl reload nginx"}}' | node scripts/hooks/ops-post-verify.js >/tmp/lg-d 2>&1
[ -s /tmp/lg-d ] && ng "post-verify warned though nginx is active: $(cat /tmp/lg-d)" || ok "post-verify: active nginx → no warning"
printf '%s' '{"tool_input":{"command":"systemctl restart logen-nonexistent.service"}}' | node scripts/hooks/ops-post-verify.js 2>/tmp/lg-d2 >/dev/null
grep -qi "WARNING" /tmp/lg-d2 && ok "post-verify: unknown/inactive service → WARNING raised" || ng "expected a warning for inactive service"

hdr "E. Cross-platform: unit suite + dry-run on Linux"
npm test >/tmp/lg-e1 2>&1; grep -qE "# fail 0" /tmp/lg-e1 && ok "npm test: all pass on Linux ($(grep -oE '# pass [0-9]+' /tmp/lg-e1))" || ng "npm test failed on Linux (see /tmp/lg-e1)"
bash tools/dry-run.sh >/tmp/lg-e2 2>&1; grep -qE "0 failed" /tmp/lg-e2 && ok "npm run dry-run: all pass on Linux" || ng "dry-run failed on Linux (see /tmp/lg-e2)"

rm -rf "$(dirname "$H")"
hdr "RESULT"
printf '  \033[1m%d passed, %d failed\033[0m\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
