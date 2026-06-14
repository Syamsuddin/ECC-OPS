---
description: Guided, safe update of OS packages and runtimes with pre-update backup, reboot detection, and post-update health verification.
---

# /update

Performs a WRITE-tier, rollback-ready system update. Drives the `ops-update-patch` skill and
delegates backup/verification to the relevant operators. Never reboots automatically.

## Arguments

- `--security-only` — apply only security-tier updates (default for routine runs).
- `--full` — full dist-upgrade / `dnf upgrade` (use inside a maintenance window).
- `--runtime <name>@<version>` — perform a side-by-side runtime upgrade (e.g. `php@8.4`).
- `--dry-run` — Step 0 audit only; show what would change, make no modifications.

## Procedure

1. **Audit (READ).** Run `ops-update-patch` Step 0: refresh package lists, list upgradable
   packages, simulate the upgrade, and snapshot current versions to `/var/backups/logen`.
   Present the diff and impact summary to the operator.
2. **Confirm (WRITE gate).** Show: packages to change, whether a reboot is likely, affected
   services, and the rollback method. Require single confirmation (`/update --full` or a
   runtime bump escalates to an explicit double-confirm because backups are mandatory).
3. **Backup.** Invoke `backup-operator` to ensure a fresh backup exists before applying
   (mandatory for `--full` and `--runtime`).
4. **Apply.** Execute the chosen upgrade path via `ops-update-patch` Step 2 (or the
   side-by-side runtime procedure for `--runtime`).
5. **Reboot check.** Run Step 3; if a reboot is required, do NOT reboot — report it and
   offer to schedule within the maintenance window. Restart only stale-lib services if a
   targeted restart suffices.
6. **Verify (rule: ops-verify).** Run Step 4 health checks: `systemctl --failed`, per-app
   HTTP health from the Server Profile, runtime sanity. On failure, roll back (downgrade or
   restore) and re-verify.
7. **Record.** Write an audit entry (who/what/when/why + rollback ref) and update the
   Server Profile (OS/runtime versions, last-update timestamp).

## Subagents

- `backup-operator` — pre-update backup.
- `ops-troubleshooter` — invoked automatically if verification fails.

**Safety**: routine = `--security-only`; `--full` and `--runtime` require a maintenance
window and a confirmed fresh backup.
