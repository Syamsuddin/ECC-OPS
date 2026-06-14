---
description: Run a read-only, full-stack security audit and report findings by severity with exact fixes.
---

# /security-audit

Read-only assessment of every defense layer. Changes nothing; produces a
severity-ranked report (CRITICAL/HIGH/MEDIUM/LOW) plus a PASSED list, each with
exact remediation commands.

## Steps
1. Invoke `security-auditor` to inspect SSH, firewall/ports, web server, runtime,
   DB, filesystem permissions, IDS, SSL, updates, and backups (all READ).
2. Classify each finding by severity; cite evidence.
3. Output the boxed audit report; record a summary in the Server Profile audit
   field (Principle 6).

## Subagents
- `security-auditor` (primary).

Refers to skills `ops-firewall`, `ops-security-hardening`, `ops-intrusion-detection`.
