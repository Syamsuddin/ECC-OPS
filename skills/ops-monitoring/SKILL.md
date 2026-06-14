---
name: ops-monitoring
description: Proactive health checks, resource metrics, and agentless alerting (cron-based) for managed servers.
version: 1.0
---

# Operations: Monitoring & Proactive Alerting

Monitoring answers one question continuously: *is this server healthy right now, and is anything trending toward failure?* LOGEN favors an **agentless** model — every check is built from tools already present on the host (cron, curl, awk, systemctl) — so no external collector or open port is required.

## When to Use

- Standing up baseline health monitoring on a freshly provisioned server.
- Running an on-demand health snapshot during a session (`/health-check`).
- Installing proactive, scheduled monitoring with alerting (`/monitor`).
- Investigating whether a symptom (slowness, errors) correlates with a resource threshold breach.

## Health Check Philosophy

A useful health check is **layered**: liveness (is the process up?), readiness (can it serve a request end-to-end, including its DB?), and resource headroom (CPU/RAM/disk/swap). Liveness without readiness is a trap — a PHP-FPM master can be up while every worker blocks on a dead database.

## Application Health Endpoints (per stack)

Expose a lightweight, unauthenticated-but-obscure health route that touches the database so readiness is verified, not just liveness.

### PHP / Laravel

```php
// routes/web.php — readiness probe that verifies the DB connection
Route::get('/_health', function () {
    try {
        DB::connection()->getPdo()->query('SELECT 1');
        return response()->json([
            'status' => 'ok',
            'time'   => now()->toIso8601String(),
        ], 200);
    } catch (\Throwable $e) {
        return response()->json([
            'status' => 'degraded',
            'error'  => 'database unreachable',
        ], 503);
    }
});
```

### Node / Express

```javascript
// health.js — readiness probe with a DB round-trip (pg example)
const express = require('express');
const router = express.Router();

router.get('/_health', async (req, res) => {
  try {
    await req.app.locals.db.query('SELECT 1'); // pool injected at boot
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: 'database unreachable' });
  }
});

module.exports = router;
```

### Python / Django

```python
# views.py — readiness probe verifying the default DB connection
from django.db import connections
from django.http import JsonResponse
from django.utils import timezone


def health(request):
    try:
        with connections['default'].cursor() as cur:
            cur.execute('SELECT 1')
        return JsonResponse({'status': 'ok', 'time': timezone.now().isoformat()})
    except Exception:
        return JsonResponse({'status': 'degraded', 'error': 'database unreachable'},
                            status=503)
```

## System Health Check Script

A single, dependency-free script that prints a full snapshot. Read-only (tier READ); safe to run any time and to schedule.

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-health-check.sh — agentless full health snapshot (READ-only)
set -uo pipefail
export LC_ALL=C

# --- Config (override via /etc/logen/health.conf) -------------------------
DISK_WARN=${DISK_WARN:-85}          # percent
SWAP_WARN=${SWAP_WARN:-50}          # percent of swap used
LOAD_PER_CORE_WARN=${LOAD_PER_CORE_WARN:-1.5}
SSL_WARN_DAYS=${SSL_WARN_DAYS:-14}
SERVICES=${SERVICES:-"nginx php8.3-fpm mysql"}
APP_URLS=${APP_URLS:-"https://example.com/_health"}
CONF=/etc/logen/health.conf
[ -r "$CONF" ] && . "$CONF"

bold() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()   { printf '  [OK]   %s\n' "$1"; }
warn() { printf '  [WARN] %s\n' "$1"; }
crit() { printf '  [CRIT] %s\n' "$1"; }

bold "Host & Uptime"
printf '  host=%s  kernel=%s\n' "$(hostname -f 2>/dev/null || hostname)" "$(uname -r)"
printf '  %s\n' "$(uptime -p 2>/dev/null || uptime)"

bold "Load Average"
CORES=$(nproc)
read -r L1 L5 L15 _ < /proc/loadavg
THRESH=$(awk -v c="$CORES" -v p="$LOAD_PER_CORE_WARN" 'BEGIN{printf "%.2f", c*p}')
printf '  cores=%s  load(1/5/15)=%s/%s/%s  warn>%s\n' "$CORES" "$L1" "$L5" "$L15" "$THRESH"
awk -v l="$L1" -v t="$THRESH" 'BEGIN{exit !(l>t)}' && warn "1m load above threshold" || ok "load within range"

bold "Memory & Swap"
free -h | awk 'NR==1||/Mem|Swap/'
SWAP_TOTAL=$(awk '/SwapTotal/{print $2}' /proc/meminfo)
SWAP_FREE=$(awk '/SwapFree/{print $2}'  /proc/meminfo)
if [ "${SWAP_TOTAL:-0}" -gt 0 ]; then
  SWAP_PCT=$(( (SWAP_TOTAL - SWAP_FREE) * 100 / SWAP_TOTAL ))
  [ "$SWAP_PCT" -ge "$SWAP_WARN" ] && warn "swap used ${SWAP_PCT}%" || ok "swap used ${SWAP_PCT}%"
fi

bold "Disk Usage"
df -hP -x tmpfs -x devtmpfs | awk 'NR==1{print "  "$0; next}{print "  "$0}'
df -P -x tmpfs -x devtmpfs | awk -v w="$DISK_WARN" 'NR>1{
  gsub(/%/,"",$5);
  if ($5+0 >= w) printf "  [WARN] %s at %s%%\n", $6, $5
}'

bold "Services"
for svc in $SERVICES; do
  if systemctl is-active --quiet "$svc"; then ok "$svc active"
  else crit "$svc NOT active"; fi
done

bold "Application Endpoints"
for url in $APP_URLS; do
  read -r CODE TIME < <(curl -ksS -o /dev/null \
    -w '%{http_code} %{time_total}\n' --max-time 10 "$url" || echo "000 0")
  if [ "$CODE" = "200" ]; then ok "$url -> ${CODE} in ${TIME}s"
  else crit "$url -> ${CODE} (time ${TIME}s)"; fi
done

bold "Errors (last 1h)"
ERRS=$(journalctl --since "1 hour ago" -p err --no-pager 2>/dev/null | wc -l)
[ "$ERRS" -gt 0 ] && warn "${ERRS} error-level journal lines in last hour" || ok "no error-level journal lines"

bold "SSL Expiry"
for url in $APP_URLS; do
  host=$(printf '%s' "$url" | awk -F[/:] '{print $4}')
  [ -z "$host" ] && continue
  END=$(echo | openssl s_client -servername "$host" -connect "${host}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -z "$END" ] && { warn "$host: cannot read certificate"; continue; }
  EXP=$(date -d "$END" +%s 2>/dev/null); NOW=$(date +%s)
  DAYS=$(( (EXP - NOW) / 86400 ))
  [ "$DAYS" -lt "$SSL_WARN_DAYS" ] && warn "$host cert expires in ${DAYS}d" || ok "$host cert valid ${DAYS}d"
done

bold "Backups"
BK_DIR=${BK_DIR:-/var/backups/logen}
if [ -d "$BK_DIR" ]; then
  LAST=$(find "$BK_DIR" -type f -name '*.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1)
  if [ -n "$LAST" ]; then
    AGE_H=$(( ( $(date +%s) - ${LAST%% *} ) / 3600 ))
    [ "$AGE_H" -gt 26 ] && warn "last backup ${AGE_H}h old (${LAST#* })" \
                        || ok "last backup ${AGE_H}h old"
  else warn "no backup files found in $BK_DIR"; fi
else warn "backup dir $BK_DIR missing"; fi

bold "Security Posture"
if command -v ufw >/dev/null; then
  ufw status | head -1 | grep -qi active && ok "UFW active" || crit "UFW inactive"
fi
FAILED=$(journalctl _SYSTEMD_UNIT=ssh.service _SYSTEMD_UNIT=sshd.service --since "1 hour ago" \
         --no-pager 2>/dev/null | grep -ci 'failed password')
[ "$FAILED" -gt 20 ] && warn "${FAILED} failed SSH logins in last hour" \
                     || ok "${FAILED} failed SSH logins last hour"
if command -v fail2ban-client >/dev/null; then
  BANNED=$(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/{gsub(/ /,"",$2);print $2}')
  ok "fail2ban sshd currently banned: ${BANNED:-0}"
fi

bold "Done"
date -Is
```

## Agentless Cron-Based Monitoring

No external agent — just cron plus the snapshot script. Two cadences: a fast liveness/threshold check that only speaks when something is wrong, and a daily digest that always reports.

```bash
# /etc/cron.d/logen-monitoring — installed by /monitor (tier WRITE)
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

# Every 5 min: run threshold watcher; it self-suppresses when all clear
*/5 *  * * *  root  /usr/local/bin/ecc-monitor-watch.sh >> /var/log/logen/monitor.log 2>&1

# Daily 07:00: full health digest pushed to the configured channel
0 7    * * *  root  /usr/local/bin/ecc-health-check.sh | /usr/local/bin/ecc-alert.sh digest "Daily health report $(hostname -f)"
```

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-monitor-watch.sh — threshold watcher; alerts only on breach
set -uo pipefail
. /etc/logen/health.conf 2>/dev/null || true
DISK_WARN=${DISK_WARN:-85}; LOAD_PER_CORE_WARN=${LOAD_PER_CORE_WARN:-1.5}
SERVICES=${SERVICES:-"nginx php8.3-fpm mysql"}
STATE=/var/lib/logen/alert-state   # for flap suppression
mkdir -p "$(dirname "$STATE")"; touch "$STATE"
ALERTS=()

# Disk space (the most common silent killer)
while read -r pct mnt; do
  [ "$pct" -ge "$DISK_WARN" ] && ALERTS+=("disk ${mnt} at ${pct}% (warn ${DISK_WARN}%)")
done < <(df -P -x tmpfs -x devtmpfs | awk 'NR>1{gsub(/%/,"",$5);print $5" "$6}')

# Services down
for svc in $SERVICES; do
  systemctl is-active --quiet "$svc" || ALERTS+=("service ${svc} is DOWN")
done

# Load per core
read -r L1 _ < /proc/loadavg
awk -v l="$L1" -v t="$(nproc)" -v p="$LOAD_PER_CORE_WARN" 'BEGIN{exit !(l > t*p)}' \
  && ALERTS+=("load ${L1} exceeds $(nproc)x${LOAD_PER_CORE_WARN}")

# Error spike in last 5 min
ESPIKE=$(journalctl --since "5 min ago" -p err --no-pager 2>/dev/null | wc -l)
[ "$ESPIKE" -gt 50 ] && ALERTS+=("error spike: ${ESPIKE} err lines in 5 min")

if [ "${#ALERTS[@]}" -gt 0 ]; then
  MSG=$(printf '%s\n' "${ALERTS[@]}")
  # de-dup: only alert if state changed since last run
  if ! cmp -s <(printf '%s' "$MSG") "$STATE"; then
    printf '%s' "$MSG" > "$STATE"
    printf '%s\n' "$MSG" | /usr/local/bin/ecc-alert.sh warn "ALERT $(hostname -f)"
  fi
else
  : > "$STATE"   # clear state -> next breach re-alerts (recovery)
fi
```

## Proactive Alerting Concept

`ecc-alert.sh` is a thin dispatcher: it never decides *what* is wrong (the watcher does), only *where to send it*. It fans out to whichever channels are configured, degrading gracefully (always log to disk even if email/webhook fail). This keeps alerting **idempotent** (Prinsip 4) and auditable (Prinsip 7).

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-alert.sh <level> <subject> — reads body from stdin, fans out
set -uo pipefail
LEVEL="${1:-info}"; SUBJECT="${2:-LOGEN alert}"; BODY="$(cat)"
. /etc/logen/alert.conf 2>/dev/null || true   # ALERT_EMAIL, ALERT_WEBHOOK

TS=$(date -Is)
# 1) Always persist to the local logger (never lost)
printf '%s [%s] %s\n%s\n' "$TS" "$LEVEL" "$SUBJECT" "$BODY" \
  >> /var/log/logen/alerts.log
logger -t logen -p "daemon.${LEVEL}" "$SUBJECT"

# 2) Email channel (best effort)
if [ -n "${ALERT_EMAIL:-}" ] && command -v mail >/dev/null; then
  printf '%s\n' "$BODY" | mail -s "[LOGEN][$LEVEL] $SUBJECT" "$ALERT_EMAIL" || true
fi

# 3) Webhook channel (Slack/Discord/generic; best effort)
if [ -n "${ALERT_WEBHOOK:-}" ]; then
  # JSON-escape so quotes/newlines/control chars in $BODY can't produce invalid JSON
  if command -v jq >/dev/null; then
    payload=$(jq -n --arg t "*[LOGEN][$LEVEL]* $SUBJECT" --arg b "$BODY" '{text: ($t + "\n" + $b)}')
  else
    esc=$(printf '%s' "$BODY" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN{ORS="\\n"}{print}')
    payload=$(printf '{"text":"*[LOGEN][%s]* %s\\n%s"}' "$LEVEL" "$SUBJECT" "$esc")
  fi
  curl -sS -m 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK" >/dev/null || true
fi
```

Escalation tiers map cleanly to severity: `info`/`digest` -> logger only; `warn` -> logger + email/webhook; `crit` (service down, disk full) -> all channels, no flap suppression. Thresholds and channel config live in `/etc/logen/` and are mirrored into the Server Profile so the agent recalls each host's baseline.

## Related

- `ops-log-management` — where the errors this skill counts actually live.
- `ops-performance` — when a threshold breach is sustained, profile the bottleneck.
- `ops-ssl` — owns certificate issuance/renewal; monitoring only watches expiry.
- `ops-backup` — owns backup runs; monitoring only watches freshness.
- `ops-incident-response` — consumes `crit` alerts as incident triggers.
