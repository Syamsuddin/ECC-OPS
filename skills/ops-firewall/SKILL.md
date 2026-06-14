---
name: ops-firewall
description: Configure and audit host firewalls (UFW, firewalld) with default-deny posture, port exposure control, and SSH tunneling for private services.
version: 1.0
---

# ops-firewall

Network-layer access control: the outermost ring of defense-in-depth. The rule
is simple — deny everything inbound by default, then explicitly allow only what
a documented service needs. Every other port stays invisible to the internet.

## When to Use
- Provisioning a new server (initial firewall posture before exposing services).
- Auditing which ports are actually listening vs. which are allowed.
- Exposing a new app port (80/443) or restricting admin ports.
- Investigating why a service is/isn't reachable.
- Incident response: emergency lockdown of inbound traffic.

> Tier: enabling/altering firewall rules is **WRITE** (show impact + rollback).
> `ufw disable` / flushing all rules is **DESTRUCTIVE** (double-confirm; never
> run over SSH without a fallback session or scheduled re-enable).

## Golden Rule: SSH Before Enable
Always allow the SSH port **before** enabling the firewall, or you lock yourself
out. Verify the active SSH port first (it may not be 22):

```bash
ss -tlnp | grep -i ssh
grep -E '^Port ' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
```

## UFW (Debian/Ubuntu)

### Baseline configuration
```bash
# 1. Set safe defaults: drop inbound, permit outbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 2. Allow SSH FIRST (adjust port if non-standard), with rate-limiting
sudo ufw limit 22/tcp comment 'SSH rate-limited (brute-force protection)'

# 3. Allow web traffic with descriptive comments
sudo ufw allow 80/tcp  comment 'HTTP (redirect to HTTPS)'
sudo ufw allow 443/tcp comment 'HTTPS'

# 4. Enable logging (records blocked/allowed per policy)
sudo ufw logging on        # default 'low'; use 'medium' when hunting

# 5. Enable the firewall (UFW will warn it may disrupt SSH — SSH is allowed above)
sudo ufw --force enable

# 6. Verify
sudo ufw status verbose
sudo ufw status numbered    # numbered = needed for targeted deletes
```

`limit` on SSH denies a source IP that makes 6+ connections within 30 seconds —
a cheap brute-force speed bump that complements fail2ban (see
`ops-intrusion-detection`).

### Restricting admin ports to a known source
Prefer source-scoped rules over public exposure for anything sensitive:
```bash
sudo ufw allow from 203.0.113.10 to any port 22 proto tcp comment 'SSH from office'
sudo ufw delete limit 22/tcp     # remove the broad limit rule once the scoped rule is in place
```

### Rollback
```bash
sudo cp -a /etc/ufw /etc/ufw.bak.$(date +%F-%H%M)   # before changes
sudo ufw status numbered                            # note rule numbers
sudo ufw delete <N>                                 # undo a specific rule
# Full revert if needed (DESTRUCTIVE — ensure an open SSH session exists):
sudo ufw reset
```

## Ports That MUST NOT Be Public
Databases, caches, and search/admin services must **never** listen on a public
interface or be allowed through the firewall. Bind them to `127.0.0.1` (or a
private VLAN) and reach them via SSH tunnel.

| Port  | Service                | Risk if exposed                          |
|-------|------------------------|------------------------------------------|
| 3306  | MySQL / MariaDB        | Full DB takeover, credential brute-force |
| 5432  | PostgreSQL             | Full DB takeover, data exfiltration      |
| 6379  | Redis                  | Unauth RCE (CONFIG/SLAVEOF), data theft  |
| 27017 | MongoDB                | Mass ransom of unauth instances          |
| 9200  | Elasticsearch          | Open index dump, RCE via scripting       |
| 11211 | Memcached              | Data leak + UDP amplification DDoS       |

Confirm they are bound locally, not exposed:
```bash
ss -tlnp | grep -E ':(3306|5432|6379|27017|9200|11211)\b'
# GOOD -> 127.0.0.1:3306   BAD -> 0.0.0.0:3306 or *:3306
```

### Solution: SSH tunnel (do not open the port)
Access a private DB/cache from your workstation by forwarding over SSH:
```bash
# Local 5433 -> remote PostgreSQL on 127.0.0.1:5432, via the server's SSH
ssh -N -L 5433:127.0.0.1:5432 deploy@server.example.com
#   then connect to localhost:5433 with your client

# MySQL example
ssh -N -L 3307:127.0.0.1:3306 deploy@server.example.com

# Redis example
ssh -N -L 6380:127.0.0.1:6379 deploy@server.example.com
```
The remote port is never reachable from the internet; the encrypted SSH session
is the only path in. No firewall `allow` rule is added.

## firewalld (CentOS / AlmaLinux / Rocky / RHEL)

```bash
# Inspect current state
sudo firewall-cmd --state
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all

# Persist services into the active zone (e.g., public)
sudo firewall-cmd --permanent --zone=public --add-service=ssh
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https

# Rate-limit SSH via a rich rule (4 conns/min per source)
sudo firewall-cmd --permanent --zone=public --add-rich-rule=\
'rule service name="ssh" limit value="4/m" accept'

# Scope SSH to a trusted source instead of the whole world
sudo firewall-cmd --permanent --zone=public --add-rich-rule=\
'rule family="ipv4" source address="203.0.113.10" service name="ssh" accept'

# Apply and verify
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

Logging denied packets:
```bash
sudo firewall-cmd --set-log-denied=unicast
sudo firewall-cmd --get-log-denied
```

## Port Audit: Listening vs. Allowed
The two views must agree. Anything **listening** that is not deliberately
**allowed** (and not bound to localhost) is an exposure to investigate.

```bash
# What is actually listening, with owning process
sudo ss -tlnp

# UFW: cross-check against firewall policy
sudo ufw status verbose

# firewalld: cross-check
sudo firewall-cmd --list-all

# Quick reconciliation: list public-facing listeners (not 127.0.0.1 / ::1)
sudo ss -tlnp | grep -vE '127\.0\.0\.1|\[::1\]'
```

Audit decision matrix:

| Listening on        | In allow rules? | Verdict                                  |
|---------------------|-----------------|------------------------------------------|
| 0.0.0.0 / public IP | Yes (intended)  | OK — documented public service           |
| 0.0.0.0 / public IP | No              | EXPOSED — bind to localhost or add deny  |
| 127.0.0.1 / ::1     | n/a             | OK — local only, not reachable           |
| DB/cache port       | Any             | FAIL — must be localhost + SSH tunnel    |

## Related
- `ops-security-hardening` — host hardening once the firewall is in place.
- `ops-intrusion-detection` — fail2ban consumes firewall to ban abusive IPs.
- `ops-database` — bind DB/cache to localhost (prevents public exposure).
- `ops-server-core` — SSH configuration referenced by the SSH allow rule.
