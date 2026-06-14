---
description: Audit and configure the host firewall (UFW or firewalld) with a default-deny posture.
---

# /firewall

Manage network-layer access control. Detects the firewall in use, reports the
current posture, and applies changes under the WRITE tier (rule edits) or
DESTRUCTIVE tier (`ufw disable`/reset).

## Steps
1. Detect: UFW vs. firewalld; read current rules and default policy (READ).
2. Reconcile listening ports (`ss -tlnp`) against allow rules; flag public DB/
   cache ports and any undocumented exposure.
3. Propose changes: default deny incoming / allow outgoing, SSH rate-limit
   (`limit 22`), allow 80/443 with comments, scope admin ports to known IPs.
4. **Confirm SSH is allowed before enabling** to avoid lockout.
5. Apply with a config backup (`/etc/ufw` copy) and show the resulting status.

## Subagents
- `security-auditor` — for the read-only exposure assessment in step 2.

Refers to skill `ops-firewall`.
