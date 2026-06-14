#!/usr/bin/env bash
# LOGEN behavioral dry-run — exercises hooks, CLIs, state lifecycle, and the full pipeline against a
# throwaway ~/.logen (LOGEN_HOME), WITHOUT touching any real server. Read-only to the host; all writes
# go to a temp dir that is removed at the end. Run: bash tools/dry-run.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
H="$(mktemp -d)/logen"; mkdir -p "$H/profiles" "$H/memory" "$H/shadow"
export LOGEN_HOME="$H"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$*"; }
ng(){ FAIL=$((FAIL+1)); printf '  \033[31m✗ %s\033[0m\n' "$*"; }
info(){ printf '    · %s\n' "$*"; }
hdr(){ printf '\n\033[1m══ %s ══\033[0m\n' "$*"; }
hook(){ printf '%s' "$2" | node "$ROOT/scripts/hooks/$1" >/tmp/lg.out 2>/tmp/lg.err; echo $?; }
expect(){ [ "$2" = "$3" ] && ok "$1 → exit $3" || ng "$1 → expected $2, got $3"; }

# ---- seed a realistic fleet + operator context (fake) ----
cat > "$H/active.json" <<'J'
{"host":"web01","operator":"syamsuddin.ideris@gmail.com","mode":"single"}
J
cat > "$H/profiles/web01.json" <<'J'
{"host":{"name":"web01"},"os":{"distro":"Ubuntu","version":"24.04"},
 "stack":{"web_server":{"name":"nginx","version":"1.26"},"runtimes":[{"name":"php","version":"8.3","fpm":true}]},
 "apps":[{"name":"shop","domain":"shop.example.com","path":"/var/www/shop"}],
 "firewall":{"allowed":[{"port":22},{"port":443}]},
 "freshness":{"ssl":{"checked_at":"2026-05-01T00:00:00Z","ttl_h":12},"firewall":{"checked_at":"2026-06-14T00:00:00Z","ttl_h":24}},
 "last_discovery":"2026-06-14T00:00:00Z"}
J
# two more hosts with an exposed-redis condition (for the immunity fleet scan)
echo '{"host":{"name":"web02"},"firewall":{"allowed":[{"port":22},{"port":6379}]}}' > "$H/profiles/web02.json"
echo '{"host":{"name":"web03"},"firewall":{"allowed":[{"port":22},{"port":6379}]}}' > "$H/profiles/web03.json"
printf '%s\n' '{"scope":"global","title":"deploy-no-hard-reset","type":"instruction","fact":"Deploy via git pull + restart; never a framework tool that runs git reset --hard.","confidence":"high"}' > "$H/memory/global.jsonl"

# =====================================================================
hdr "1. Plugin structure"
node -e "JSON.parse(require('fs').readFileSync('$ROOT/.claude-plugin/plugin.json','utf8'))" && ok "plugin.json valid JSON" || ng "plugin.json invalid"
node -e "const h=JSON.parse(require('fs').readFileSync('$ROOT/hooks/hooks.json','utf8')).hooks;const n=[...(h.SessionStart||[]),...(h.PreToolUse||[]),...(h.PostToolUse||[])].flatMap(e=>e.hooks).length;process.exit(n===8?0:1)" && ok "hooks.json wires 8 hooks" || ng "hooks.json hook count != 8"
info "registry: $(cd "$ROOT" && bash tools/validate.sh --strict 2>/dev/null | grep -o 'skills [0-9].*hooks [0-9]*/8')"

# =====================================================================
hdr "2. SessionStart context-load (Profile + Memory + freshness)"
DIG="$(printf '%s' '{"session_id":"dry"}' | node "$ROOT/scripts/hooks/ops-context-load.js" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).hookSpecificOutput.additionalContext))')"
echo "$DIG" | grep -q "web01 (Ubuntu 24.04)" && ok "injects active host + OS summary" || ng "missing host summary"
echo "$DIG" | grep -q "critical_stale" && ok "flags critical_stale (ssl past TTL)" || ng "did not flag stale SSL"
echo "$DIG" | grep -q "deploy-no-hard-reset" && ok "injects operator memory digest" || ng "missing memory digest"
echo "$DIG" | sed 's/^/    │ /'

# =====================================================================
hdr "3. Safety classification battery (READ/WRITE/DESTRUCTIVE/blocked)"
node -e '
const {isCatastrophic,classifyTier,opClass}=require("'"$ROOT"'/scripts/lib/rules");
const cases=[
 ["df -h","READ",false],["systemctl status nginx","READ",false],
 ["systemctl reload nginx","WRITE",false],["certbot renew","WRITE",false],["git pull --ff-only","WRITE",false],
 ["rm -rf /var/www/old","DESTRUCTIVE",false],["TRUNCATE TABLE users","DESTRUCTIVE",false],
 ["rm -rf /*","DESTRUCTIVE",true],["ufw disable","DESTRUCTIVE",true],["chmod 777 /etc","WRITE",true],["DROP DATABASE app","DESTRUCTIVE",true]
];
let bad=0;
for(const [c,tier,cat] of cases){
  const t=classifyTier(c), b=!!isCatastrophic(c);
  const tierOk = t===tier, catOk = b===cat;
  console.log(`    ${(tierOk&&catOk)?"\x1b[32m✓\x1b[0m":"\x1b[31m✗\x1b[0m"} ${b?"BLOCK ":"      "} ${t.padEnd(11)} ${opClass(c).padEnd(14)} ${c}`);
  if(!(tierOk&&catOk)) bad++;
}
process.exit(bad?1:0)
' && ok "all 11 classifications correct" || ng "classification mismatch"

# =====================================================================
hdr "4. Full pipeline — a deploy op (requires_shadow + require_containment)"
cat > "$H/op-context.json" <<'J'
{"requires_shadow":true,"require_containment":true,"blast_radius":["/var/www/shop"],
 "op_class":"deploy:shop","actor":"syamsuddin.ideris@gmail.com","reason":"release v1.2",
 "rollback_cmd":"ln -sfn /var/www/shop/releases/prev /var/www/shop/current"}
J
CMD='git pull --ff-only'
PL="{\"tool_input\":{\"command\":\"$CMD\"},\"session_id\":\"dry\"}"
expect "safety-check allows (not catastrophic)" 0 "$(hook ops-safety-check.js "$PL")"
expect "shadow-gate BLOCKS (no rehearsal yet)" 2 "$(hook ops-shadow-gate.js "$PL")"
# operator rehearses → seed a fresh passing T1 record (validators absent on this host)
node -e 'const s=require("'"$ROOT"'/scripts/lib/shadow");s.writeRecord("web01",{op_hash:s.opHash("'"$CMD"'","web01"),command:"'"$CMD"'",host:"web01",shadow_fidelity:"T1",passed:true,rehearsed_at:new Date().toISOString(),ttl_s:1800})'
expect "shadow-gate ALLOWS after rehearsal pass" 0 "$(hook ops-shadow-gate.js "$PL")"
expect "sandbox-wrap BLOCKS (uncontained)" 2 "$(hook ops-sandbox-wrap.js "$PL")"
WPL="{\"tool_input\":{\"command\":\"sudo logen-sandbox-helper contain deploy-shop /var/www/shop -- $CMD\"},\"session_id\":\"dry\"}"
expect "sandbox-wrap ALLOWS (contained)" 0 "$(hook ops-sandbox-wrap.js "$WPL")"
expect "confirm-gate allows WRITE (not promoted)" 0 "$(hook ops-confirm-gate.js "$PL")"
hook ops-audit-log.js "{\"tool_input\":{\"command\":\"$CMD\"},\"tool_response\":{\"success\":true},\"session_id\":\"dry\"}" >/dev/null
[ -f "$H/audit/web01.jsonl" ] && grep -q '"op_class":"deploy:shop"' "$H/audit/web01.jsonl" && ok "audit entry written (deploy:shop, release v1.2)" || ng "audit entry missing"
node -e 'const p=JSON.parse(require("fs").readFileSync("'"$H"'/profiles/web01.json","utf8"));process.exit(p.autonomy_ledger&&p.autonomy_ledger["deploy:shop"].evidence.prod===1?0:1)' && ok "trust ledger fed prod evidence (deploy:shop prod=1)" || ng "ledger not updated"

# =====================================================================
hdr "5. CLI flows"
info "── /shadow ──"
node "$ROOT/scripts/shadow.js" rehearse "$CMD" 2>/dev/null | sed 's/^/    /'
node "$ROOT/scripts/shadow.js" list 2>/dev/null | head -2 | sed 's/^/    /'
info "── /trust ──  (seed strong evidence → propose → approve)"
node -e 'const L=require("'"$ROOT"'/scripts/lib/ledger");let e=L.newEntry();for(let i=0;i<47;i++)e=L.applyEvidence(e,{source:"prod",result:"success"});for(let i=0;i<130;i++)e=L.applyEvidence(e,{source:"rehearsal",fidelity:"T2"});e.proposed_tier=L.recommendTier(e,{destructive:false});L.setEntry("web01","deploy:shop",e)'
node "$ROOT/scripts/trust.js" show 2>/dev/null | sed 's/^/    /'
node "$ROOT/scripts/trust.js" approve deploy:shop 2>/dev/null | sed 's/^/    /'
node "$ROOT/scripts/trust.js" explain deploy:shop 2>/dev/null | tail -1 | sed 's/^/    /'
node -e 'const L=require("'"$ROOT"'/scripts/lib/ledger");process.exit(L.effectiveTier(L.getEntry("web01","deploy:shop"))==="auto-with-notify"?0:1)' && ok "promotion applied → deploy:shop now auto-with-notify" || ng "promotion not applied"
RJ="$(node "$ROOT/scripts/trust.js" approve restore:db 2>&1)"; echo "$RJ" | grep -q "refused" && ok "/trust refuses DESTRUCTIVE class (restore:db)" || ng "DESTRUCTIVE wrongly promotable"
info "── /immunize ──  (antibody → fleet scan → quorum → retire)"
node -e 'const I=require("'"$ROOT"'/scripts/lib/immunity");const ab=I.makeAntibody({title:"redis-exposed",signature:"redis port open to the world",detector:{all:[{path:"firewall.allowed",op:"any_eq",field:"port",value:6379}]},remediation:{fix:"ufw delete allow 6379",rollback:"ufw allow 6379"},confidence:"medium"});I.saveAntibody(ab)'
node "$ROOT/scripts/immunize.js" review 2>/dev/null | sed 's/^/    /'
AID="$(node "$ROOT/scripts/immunize.js" review 2>/dev/null | awk '{print $1;exit}')"
SCAN="$(node "$ROOT/scripts/immunize.js" scan "$AID" 2>/dev/null)"; echo "$SCAN" | sed 's/^/    /'
echo "$SCAN" | grep -q "web02" && echo "$SCAN" | grep -q "web03" && echo "$SCAN" | grep -q "quorum MET" && ok "fleet scan found web02+web03 → quorum MET" || ng "fleet scan/quorum wrong"
node "$ROOT/scripts/immunize.js" retire "$AID" >/dev/null 2>&1
node "$ROOT/scripts/immunize.js" review 2>/dev/null | grep -q "no active antibodies" && ok "antibody retired (tombstone)" || ng "retire failed"

# =====================================================================
hdr "6. Final state (written to throwaway ~/.logen)"
for f in audit/web01.jsonl profiles/web01.json shadow/web01.jsonl memory/global.jsonl; do
  [ -f "$H/$f" ] && info "$f  ($(wc -l < "$H/$f" | tr -d ' ') line(s))"
done

# =====================================================================
rm -rf "$(dirname "$H")"
hdr "RESULT"
printf '  \033[1m%d passed, %d failed\033[0m  (throwaway state removed)\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
