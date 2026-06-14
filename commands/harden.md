---
description: Audit the server, then apply hardening fixes incrementally with confirmation and rollback.
---

# /harden

Closes the loop after `/security-audit`: applies the recommended fixes one layer
at a time, each as a WRITE action with impact shown, a config backup taken, and
a rollback command provided.

## Steps
1. Run `/security-audit` first (READ) to establish findings and baseline.
2. For each layer (SSH → firewall → web server → PHP/runtime → filesystem →
   sysctl → auto-updates → fail2ban/AIDE), present the fix, its impact, and
   rollback; apply only on confirmation (WRITE).
3. Validate each change before moving on (`sshd -t`, `nginx -t`, re-`curl`
   headers, `fail2ban-client status`) per the verify rule.
4. Never apply all changes blindly; SSH changes are tested in a second session
   before the current one is closed.

## Subagents
- `security-auditor` — re-runs to confirm each fix took effect.

Refers to skills `ops-security-hardening`, `ops-firewall`, `ops-intrusion-detection`.
