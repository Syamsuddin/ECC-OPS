---
name: ops-backup
description: Encrypted, rotated, verified backups of databases and files to /var/backups with offsite sync and tested restore procedures.
version: 1.0
---

# ops-backup — Backup, Encryption, Rotation & Restore

Knowledge base for creating trustworthy backups: encrypted at rest, rotated on a
daily/weekly/monthly schedule, replicated offsite, and — critically — verified by
test restore. An untested backup is not a backup (Prinsip 3: rollback-ready).

## When to Use

- Standing up scheduled backups for a database or application's files.
- Before any DESTRUCTIVE operation (migration, restore, server rebuild).
- Restoring data after loss, corruption, or a failed deploy.
- Auditing whether existing backups are recent, complete, and restorable.

> Creating/listing/verifying backups is READ/WRITE tier.
> **Restore that overwrites production is DESTRUCTIVE — double-confirm + prove a current backup exists first.**

---

## Layout & permissions

All backups live under `/var/backups/<app>` — never inside the webroot.

```bash
/var/backups/myapp/            # 700, owned by root
├── daily/                     # kept 7 days
├── weekly/                    # kept 4 weeks
├── monthly/                   # kept 6 months
└── files/
# Every backup file is mode 600. Encryption key lives in /root, never here.
```

```bash
install -d -m 700 -o root -g root /var/backups/myapp/{daily,weekly,monthly,files}
```

---

## MySQL / MariaDB backup script

`/usr/local/sbin/ecc-backup-mysql.sh`:

```bash
#!/usr/bin/env bash
# LOGEN MySQL/MariaDB backup: consistent dump, gzip, optional GPG, rotate, verify.
set -Eeuo pipefail

APP="myapp"
DB="myapp"
BACKUP_ROOT="/var/backups/${APP}"
TS="$(date +%F_%H%M%S)"
DOW="$(date +%u)"        # 1=Mon .. 7=Sun
DOM="$(date +%d)"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"          # if set, encrypt with AES256
MIN_SIZE_BYTES=$((50 * 1024))               # anomaly floor: dump must exceed this
# Credentials come from a 600 option file, NOT the command line (avoids ps/leak).
DEFAULTS_FILE="/root/.my.backup.cnf"        # [client] user=backup password=... 

umask 077
dest_dir="${BACKUP_ROOT}/daily"
out="${dest_dir}/${DB}_${TS}.sql.gz"

log() { logger -t ecc-backup "$*"; echo "[$(date +%T)] $*"; }
trap 'log "FAILED at line $LINENO"; exit 1' ERR

# 1. Dump consistently (single-transaction = no table locks for InnoDB) and compress.
mysqldump --defaults-extra-file="${DEFAULTS_FILE}" \
  --single-transaction --quick --routines --triggers --events \
  --set-gtid-purged=OFF --no-tablespaces "${DB}" \
  | gzip -9 > "${out}"

# 2. Anomaly check: a suspiciously small dump usually means a partial/failed backup.
size="$(stat -c%s "${out}")"
if (( size < MIN_SIZE_BYTES )); then
  log "ABORT: dump ${out} is only ${size} bytes (< ${MIN_SIZE_BYTES}); likely corrupt."
  rm -f "${out}"; exit 1
fi

# 3. Integrity check the gzip stream before trusting it.
gunzip -t "${out}"

# 4. Optional encryption at rest (AES256). Key/recipient managed via ops-secrets.
if [[ -n "${GPG_RECIPIENT}" ]]; then
  gpg --batch --yes --cipher-algo AES256 -r "${GPG_RECIPIENT}" \
      --output "${out}.gpg" --encrypt "${out}"
  shred -u "${out}"               # remove the plaintext copy
  out="${out}.gpg"
fi
chmod 600 "${out}"

# 5. Promote to weekly (Sun) and monthly (1st) tiers.
[[ "${DOW}" == "7" ]] && cp -a "${out}" "${BACKUP_ROOT}/weekly/"
[[ "${DOM}" == "01" ]] && cp -a "${out}" "${BACKUP_ROOT}/monthly/"

# 6. Rotate: keep 7 daily / 4 weekly / 6 monthly (idempotent — Prinsip 4).
find "${BACKUP_ROOT}/daily"   -type f -mtime +7   -delete
find "${BACKUP_ROOT}/weekly"  -type f -mtime +28  -delete
find "${BACKUP_ROOT}/monthly" -type f -mtime +186 -delete

log "OK: ${out} (${size} bytes)"
```

---

## PostgreSQL backup (custom format)

```bash
#!/usr/bin/env bash
# pg_dump custom format (-Fc): compressed, supports selective/parallel restore.
set -Eeuo pipefail
APP="myapp"; DB="myapp"
out="/var/backups/${APP}/daily/${DB}_$(date +%F_%H%M%S).dump"
umask 077

# .pgpass (mode 600) supplies the password; never put it on the command line.
PGPASSFILE=/root/.pgpass pg_dump -Fc -Z 6 -h 127.0.0.1 -U myapp_migrate "${DB}" -f "${out}"

# Verify the archive's table of contents is readable (proves a usable dump).
pg_restore --list "${out}" >/dev/null
chmod 600 "${out}"
```

---

## File backup (uploads / user data)

```bash
# Tar only the data that is NOT reproducible from VCS (Prinsip 9: server mirrors source).
# Application code is restored via deploy, so back up uploads/state, not the repo.
tar -czf "/var/backups/myapp/files/uploads_$(date +%F).tar.gz" \
    -C /var/www/myapp/shared storage/app/public uploads
chmod 600 /var/backups/myapp/files/uploads_*.tar.gz
```

---

## Offsite replication (rclone → S3 / Backblaze B2)

```bash
# rclone config stored under /root/.config/rclone (600). Encrypted files stay encrypted in transit & at rest.
rclone sync /var/backups/myapp remote:my-bucket/myapp \
  --transfers 4 --checksum --immutable \
  --log-file /var/log/ecc-backup-offsite.log
```

For ransomware resilience, enable object-lock / versioning on the bucket and use
an upload-only credential so a compromised host cannot delete offsite copies.

---

## Restore procedures

### MySQL (plain)

```bash
gunzip -t  myapp_2026-06-14.sql.gz          # verify first
gunzip -c  myapp_2026-06-14.sql.gz | mysql --defaults-extra-file=/root/.my.backup.cnf myapp
```

### MySQL (encrypted)

```bash
gpg --batch --quiet --decrypt myapp_2026-06-14.sql.gz.gpg \
  | gunzip -c | mysql --defaults-extra-file=/root/.my.backup.cnf myapp
```

### PostgreSQL (custom format)

```bash
pg_restore --list myapp_2026-06-14.dump      # verify TOC first
pg_restore -h 127.0.0.1 -U myapp_migrate -d myapp --clean --if-exists myapp_2026-06-14.dump
```

> Restore over a live production DB is DESTRUCTIVE. The `backup-operator` subagent
> takes a fresh safety backup, shows current-state vs backup-contents diff, warns
> about data written since the backup, and requires a double-confirm token.

---

## Integrity verification

| Backup type        | Verify command                          |
| ------------------ | --------------------------------------- |
| gzip (MySQL)       | `gunzip -t file.sql.gz`                 |
| GPG-encrypted      | `gpg --decrypt file.gpg | gunzip -t`    |
| PostgreSQL `-Fc`   | `pg_restore --list file.dump`           |
| tar.gz (files)     | `tar -tzf file.tar.gz >/dev/null`       |

The gold standard is a periodic **test restore** into a scratch database, then a
sanity query. A backup that has never been restored is unproven.

---

## Cron

`/etc/cron.d/ecc-backup-myapp`:

```bash
# m h dom mon dow user command
30 2 * * *  root  GPG_RECIPIENT=backup@myapp /usr/local/sbin/ecc-backup-mysql.sh
15 3 * * *  root  /usr/local/sbin/ecc-backup-offsite.sh
```

---

## Security Rules

These are non-negotiable (Prinsip 5 + Prinsip 7):

1. **Backups live ONLY in `/var/backups/<app>`** — NEVER inside the webroot
   (`/var/www`, `public/`). A SQL dump in a web-served directory leaks PII,
   email addresses, and password hashes to anyone who guesses the filename.
2. **Encryption keys live in `/root` (mode 600)**, separate from the backups
   themselves; the GPG private key is never copied to the same offsite bucket as
   the ciphertext.
3. **Never commit backups, dumps, key files, or `.pgpass`/`.my.cnf` to git.**
   Add `*.sql`, `*.sql.gz`, `*.dump`, `*.gpg` to `.gitignore` defensively.
4. **Directory 700, files 600, owner root.** Restrict who can read the data at rest.
5. **DB credentials for backups come from a 600 option file** (`~/.my.cnf`,
   `.pgpass`), never as command-line args (visible in `ps` / shell history).
6. **Offsite credentials are upload-only / object-locked** so a compromised host
   cannot wipe the last line of defense.

## Related

- `ops-database` — engines, users, and dumps that this skill backs up.
- `ops-secrets` — manage the GPG recipient/key and DB credentials used here.
- `ops-incident-response` — restore is a core step in recovery runbooks.
- `ops-monitoring` — alert when a backup is missing, stale, or shrinking.
- `ops-update-patch` — take a verified backup before risky upgrades.
