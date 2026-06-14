---
description: Restore an app's database/files from a backup with diff preview and double-confirmation.
---

# /restore

Trigger the `backup-operator` subagent to restore data safely. Restore that
overwrites existing data is DESTRUCTIVE (Tier 3).

## Steps

1. **List backups (READ)** — enumerate `/var/backups/<app>/{daily,weekly,monthly}`
   and offsite, showing for each: filename, timestamp, size, encrypted?, verified?.
2. **Select & verify** — user picks an artifact; verify it BEFORE touching prod:
   `gunzip -t` / `pg_restore --list` / decrypt-test. Refuse a corrupt artifact.
3. **Safety backup first (mandatory)** — take a fresh, verified backup of the
   CURRENT state. If this fails, abort the restore (Prinsip 3).
4. **Show the diff** — present current-state vs backup-contents:

   | Metric            | Current (live)      | Backup (selected)   |
   | ----------------- | ------------------- | ------------------- |
   | Timestamp         | now                 | 2026-06-14 02:30    |
   | DB size           | 4.2 GB              | 3.9 GB              |
   | Rows (key tables) | users 18,402        | users 17,990        |
   | Last record       | 2026-06-14 09:11    | 2026-06-14 02:29    |

   **Explicitly warn**: all data written since the backup timestamp (here, ~6.5h)
   will be LOST.
5. **DOUBLE-CONFIRM (DESTRUCTIVE)** — require the operator to type the confirmation
   token (e.g. the app name + "RESTORE"). Anything else aborts.
6. **Execute** — decrypt if needed, then `mysql < dump` / `pg_restore --clean
   --if-exists`. For files, extract the tar into the shared path.
7. **Post-verify (Prinsip 7)** — run sanity queries (row counts, app health check),
   confirm the app reconnects, and record the restore in the audit trail with the
   source artifact and the safety-backup path for rollback.
