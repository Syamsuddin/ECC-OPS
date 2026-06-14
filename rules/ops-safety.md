# Rule: ops-safety

Protect production servers from irreversible damage. These checks are mandatory and apply BEFORE any command runs. The hook `ops-safety-check.js` enforces a hard block; you must additionally refuse and escalate per this rule.

## Destructive commands — ALWAYS require explicit confirmation
Treat the following as DESTRUCTIVE (double-confirm + verified backup) unless run read-only:

| Pattern | Why it is dangerous |
|---|---|
| `rm -rf`, `find ... -delete`, `shred`, `truncate -s 0` | Irreversible file loss |
| `DROP {DATABASE,TABLE}`, `TRUNCATE`, `DELETE` without `WHERE` | Irreversible data loss |
| `systemctl stop\|disable\|mask` on a live service | Outage / lost auto-start |
| `ufw disable`, `iptables -F`, `iptables --flush`, `nft flush ruleset` | Server fully exposed |
| `git reset --hard`, `git clean -fd` on the server | Destroys deploy state (violates Principle 9) |
| `mkfs.*`, `dd of=/dev/...`, `parted`, `wipefs` | Disk destruction |
| `chown -R` / `chmod -R` on system paths (`/`, `/etc`, `/var`) | Mass permission corruption |
| `kill -9 1`, `reboot`, `shutdown`, `init 0` | Forced downtime |

NEVER auto-run these. Show impact, confirm a backup exists, then require the confirmation token (see ops-change-management).

## Backup-before-write
Before any WRITE/DESTRUCTIVE action against config, code, or data:
- Config files: copy to `<file>.bak.$(date +%F-%H%M%S)` before editing.
- Database: take a dump (mysqldump / pg_dump) before migration, DDL, or bulk DML.
- Code/deploy: record current commit hash + keep previous release dir for rollback.
- If a backup cannot be produced, STOP and report — do not proceed.

## Credential safety
- NEVER print secrets, private keys, or `.env` contents to stdout/logs.
- NEVER commit credentials to VCS. NEVER pass passwords as plain CLI args (use env/stdin/`--login-path`).
- Mask secrets in any displayed output (`****`).

## Database safety
- NEVER use the DB root/superuser as the application account.
- NEVER `GRANT ALL ... ON *.*` or to `'<user>'@'%'`; grant least privilege on the specific schema and host.
- NEVER bind the DB to `0.0.0.0` or open its port (3306/5432) to the public; bind to `127.0.0.1` or a private network only.
- NEVER write dumps into a web-served directory (webroot/public); store under a non-public, root-owned path with mode 600 (LOGEN default: `/var/backups/logen/<app>/`).

## File permission safety
- NEVER `chmod 777` on anything. World-writable is always wrong.
- Apply the standard permission matrix:

| Target | Owner | Mode |
|---|---|---|
| Web code (read-only at runtime) | `deploy:www-data` | dirs `755`, files `644` |
| App writable (cache/uploads/logs) | `www-data:www-data` | `775` (or `2775` setgid) |
| `.env` / secrets files | `deploy:www-data` | `640` |
| TLS private keys | `root:root` | `600` |
| SSH `authorized_keys` | `user:user` | file `600`, dir `.ssh` `700` |
| systemd unit files | `root:root` | `644` |
