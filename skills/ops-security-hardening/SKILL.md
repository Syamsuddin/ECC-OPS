---
name: ops-security-hardening
description: Apply layered host hardening across SSH, PHP, Nginx, database, filesystem, and kernel/network, plus automatic security updates.
version: 1.0
---

# ops-security-hardening

Defense-in-depth (Principle 5) made concrete. No single control is trusted; each
layer is hardened so a breach of one does not cascade. Audit each layer
read-first, then apply fixes under the WRITE tier with a rollback copy of every
config touched.

## When to Use
- After provisioning, before a server is exposed to traffic.
- Periodic hardening review (quarterly, or after any incident).
- When `/security-audit` flags a layer below baseline.
- Before passing a compliance/security gate.

## Layer 1 — SSH
SSH is the primary remote-access door; harden it first. Edit in a drop-in file
(`/etc/ssh/sshd_config.d/99-hardening.conf`) so package upgrades don't clobber it.

| Setting                        | Secure value        | Why                                    |
|--------------------------------|---------------------|----------------------------------------|
| `PermitRootLogin`              | `no`                | Force named users + sudo (audit trail) |
| `PasswordAuthentication`       | `no`                | Keys only — defeats brute force        |
| `PubkeyAuthentication`         | `yes`               | Key-based auth                         |
| `KbdInteractiveAuthentication` | `no`                | Close the PAM password path            |
| `PermitEmptyPasswords`         | `no`                | Never allow blank passwords            |
| `MaxAuthTries`                 | `3`                 | Limit guesses per connection           |
| `LoginGraceTime`               | `20`                | Drop idle pre-auth sessions fast       |
| `X11Forwarding`                | `no`                | Reduce attack surface                  |
| `AllowAgentForwarding`         | `no`                | Prevent agent hijack on shared hosts   |
| `ClientAliveInterval`          | `300`               | Reap dead/idle sessions                |
| `ClientAliveCountMax`          | `2`                 | Disconnect after ~10 min idle          |
| `AllowUsers`                   | `deploy admin`      | Allowlist who may log in               |
| `Protocol`                     | `2`                 | SSHv2 only (implicit on modern OpenSSH)|

Modern crypto (OpenSSH 9.x):
```ini
# /etc/ssh/sshd_config.d/99-hardening.conf
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,sntrup761x25519-sha512@openssh.com
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
HostKeyAlgorithms ssh-ed25519,rsa-sha2-512,rsa-sha2-256
```
Validate before reloading — a bad config can lock you out:
```bash
sudo sshd -t && sudo systemctl reload ssh   # 'sshd' on RHEL-family
# Keep your current session open; test login in a NEW terminal before closing.
```

## Layer 2 — PHP Hardening
Apply in `/etc/php/8.3/fpm/conf.d/99-hardening.ini` (path varies by version).

```ini
; Hide PHP version from headers
expose_php = Off

; Disable high-risk functions (tune to app needs; test after applying)
disable_functions = exec,passthru,shell_exec,system,proc_open,popen,curl_multi_exec,parse_ini_file,show_source,pcntl_exec,dl

; Confine filesystem access to app + temp only
open_basedir = /var/www/app:/var/lib/php/sessions:/tmp

; Block remote file inclusion / SSRF-via-include
allow_url_fopen = Off
allow_url_include = Off

; Error handling — log, never display to users in production
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log

; Secure session cookies
session.cookie_httponly = 1
session.cookie_secure   = 1
session.cookie_samesite = Lax
session.use_strict_mode = 1

; Limits to blunt abuse
file_uploads = On
upload_max_filesize = 16M
max_execution_time = 30
```
```bash
sudo systemctl reload php8.3-fpm
php -i | grep -E 'expose_php|allow_url_fopen|open_basedir'   # verify
```

## Layer 3 — Nginx Hardening
```nginx
# /etc/nginx/conf.d/hardening.conf  (http context)

# Hide version banner
server_tokens off;

# Security headers (apply site-wide)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" always;
```
```nginx
# Inside each server { } — block common exploit/probe paths
location ~ /\.(?!well-known).* { deny all; access_log off; log_not_found off; }   # dotfiles: .env .git etc.
location ~* \.(env|ini|log|sh|sql|bak|swp|conf)$ { deny all; }                    # sensitive extensions
location ~* /(wp-login\.php|xmlrpc\.php) { deny all; }                            # WordPress probes (if not WP)
location ~* /(phpmyadmin|pma|adminer|\.git|\.svn) { deny all; }                   # admin tool probes
location = /readme.html { deny all; }
```
```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://example.com | grep -iE 'strict-transport|content-security|x-frame|server'
```

## Layer 4 — Database Hardening (summary)
Bind to `127.0.0.1`, drop anonymous/test users, enforce least-privilege grants,
require TLS for any non-local link. Full procedures live in `ops-database`.
```bash
ss -tlnp | grep -E ':(3306|5432)'   # MUST show 127.0.0.1, never 0.0.0.0
```

## Layer 5 — Filesystem Permissions
Least privilege per path. The web/runtime user owns app files; the user should
**not** be able to write its own code (Principle 9: server mirrors source).

| Path                         | Owner:Group        | Mode  | Notes                          |
|------------------------------|--------------------|-------|--------------------------------|
| `/var/www/app` (code)        | `deploy:www-data`  | `755` | Dirs 755, files 644            |
| App writable (storage/cache) | `www-data:www-data`| `775` | Only these dirs are writable   |
| `.env` / secrets             | `deploy:www-data`  | `640` | Never world-readable           |
| `/etc/ssl/private/*`         | `root:root`        | `600` | Private keys, root-only        |
| `~/.ssh/authorized_keys`     | `<user>:<user>`    | `600` | `~/.ssh` dir `700`             |
| `/etc/nginx`, `/etc/php`     | `root:root`        | `644` | Config dirs `755`              |

**CRITICAL: never `chmod 777`.** World-writable means any local process — or a
compromised app — can overwrite the file. Use correct ownership + group perms
instead.

Hunt dangerous permissions:
```bash
# World-writable files (excluding sticky-bit dirs like /tmp)
sudo find / -xdev -type f -perm -0002 ! -path '/proc/*' 2>/dev/null

# World-writable directories without the sticky bit
sudo find / -xdev -type d -perm -0002 ! -perm -1000 2>/dev/null

# Unexpected SUID/SGID binaries — baseline and watch for new entries
sudo find / -xdev \( -perm -4000 -o -perm -2000 \) -type f 2>/dev/null
```

## Layer 6 — Kernel / Network (sysctl)
```ini
# /etc/sysctl.d/99-hardening.conf

# SYN flood mitigation
net.ipv4.tcp_syncookies = 1

# Anti-spoofing: reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects (prevent MITM route injection)
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Drop source-routed packets
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Log martian (spoofed) packets
net.ipv4.conf.all.log_martians = 1

# ASLR — randomize memory layout
kernel.randomize_va_space = 2

# Symlink/hardlink protections (defeat /tmp races)
fs.protected_symlinks = 1
fs.protected_hardlinks = 1

# Restrict kernel pointer/dmesg leakage
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
```
```bash
sudo sysctl --system          # apply
sudo sysctl net.ipv4.tcp_syncookies kernel.randomize_va_space   # verify
```

## Layer 7 — Automatic Security Updates
Debian/Ubuntu:
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# Restrict to security pocket in /etc/apt/apt.conf.d/50unattended-upgrades:
#   "${distro_id}:${distro_codename}-security";
sudo unattended-upgrade --dry-run -d    # test
```
RHEL-family:
```bash
sudo dnf install -y dnf-automatic
sudo sed -i 's/^apply_updates = no/apply_updates = yes/' /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
```
> See `ops-update-patch` for staged updates of packages that warrant a reboot
> or a rollback plan.

## Quick Audit Script
Read-only snapshot of the hardening posture (run before applying any fix):
```bash
#!/usr/bin/env bash
# ops-hardening-audit.sh — READ ONLY
set -u
line(){ printf '\n=== %s ===\n' "$1"; }

line "SSH"
sudo sshd -T 2>/dev/null | grep -Ei 'permitrootlogin|passwordauthentication|maxauthtries|permitemptypasswords'

line "PHP"
php -i 2>/dev/null | grep -Ei 'expose_php|allow_url_fopen|open_basedir' || echo 'php cli not found'

line "Nginx"
nginx -V 2>&1 | head -1; grep -R 'server_tokens' /etc/nginx 2>/dev/null

line "DB/cache exposure (should be 127.0.0.1 only)"
sudo ss -tlnp | grep -E ':(3306|5432|6379|27017)' || echo 'none listening'

line "World-writable files (top 20)"
sudo find / -xdev -type f -perm -0002 ! -path '/proc/*' 2>/dev/null | head -20

line "sysctl"
sysctl net.ipv4.tcp_syncookies kernel.randomize_va_space fs.protected_symlinks 2>/dev/null

line "Auto-updates"
systemctl is-enabled unattended-upgrades 2>/dev/null || systemctl is-enabled dnf-automatic.timer 2>/dev/null || echo 'not enabled'
```

## Related
- `ops-firewall` — network layer that precedes host hardening.
- `ops-intrusion-detection` — active detection on top of hardening.
- `ops-database` — full DB hardening procedures.
- `ops-server-core` — base SSH/user setup this layer tightens.
- `ops-update-patch` — staged updates and reboot-safe patching.
- `ops-ssl` — TLS that backs HSTS and secure cookies.
