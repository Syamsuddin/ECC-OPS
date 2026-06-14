---
description: Show, refresh, or edit the persistent Server Profile for a host by running read-only discovery.
---

# /profile

View and maintain the persistent Server Profile (`~/.logen/profiles/<host>.json`)
that gives the agent context about each managed host (Principle 6).

## Modes
- **show** (default) — print the current stored profile for the host: OS, resources,
  stack, apps/domains, firewall posture, SSL expiry, backup status, last audit.
- **refresh** — invoke the `ops-discovery` skill (read-only), diff the fresh findings
  against the stored profile, surface drift (new ports, version changes, near-expiry
  certs, missing backup), and update the profile in place. Operator-set notes are
  preserved.
- **edit** — update operator-owned fields (app repo URLs, deploy method, intended
  domains, monitoring intent) directly in the profile JSON.

## What it does
1. Resolve the target host (argument or current session host).
2. For `refresh`: run `ops-discovery`, map results to Server Profile fields, write the
   updated JSON, and append a changelog note (Principle 7).
3. For `show`/`edit`: read or modify the stored JSON without touching the server.

## Safety
- `show` and `refresh` are READ tier (discovery never modifies the host).
- `edit` only changes the control-side profile, never the server itself.

## Related
- Skill: `ops-discovery`
- Subagent: `server-provisioner` (consumes the profile during provisioning)
- Commands: `/server-setup`, `/health-check`, `/ops-doctor`
