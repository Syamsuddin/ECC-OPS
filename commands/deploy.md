---
description: Deploy an application to a server with stack detection, pre-deploy DB backup, health verification, and automatic rollback on failure.
---

# /deploy

Deploy a target app/branch/commit safely. Delegates to the **deploy-operator** subagent,
which follows the **ops-deploy** skill. Deploy is WRITE-tier: impact preview + single
confirmation + rollback ready.

Usage: `/deploy [app] [branch-or-tag-or-commit]`

## Steps

1. **Validate (READ)** — Load the Server Profile; resolve app, repo, method, and service.
   Detect the stack (Principle 1). Run the Pre-Deploy Checklist: disk headroom, `.env`
   present, working tree fast-forwardable, health baseline. Record the rollback point
   (PREV_COMMIT / current symlink / image tag) and announce it.

2. **Execute adaptively (WRITE — confirm)** — Show impact preview (from→to commit,
   pending migrations, service restart, expected downtime, rollback command) and get a
   single confirmation. Take the pre-deploy DB backup, then run the matching method:
   git-pull+restart, symlink zero-downtime, or container compose. Prefer `fetch` +
   `merge --ff-only`; never `git reset --hard` over untracked WIP (Principle 9).

3. **Verify (READ)** — Run the Post-Deploy Checklist: health 200, service active, live
   commit/tag matches target, error log clean since deploy time, migrations at expected version.

4. **Report & auto-rollback** — If verification fails, AUTO-ROLLBACK to the recorded
   point and re-verify; declare the deploy reverted and surface the DB backup path if a
   migration ran (restore is DESTRUCTIVE — double-confirm). On success, report old→new
   commit, migrations, health result, log path (`/var/log/<app>/deploy.log`), and the
   rollback command. Record the change to the audit trail (Principle 7).
