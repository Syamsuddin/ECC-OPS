---
description: Roll back an application to its previous known-good commit (or release/image tag), restore the DB if a migration was applied, and verify health.
---

# /rollback

Revert an app to its last known-good state. Delegates to the **deploy-operator** subagent.
Rollback itself is WRITE-tier; restoring a DB over production data is DESTRUCTIVE
(double-confirm + verify backup exists).

Usage: `/rollback [app] [target-commit-or-tag]`  (defaults to the previous deploy point)

## Steps

1. **Identify target (READ)** — From the Server Profile / deploy log
   (`/var/log/<app>/deploy.log`), resolve the rollback target: the recorded PREV_COMMIT,
   the previous `releases/` directory, or the previous image tag. Confirm the matching
   pre-deploy DB backup exists and note its path. Show current→target diff.

2. **Execute (WRITE — confirm)** — Revert code to the target: `git reset --hard
   <PREV_COMMIT>` on the dedicated deploy checkout, OR re-point the `current` symlink to
   the previous release, OR `docker compose up -d` with the previous image tag. Rebuild
   and restart the service via the same adaptive logic as deploy.

3. **Restore DB if needed (DESTRUCTIVE — double-confirm)** — Only if the rolled-back
   release had applied a schema migration that the older code cannot read: restore from
   the pre-deploy backup (`mysql`/`pg_restore`). Require explicit double-confirmation and
   verify the backup file integrity before overwriting production data.

4. **Verify (READ)** — Health endpoint 200, service active, live commit/tag equals the
   rollback target, error log clean. Report the final state, what was restored, and record
   the rollback to the audit trail (Principle 7).
