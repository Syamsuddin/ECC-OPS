---
description: Install proactive agentless monitoring (cron health checks, threshold watcher, alerting) on a server.
---

# /monitor

Stands up continuous monitoring. Installing scripts and cron is tier WRITE (confirm, then audit-log; rollback = remove the cron file and scripts).

## Steps

1. Detect/confirm monitored services, app URLs, and sensible thresholds (disk 85%, load per-core 1.5, SSL 14d, backup 26h) from the Server Profile.
2. Confirm intended changes and impact, then install: `ecc-health-check.sh`, `ecc-monitor-watch.sh`, `ecc-alert.sh`, `/etc/logen/health.conf` + `alert.conf`, and `/etc/cron.d/logen-monitoring` (5-min watcher + daily 07:00 digest).
3. Configure alert channels (logger always; email/webhook if provided).
4. Verify: run the watcher once by hand, confirm cron is registered, send a test `info` alert (Prinsip — ops-verify).
5. Record the install in the audit log and update the Server Profile (monitoring config).

Delegates to: **monitoring-sentinel**. Idempotent — re-running must not duplicate cron entries.
