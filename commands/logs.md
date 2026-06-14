---
description: Locate, query, and correlate logs across the stack to investigate behavior or an incident.
---

# /logs

Read-only (tier READ) log investigation and correlation.

## Steps

1. Identify the relevant components and their log locations (use the `ops-log-management` location map).
2. Run targeted diagnostic queries: multi-unit `journalctl` on a shared timeline, error-level lines in the last hour, top client IPs, top 404s, status-code distribution, PHP-FPM slowlog, and MySQL `mysqldumpslow`.
3. Correlate findings across sources by timestamp to build a coherent timeline.
4. Summarize the signal (the lines that matter) and, if a fault is found, hand off to `/troubleshoot` or the incident flow.

Delegates to: **ops-troubleshooter** (for correlation during an active fault). Pure investigation; no writes.
