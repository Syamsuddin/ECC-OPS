---
name: ops-log-management
description: Log rotation, journald, log locations, and diagnostic queries across the stack.
version: 1.0
---

# Operations: Log Management

Logs are the system's memory. This skill keeps them **bounded** (rotation so they never fill the disk), **findable** (a map of where every component writes), and **queryable** (diagnostic one-liners that turn megabytes of noise into the three lines that matter).

## When to Use

- Configuring rotation for a newly deployed app so logs don't fill the disk.
- Hunting the root cause of an incident across multiple log sources (`/logs`, `/troubleshoot`).
- Auditing what is being logged and whether retention is sane.

## logrotate Config (per app)

Each app gets its own rotation policy. Rotate daily, keep 14 generations, compress (delayed by one cycle so the freshest archive stays readable), and reload the web server after rotation so it reopens file handles.

```ini
# /etc/logrotate.d/ecc-app-example
/var/www/example/storage/logs/*.log
/var/log/nginx/example.access.log
/var/log/nginx/example.error.log
{
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    dateext
    dateformat -%Y%m%d
    su www-data www-data
    create 0640 www-data adm
    sharedscripts
    postrotate
        # Reload nginx so it reopens log file handles (no dropped connections)
        [ -f /run/nginx.pid ] && nginx -s reopen 2>/dev/null || systemctl reload nginx >/dev/null 2>&1 || true
    endscript
}
```

> `copytruncate` is used for app logs whose process won't reopen handles on signal; for nginx, `nginx -s reopen` is the clean path and `copytruncate` is the safety net. Validate with `logrotate -d /etc/logrotate.d/ecc-app-example` (dry run, READ-only).

## Log Locations Map

| Component | Path | What to look for |
|---|---|---|
| Linux journal | `journalctl` (binary, journald) | Service crashes, OOM kills, unit failures |
| Auth / SSH | `/var/log/auth.log` (Deb), `/var/log/secure` (RHEL) | Failed logins, sudo use, intrusion attempts |
| Nginx access | `/var/log/nginx/*.access.log` | Traffic patterns, 4xx/5xx, slow upstreams |
| Nginx error | `/var/log/nginx/*.error.log` | 502/504 causes, upstream timeouts, config errors |
| PHP-FPM | `/var/log/php8.3-fpm.log` + pool `slowlog` | Worker exhaustion, slow requests, fatal errors |
| Laravel | `storage/logs/laravel.log` | App exceptions, stack traces |
| Node (systemd) | `journalctl -u <app>` | Uncaught exceptions, restart loops |
| Python/Gunicorn | `journalctl -u <app>` or app log | Worker timeouts, 500s, tracebacks |
| MySQL error | `/var/log/mysql/error.log` | Crashes, InnoDB issues, aborted connections |
| MySQL slow | `/var/log/mysql/slow.log` | Queries above `long_query_time` |
| PostgreSQL | `/var/log/postgresql/postgresql-16-main.log` | Slow queries, deadlocks, checkpoint spam |
| Kernel | `dmesg`, `journalctl -k` | OOM, disk/IO errors, hardware faults |
| Cron | `journalctl -u cron` / `/var/log/syslog` | Missed/failed scheduled jobs |
| fail2ban | `/var/log/fail2ban.log` | Bans, ignored hosts, jail activity |
| LOGEN audit | `/var/log/logen/audit.log` | Every change the agent made (who/what/when/why) |

## Diagnostic Queries

All read-only (tier READ). Start broad, then narrow.

```bash
# Correlate several units on one timeline (priority warning+) for the last 30 min
journalctl -u nginx -u php8.3-fpm -u mysql -p warning --since "30 min ago" --no-pager

# All error-level entries in the last hour, newest last
journalctl --since "1 hour ago" -p err --no-pager

# Top 10 client IPs hitting an app (spot abuse / a hammering bot)
awk '{print $1}' /var/log/nginx/example.access.log | sort | uniq -c | sort -rn | head

# Top 10 URLs returning 404 (broken links, missing assets, scanners)
awk '$9=="404"{print $7}' /var/log/nginx/example.access.log | sort | uniq -c | sort -rn | head

# Count responses by status code (quick error-rate read)
awk '{print $9}' /var/log/nginx/example.access.log | sort | uniq -c | sort -rn

# PHP-FPM slow requests (requires slowlog enabled in the pool)
grep -A20 'script_filename' /var/log/php8.3-fpm-slow.log | tail -60

# MySQL slow query summary, sorted by total time (most expensive first)
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log

# Follow a live tail of correlated errors during an incident
journalctl -u nginx -u php8.3-fpm -p err -f
```

## Related

- `ops-monitoring` — counts these errors and alerts on spikes.
- `ops-performance` — slowlog/slow-query output feeds tuning decisions.
- `ops-intrusion-detection` — consumes auth.log / fail2ban.log for attack analysis.
- `ops-incident-response` — uses these queries to build the incident timeline.
