---
description: Systematically diagnose a server problem (down, slow, errors, or unexpected behavior) read-only and propose a fix.
---

# /troubleshoot

Read-only (tier READ) root-cause analysis. Proposes a fix; never applies one unattended.

## Steps

1. Classify the symptom: DOWN / SLOW / ERRORS / UNEXPECTED.
2. Read the Server Profile (expected stack, services, baselines) and the recent audit log (recent changes are prime suspects).
3. Follow the matching diagnostic branch, gathering evidence from multiple sources (journald, app logs, nginx error log, resource metrics) for the same time window.
4. Correlate timestamps across sources to name the single root cause.
5. Present a ranked diagnosis and a rollback-aware fix proposal (action, tier, blast radius, rollback) for confirmation.

Delegates to: **ops-troubleshooter**. Never restarts as a first action; reports everything inspected, including dead ends.
