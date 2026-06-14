---
description: Interactive wizard that provisions a blank or drifted server to a secure production baseline, then runs a security audit.
---

# /server-setup

Guided, interactive provisioning of a server from bare to production-ready.

## What it does
1. **Discover** — invoke `ops-discovery` (read-only) to detect OS family, package
   manager, init system, existing stack, users, SSH state, swap, and firewall.
   Load or create the Server Profile.
2. **Interview** — confirm with the operator: deploy username, public SSH key,
   timezone, intended apps/domains, and whether passwordless sudo is wanted.
3. **Plan** — hand off to the `server-provisioner` subagent, which presents the full
   ordered plan (each step tagged READ/WRITE/DESTRUCTIVE with impact + rollback).
   Operator approves before any write.
4. **Execute** — `server-provisioner` applies steps one at a time with verification:
   system update, deploy user + SSH key, SSH hardening (with mandatory new-session
   login test before closing the old session), timezone/locale, swap if RAM < 4 GB,
   essential packages, and the standard directory layout.
5. **Validate & record** — post-provision health check, save/refresh the Server
   Profile, and append a changelog entry.
6. **Audit** — finish by invoking `/security-audit` to confirm the new baseline is
   hardened and to surface any remaining findings.

## Safety
- All destructive or lock-out-prone steps (SSH hardening) require single confirmation
  plus a verified new-session login before the old session is closed.
- Every write step prepares a rollback point (config `.bak`, removable user, fstab line).

## Related
- Subagent: `server-provisioner`
- Skills: `ops-server-core`, `ops-discovery`
- Follow-up commands: `/security-audit`, `/harden`, `/firewall`, `/profile`
