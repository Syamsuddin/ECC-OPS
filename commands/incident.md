---
description: Guided incident response for suspected compromise, breach, or outage.
---

# /incident

Drives a disciplined incident response: Contain → Assess → Preserve → Remediate
→ Review. Preserves evidence before any remediation and treats rebuild/restore
as DESTRUCTIVE (verified backup required).

## Steps
1. Triage severity (P1–P4) and state the response clock.
2. Hand off to `incident-responder` to contain (isolate to admin IP, no reboot),
   then assess scope (sessions/processes/connections/changed files/persistence).
3. Preserve an evidence snapshot off-host BEFORE remediation (Principle 7).
4. Remediate: rotate all credentials; remove persistence; rebuild from known-good
   + verified pre-incident backup if compromise is confirmed.
5. Post-incident review: root cause, timeline, hardening, changelog entry.

## Subagents
- `incident-responder` (primary).

Refers to skills `ops-incident-response`, `ops-intrusion-detection`, `ops-security-hardening`, `ops-secrets`, `ops-backup`.
