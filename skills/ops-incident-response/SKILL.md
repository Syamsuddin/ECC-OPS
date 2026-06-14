---
name: ops-incident-response
description: Severity-ranked incident procedures for server compromise, data breach, and service outage — contain, assess, preserve evidence, remediate, and review.
version: 1.0
---

# ops-incident-response

The playbook for when prevention has failed or service is down. Every procedure
preserves evidence before remediation (Principle 7: auditable) and treats
destructive recovery steps under the DESTRUCTIVE tier (backup verified first).

## When to Use
- Signs of compromise: reverse shell, unknown process/port, defacement, webshell.
- Suspected data breach / exfiltration.
- Production outage (service down, site unreachable, cascading failure).
- Any alert from `ops-intrusion-detection` that crosses the escalation line.

## Severity & Response Time
| Sev | Definition                                              | Response time      | Examples                                  |
|-----|---------------------------------------------------------|--------------------|-------------------------------------------|
| P1  | Confirmed compromise OR full production outage          | Immediate (<15 min)| Root breach, ransomware, site down hard   |
| P2  | Partial outage or active high-risk attack in progress   | <1 hour            | One app down; ongoing brute force         |
| P3  | Degraded service or contained security issue            | <4 hours           | Slow responses; isolated probe banned     |
| P4  | Minor / informational                                   | Next business day  | Single failed login burst, expired LOW cert |

## Procedure — P1 Server Compromise
Follow in order. **Do not skip Preserve.**

### 1. Contain (without destroying evidence)
```bash
# Lock inbound to your admin IP only — DO NOT wipe rules or reboot yet
sudo ufw default deny incoming
sudo ufw allow from <ADMIN_IP> to any port 22 proto tcp comment 'incident admin'
# Reboot loses RAM/volatile evidence — avoid unless safety demands it.
# If active exfiltration: block egress to the attacker IP specifically.
sudo ufw deny out to <ATTACKER_IP>
```

### 2. Assess (scope the breach)
```bash
who -a; w                                  # live sessions / intruder logged in?
ps auxfww                                  # process tree — odd parents, miners
sudo ss -tunap                             # connections — C2 / reverse shell
sudo lsof -i -nP | grep -E '(sh|nc|python|perl)\b'   # shells with sockets
last -50; sudo lastb -20                   # successful / failed logins
sudo find / -xdev -mtime -2 -type f ! -path '/proc/*' 2>/dev/null   # changed files
sudo crontab -l; ls -la /etc/cron.* /var/spool/cron/* 2>/dev/null   # persistence
ls -la /etc/systemd/system /etc/init.d 2>/dev/null                  # rogue services
sudo find / -xdev -perm -4000 -type f 2>/dev/null                   # new SUID
# Lightweight rootkit / integrity check:
sudo aide --check 2>/dev/null; which chkrootkit rkhunter && sudo rkhunter --check --sk
```

### 3. Preserve Evidence (snapshot BEFORE remediation)
```bash
EVID=/var/tmp/incident-$(date +%Y%m%d-%H%M%S); sudo mkdir -p "$EVID"
{ date -u; hostname; uname -a; } | sudo tee "$EVID/meta.txt"
sudo ps auxfww          | sudo tee "$EVID/processes.txt"
sudo ss -tunap          | sudo tee "$EVID/connections.txt"
sudo lsof -nP           | sudo tee "$EVID/openfiles.txt"
sudo cp -a /var/log "$EVID/log-copy"                       # logs intact
sudo find / -xdev -mtime -2 -type f 2>/dev/null | sudo tee "$EVID/changed-files.txt"
# Copy suspicious binaries before killing their processes; capture /proc/<pid>/exe.
sudo tar czf "$EVID.tar.gz" -C "$(dirname "$EVID")" "$(basename "$EVID")"
# Move the archive OFF-HOST (a compromised host cannot be trusted to keep it):
scp "$EVID.tar.gz" evidence@vault:/incidents/
```

### 4. Remediate (after evidence is safe)
- Kill confirmed malicious processes (recorded first); remove persistence
  (cron, systemd units, authorized_keys, LD_PRELOAD).
- **Rotate ALL credentials the host could have touched** — treat every secret as
  burned:
```bash
# SSH: regenerate keys, replace authorized_keys with known-good only
# App: rotate .env secrets, API keys, DB passwords (see ops-secrets)
# DB: change all DB user passwords (see ops-database)
# TLS: reissue certs/private keys if key exposure is possible (see ops-ssl)
# Cloud/provider tokens, webhook secrets, mail creds, etc.
```
- **Rebuild when in doubt.** If root was compromised or a rootkit is suspected,
  do NOT trust the OS — rebuild from a known-good image and restore data from a
  **pre-incident, verified** backup (DESTRUCTIVE; confirm backup integrity first
  per `ops-backup`). A "cleaned" rooted box is never trustworthy.

### 5. Post-Incident Review
- Timeline from preserved logs; identify entry vector and dwell time.
- Close the vector (patch, config, credential hygiene) via `ops-security-hardening`.
- Add detection so it cannot recur silently (`ops-intrusion-detection`).
- Record who/what/when/why + remediation in the changelog (Principle 7).

## Procedure — P1 Service Outage (diagnostic decision tree)
Read-first triage, narrowing from network to app:
```
Site unreachable?
├─ DNS resolves?            dig +short example.com  ── No → fix DNS (ops-dns)
├─ Host reachable?          ping / curl -I https://example.com
│    └─ No (conn refused/timeout) → firewall? web server down?
│         sudo ufw status; sudo systemctl status nginx
├─ Web server up but 5xx?   curl -I https://example.com  (502/503/504)
│    ├─ 502/504 → upstream down → check app/runtime:
│    │     systemctl status php8.3-fpm | pm2 list | systemctl status <app>
│    │     sudo tail -50 /var/log/nginx/error.log
│    ├─ 503 → overload/maintenance → load + workers:
│    │     uptime; free -h; df -h           # CPU/RAM/disk exhausted?
│    └─ 500 → app error → app logs (ops-log-management)
├─ Resource exhaustion?     df -h (disk full?) ; free -h (OOM?) ; dmesg | tail
│    └─ OOM killer?  dmesg | grep -i 'killed process'  → restart + tune
└─ DB down?                 systemctl status mysql|postgresql ; check connections
```
Triage commands (all READ):
```bash
curl -so /dev/null -w '%{http_code} %{time_total}s\n' https://example.com
systemctl --failed                          # any failed units?
journalctl -p err --since "30 min ago"      # recent errors
df -h; free -h; uptime                       # resource snapshot
sudo ss -s                                   # socket summary (exhaustion?)
```
Restart of a failed service is a **WRITE** action — show impact, then:
`sudo systemctl restart <service>` and verify with `systemctl status` + a fresh
`curl`. If a recent deploy caused it, prefer rollback (see `ops-deploy`).

## Related
- `ops-intrusion-detection` — signals that trigger these procedures.
- `ops-security-hardening` — close the vector after review.
- `ops-secrets` — credential rotation during remediation.
- `ops-backup` — verified pre-incident backups for rebuild/restore.
- `ops-firewall` — containment and egress blocking.
- `ops-deploy` — rollback path for deploy-caused outages.
