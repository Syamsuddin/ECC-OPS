---
name: ops-intrusion-detection
description: Active intrusion detection via fail2ban, AIDE file integrity, and structured log monitoring for SSH attacks, web probes, and outbound anomalies.
version: 1.0
---

# ops-intrusion-detection

Hardening reduces the attack surface; detection tells you when someone is
probing or has gotten in. This layer adds automated banning (fail2ban),
file-integrity baselining (AIDE), and log-pattern hunting — the third ring of
defense-in-depth, focused on visibility and rapid response.

## When to Use
- Hardening a server after firewall + host hardening are in place.
- Recurring brute-force or probe traffic in logs.
- After an incident, to baseline integrity and watch for re-entry.
- Setting up proactive detection for `monitoring-sentinel` to consume.

## fail2ban
Install and configure via `jail.local` (never edit `jail.conf` — it is replaced
on upgrade).

```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
# Ban via firewall; never lock out your own admin IPs
ignoreip = 127.0.0.1/8 ::1 203.0.113.10
banaction = ufw            # use 'firewallcmd-rich-rules' on RHEL-family

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 2h

[nginx-http-auth]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log

[nginx-badbots]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/access.log
maxretry = 2

# Custom jail: ban probes for sensitive paths
[nginx-sensitive-probe]
enabled  = true
port     = http,https
filter   = nginx-sensitive-probe
logpath  = /var/log/nginx/access.log
maxretry = 1
bantime  = 24h
```

Custom filter for sensitive-path scanning (`.env`, `.git`, wp-login, phpmyadmin):
```ini
# /etc/fail2ban/filter.d/nginx-sensitive-probe.conf
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) [^"]*(/\.env|/\.git|/wp-login\.php|/xmlrpc\.php|/phpmyadmin|/pma|/adminer|/\.aws|/config\.php|/\.ssh)[^"]*" .*$
ignoreregex =
```

Operate and verify:
```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status                       # list active jails
sudo fail2ban-client status sshd                  # banned IPs for a jail
sudo fail2ban-client status nginx-sensitive-probe
# Test a filter against real logs before enabling its jail:
sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/nginx-sensitive-probe.conf
sudo fail2ban-client set sshd unbanip 203.0.113.99   # manual unban
```

## File Integrity — AIDE
Baseline the filesystem, then detect any unexpected change to binaries/configs.

```bash
# Install
sudo apt install -y aide aide-common      # Debian/Ubuntu
# sudo dnf install -y aide                 # RHEL-family

# Initialize the baseline DB (do this on a KNOWN-GOOD system)
sudo aideinit                              # Debian helper
# or: sudo aide --init
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# On-demand integrity check
sudo aide --check
```

Schedule a daily check with emailed diff:
```bash
# /etc/cron.d/aide-check
0 4 * * * root /usr/bin/aide --check | mail -s "AIDE report $(hostname)" root
```
> Store the AIDE DB offline/read-only where feasible — an attacker who can edit
> the baseline can hide their changes. After any **legitimate** change (deploy,
> patch), re-initialize the baseline.

## Log Monitoring Patterns
Read-only hunting queries. Feed recurring hits into fail2ban jails or alerts.

```bash
# --- Failed SSH logins (brute force) ---
sudo journalctl -u ssh --since "1 hour ago" | grep -i 'Failed password'
sudo grep -i 'authentication failure' /var/log/auth.log | awk '{print $NF}' | sort | uniq -c | sort -rn | head
# Successful logins from unexpected IPs:
sudo journalctl -u ssh | grep -i 'Accepted'

# --- Web injection / traversal probes in Nginx ---
sudo grep -E "(\.\./|/etc/passwd|union.*select|<script|base64_decode|/\.env|/\.git)" /var/log/nginx/access.log
# Top 404-generating scanners:
sudo awk '$9==404{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head

# --- Suspicious outbound / reverse shell ---
# Unexpected outbound connections (look for shells/web servers reaching out):
sudo ss -tnp state established | grep -vE ':(443|80|53|22)\b'
# Listeners that should not exist (potential backdoor/bind shell):
sudo ss -tlnp
# Shells/interpreters with active network sockets:
sudo lsof -i -nP | grep -E '(bash|sh|nc|ncat|python|perl)\b'

# --- Privilege use ---
sudo grep -i 'sudo:' /var/log/auth.log | grep -i 'COMMAND='     # who ran what as root
sudo journalctl _COMM=sudo --since today

# --- New SUID binaries vs. baseline ---
sudo find / -xdev -perm -4000 -type f 2>/dev/null | sort > /tmp/suid.now
diff /var/lib/ops/suid.baseline /tmp/suid.now    # baseline created during hardening
```

Indicators worth immediate escalation to `ops-incident-response`:
- A shell/interpreter holding an outbound connection (reverse shell).
- A new listening port owned by a non-service process (bind shell/backdoor).
- New SUID binary not from a package.
- AIDE reporting changes to `/bin`, `/usr/bin`, `/etc/ssh`, or cron paths.

## Related
- `ops-firewall` — fail2ban enforces bans through it.
- `ops-security-hardening` — reduces what detection has to watch.
- `ops-incident-response` — escalation path for confirmed intrusions.
- `ops-monitoring` — alerting pipeline for detection signals.
- `ops-log-management` — log locations and retention these queries rely on.
