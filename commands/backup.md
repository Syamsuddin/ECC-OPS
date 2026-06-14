---
description: Create a verified, encrypted, rotated backup of an app's databases and files.
---

# /backup

Trigger the `backup-operator` subagent to produce a trustworthy backup.

## Steps

1. **Resolve target** — read the Server Profile for `<app>`: which engine
   (MySQL/PostgreSQL/Redis), which file paths (uploads/state), backup config, and
   GPG recipient. If unknown, run discovery first (`ops-discovery`).
2. **Pre-flight (READ)** — confirm `/var/backups/<app>` exists with mode 700,
   check free disk, show when the last backup ran.
3. **Create (WRITE)** — run the engine-appropriate `ops-backup` script:
   - MySQL: `mysqldump --single-transaction | gzip [ | gpg AES256 ]`
   - PostgreSQL: `pg_dump -Fc`
   - Files: `tar -czf` of uploads/state only (code comes from deploy — Prinsip 9)
4. **Verify integrity** — `gunzip -t` / `pg_restore --list` / `tar -tzf`; abort and
   report if the artifact is corrupt or anomalously small.
5. **Rotate** — enforce daily(7)/weekly(4)/monthly(6) retention idempotently.
6. **Offsite (optional, WRITE)** — `rclone sync` to S3/B2 with `--immutable`.
7. **Record (Prinsip 7)** — log artifact path, size, checksum, and timestamp;
   update the Server Profile's "last backup" field.

Output: artifact path, size, verification result, offsite status.
