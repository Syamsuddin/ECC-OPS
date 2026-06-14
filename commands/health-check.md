---
description: Run a full read-only health snapshot of a server (resources, services, endpoints, SSL, backup, security).
---

# /health-check

On-demand, read-only (tier READ) health snapshot. Safe to run any time.

## Steps

1. Load the Server Profile for the target host (expected services, app URLs, thresholds).
2. Run `ecc-health-check.sh` (or its inline equivalent) covering: uptime/load, RAM/swap, disk, monitored services, application `_health` endpoints (HTTP code + response time), error-level journal lines in the last hour, SSL expiry, last backup age, and security posture (UFW, failed SSH, fail2ban bans).
3. Summarize as OK / WARN / CRIT per category; surface every WARN/CRIT first.
4. Update the Server Profile with the latest snapshot (resource baselines, SSL expiry, last-backup age).

Delegates to: **monitoring-sentinel** for the snapshot logic. No writes; nothing to roll back.
