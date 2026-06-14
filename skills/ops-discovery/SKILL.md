---
name: ops-discovery
description: Discover and inventory a server end-to-end (OS, resources, ports, services, runtimes, web server, databases, vhosts/apps, certificates, firewall, cron, backups) and map the findings into the persistent Server Profile; run on first contact and on a recurring schedule.
version: 1.0
---

# ops-discovery

Read-only reconnaissance (Principle 2) that builds and refreshes the persistent
**Server Profile** (Principle 6). Discovery never changes the host — it only reads,
so it is always auto-approved (READ tier). Its output is the single source of truth
that every other domain relies on (Principle 1: detect before adapting).

## When to Use

- First session with a host (before any provisioning or deploy decision).
- Start of every session — quick refresh to detect drift since last run.
- On a recurring schedule (e.g., daily) to keep the Server Profile current.
- After any major change (deploy, new app, firewall edit) to re-sync the profile.

## Full Discovery Script (read-only)

```bash
#!/usr/bin/env bash
# ops-discovery — emits JSON-ready facts. READ-ONLY: no state is modified.
set -uo pipefail

echo "=== IDENTITY & OS ==="
hostname -f 2>/dev/null || hostname
. /etc/os-release 2>/dev/null; echo "os=$PRETTY_NAME id=$ID version=$VERSION_ID"
uname -m; uname -r

echo "=== RESOURCES ==="
nproc                                            # cpu cores
awk '/MemTotal/{printf "ram_mb=%d\n",$2/1024}' /proc/meminfo
free -m | awk '/Swap/{printf "swap_mb=%d\n",$2}'
df -BG --output=target,size,used,avail / /var 2>/dev/null

echo "=== LISTENING PORTS ==="
ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null   # who listens where

echo "=== RUNNING SERVICES ==="
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'

echo "=== RUNTIMES + VERSIONS ==="
for r in php node python3 go java ruby; do
  command -v "$r" >/dev/null 2>&1 && printf "%s=%s\n" "$r" "$($r --version 2>&1 | head -n1)"
done
command -v docker >/dev/null 2>&1 && docker --version

echo "=== WEB SERVER + VERSION ==="
command -v nginx   >/dev/null 2>&1 && nginx -v 2>&1
command -v apache2 >/dev/null 2>&1 && apache2 -v 2>&1 | head -n1
command -v httpd   >/dev/null 2>&1 && httpd -v 2>&1 | head -n1
command -v caddy   >/dev/null 2>&1 && caddy version

echo "=== DATABASES + VERSION ==="
command -v mysql    >/dev/null 2>&1 && mysql --version
command -v psql     >/dev/null 2>&1 && psql --version
command -v redis-cli>/dev/null 2>&1 && redis-cli --version

echo "=== VHOSTS / APPS / DOMAINS ==="
ls -1 /etc/nginx/sites-enabled/ 2>/dev/null
grep -rhoE 'server_name[[:space:]]+[^;]+' /etc/nginx 2>/dev/null | awk '{$1="";print}' | tr -s ' '
grep -rhoE 'ServerName[[:space:]]+\S+' /etc/apache2 /etc/httpd 2>/dev/null
ls -1 /var/www 2>/dev/null

echo "=== TLS CERTIFICATES + EXPIRY ==="
command -v certbot >/dev/null 2>&1 && certbot certificates 2>/dev/null
for c in /etc/letsencrypt/live/*/fullchain.pem; do
  [ -f "$c" ] && echo "$c -> $(openssl x509 -enddate -noout -in "$c" | cut -d= -f2)"
done

echo "=== FIREWALL STATUS ==="
command -v ufw >/dev/null 2>&1 && ufw status verbose 2>/dev/null
command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --list-all 2>/dev/null

echo "=== CRON / SCHEDULED ==="
for u in root deploy; do crontab -l -u "$u" 2>/dev/null | sed "s/^/[$u] /"; done
ls -1 /etc/cron.d/ 2>/dev/null
systemctl list-timers --no-pager --no-legend 2>/dev/null | awk '{print $NF}'

echo "=== BACKUP STATUS ==="
ls -lt /var/backups 2>/dev/null | head -n 5
[ -f /etc/logen/backup.conf ] && cat /etc/logen/backup.conf
```

## Mapping Findings to the Server Profile

Discovery writes into the **canonical Server Profile schema defined in Section IV**, at
`~/.logen/profiles/<host>.json` on the control side. The example below is the
**discovery-populated subset** — it uses the **same keys and types as Section IV**
(see there for the full schema). Refresh fields in place; preserve operator-set notes.

```json
{
  "schema_version": "2.0",
  "host": { "id": "web01", "hostname": "web01.example.com" },
  "last_discovery": "2026-06-14T08:00:00Z",
  "os": { "distro": "Ubuntu", "version": "24.04", "package_manager": "apt", "arch": "x86_64", "kernel": "6.8.0", "init": "systemd" },
  "resources": { "cpu_cores": 4, "ram_mb": 8192, "swap_mb": 2048, "disks": [ { "mount": "/", "size_gb": 80, "used_pct": 26 } ] },
  "stack": {
    "web_server": { "name": "nginx", "version": "1.26.0" },
    "runtimes": [ { "name": "php", "version": "8.3.7", "fpm": true }, { "name": "node", "version": "20.12.2" } ],
    "databases": [ { "engine": "postgresql", "version": "16.3", "bind": "127.0.0.1:5432" } ],
    "cache": [ { "engine": "redis", "version": "7.2", "bind": "127.0.0.1:6379" } ],
    "containers": { "engine": "docker", "version": "26.1.0", "compose": true }
  },
  "apps": [
    { "name": "myapp", "domain": "app.example.com", "path": "/var/www/myapp",
      "repo": "git@github.com:org/myapp.git", "deploy_method": "git+symlink-zero-downtime",
      "service": "myapp.service" }
  ],
  "firewall": {
    "tool": "ufw", "default_incoming": "deny", "default_outgoing": "allow",
    "allowed": [
      { "port": 22, "proto": "tcp", "comment": "ssh" },
      { "port": 80, "proto": "tcp", "comment": "http" },
      { "port": 443, "proto": "tcp", "comment": "https" }
    ]
  },
  "ssl": [ { "domain": "app.example.com", "issuer": "Let's Encrypt", "type": "single", "expires_at": "2026-09-01T00:00:00Z", "auto_renew": true } ],
  "backup": { "configured": true, "last_run": { "at": "2026-06-14T03:00:00Z", "status": "ok" }, "destination": "s3://bkp/web01" },
  "monitoring": { "configured": true, "checks": ["disk", "http", "ssl-expiry"] },
  "audit": { "last_summary": "2026-06-13T12:00:00Z", "open_findings": 2, "hardening_score": 82, "changelog_ref": "~/.logen/audit/web01.jsonl" },
  "profile_health": "fresh"
}
```

Field-mapping reference:

| Discovery section        | Server Profile field            |
|--------------------------|---------------------------------|
| IDENTITY & OS            | `os.*`                          |
| RESOURCES                | `resources.*`                   |
| LISTENING PORTS          | `listening_ports[]`             |
| RUNTIMES / WEB / DB      | `stack.*`                       |
| VHOSTS / APPS / DOMAINS  | `apps[]` (name, domain, path)   |
| TLS CERTIFICATES         | `ssl[]` (domain, issuer, expires)|
| FIREWALL STATUS          | `firewall.*`                    |
| CRON / TIMERS, BACKUP    | `backup.*`, scheduled jobs      |

## Cadence

- **First session**: run full discovery, create the profile, flag gaps (no firewall,
  no backup, expiring certs) for the orchestrator to address.
- **Recurring**: run on each session start and on a daily timer; diff against the
  stored profile and surface drift (new ports, version changes, near-expiry certs).

## Related

- `ops-server-core` — acts on the gaps discovery reveals (baseline provisioning).
- `ops-monitoring` — turns discovered facts into ongoing proactive checks.
- `ops-ssl` — consumes discovered cert expiry to schedule renewals.
- `ops-firewall` — reconciles discovered open ports against intended policy.
