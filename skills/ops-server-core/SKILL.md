---
name: ops-server-core
description: Provision a blank server into a secure, production-ready baseline — OS update, non-root deploy user, SSH hardening, timezone/locale, swap, essential packages, hardened systemd units, and standard directory layout, adapting to the detected OS family and init system.
version: 1.0
---

# ops-server-core

Baseline provisioning for a fresh host: bring a bare server to a secure, repeatable,
production-ready state without assuming any particular stack. Every step is idempotent
(Principle 4) and read-first (Principle 2): detect, plan, confirm, then write.

## When to Use

- First contact with a newly provisioned/bare server.
- Re-baselining an inconsistent host (drift in SSH config, missing swap, wrong timezone).
- Standardizing directory layout, deploy user, or systemd units across a fleet.
- Before any deploy, DB, or web server work — this skill establishes the foundation.

## 1. Stack & Platform Detection (read-first)

Never assume the platform. Detect before acting.

```bash
# --- OS family + version ---
. /etc/os-release 2>/dev/null
echo "ID=$ID ID_LIKE=${ID_LIKE:-} VERSION_ID=$VERSION_ID PRETTY=$PRETTY_NAME"
# ID: debian|ubuntu|rhel|centos|rocky|almalinux|fedora|amzn|opensuse-*|arch ...

# --- Architecture ---
uname -m            # x86_64 | aarch64 | armv7l ...

# --- Package manager ---
for pm in apt-get dnf yum zypper pacman apk; do
  command -v "$pm" >/dev/null 2>&1 && echo "pkg-manager: $pm"
done

# --- Init system ---
if [ -d /run/systemd/system ]; then echo "init: systemd"
elif command -v rc-service >/dev/null 2>&1; then echo "init: openrc"
else echo "init: $(ps -p 1 -o comm=)"; fi

# --- Active services (systemd) ---
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'

# --- Detect runtimes (do not assume) ---
for r in php node python3 go java ruby; do
  command -v "$r" >/dev/null 2>&1 && printf "%s: %s\n" "$r" "$($r --version 2>&1 | head -n1)"
done

# --- Detect web server ---
for w in nginx apache2 httpd caddy; do
  command -v "$w" >/dev/null 2>&1 && echo "webserver: $w"
done

# --- Detect database / cache ---
for d in mysqld mariadbd postgres redis-server; do
  pgrep -x "$d" >/dev/null 2>&1 && echo "db/cache running: $d"
done
```

Map `$ID` / `$ID_LIKE` to a family so later commands branch correctly:

| Detected `ID` / `ID_LIKE`        | Family   | Package manager | Web user      |
|----------------------------------|----------|-----------------|---------------|
| debian, ubuntu                   | debian   | apt-get         | www-data      |
| rhel, centos, rocky, almalinux   | rhel     | dnf (yum)       | nginx/apache  |
| fedora                           | rhel     | dnf             | nginx/apache  |
| amzn (Amazon Linux 2/2023)       | rhel     | dnf (yum)       | nginx/apache  |
| opensuse-*, sles                 | suse     | zypper          | nginx/wwwrun  |
| arch                             | arch     | pacman          | http          |

## 2. Provisioning Checklist

| Step | Action                                  | Tier        | Idempotent guard |
|------|-----------------------------------------|-------------|------------------|
| 1    | System update & upgrade                 | WRITE       | safe to repeat   |
| 2    | Create non-root deploy user + SSH key   | WRITE       | check `id deploy`|
| 3    | SSH hardening (sshd_config)             | WRITE       | backup + test    |
| 4    | Timezone & locale                       | WRITE       | check current    |
| 5    | Swap (if RAM < 4 GB) + swappiness       | WRITE       | check swapon     |
| 6    | Essential packages                      | WRITE       | pm is idempotent |
| 7    | Standard directory layout               | WRITE       | `mkdir -p`       |
| 8    | systemd unit template (per app, later)  | WRITE       | per-service      |

### 2.1 System Update (per OS family)

| Family | Refresh index            | Upgrade                          | Autoremove                |
|--------|--------------------------|----------------------------------|---------------------------|
| debian | `apt-get update`         | `apt-get -y dist-upgrade`        | `apt-get -y autoremove`   |
| rhel   | `dnf -y makecache`       | `dnf -y upgrade`                 | `dnf -y autoremove`       |
| suse   | `zypper refresh`         | `zypper -n update`               | `zypper -n rm --clean-deps`|
| arch   | `pacman -Sy`             | `pacman -Syu --noconfirm`        | `pacman -Rns $(pacman -Qtdq)` |

```bash
# Debian/Ubuntu — non-interactive, no prompt
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get -y dist-upgrade && apt-get -y autoremove
```

### 2.2 Non-root Deploy User + SSH Key

```bash
DEPLOY_USER="deploy"

# Idempotent: only create if missing
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

# Grant sudo via the correct group per family
if getent group sudo  >/dev/null; then usermod -aG sudo  "$DEPLOY_USER"; fi   # debian
if getent group wheel >/dev/null; then usermod -aG wheel "$DEPLOY_USER"; fi   # rhel/arch/suse

# Install authorized public key (NEVER generate private keys on the server)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
PUBKEY="ssh-ed25519 AAAA... operator@workstation"   # provided by operator
KEYFILE="/home/$DEPLOY_USER/.ssh/authorized_keys"
grep -qxF "$PUBKEY" "$KEYFILE" 2>/dev/null || echo "$PUBKEY" >> "$KEYFILE"
chmod 600 "$KEYFILE"; chown "$DEPLOY_USER:$DEPLOY_USER" "$KEYFILE"

# Optional passwordless sudo for automation (operator decision)
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
visudo -cf "/etc/sudoers.d/90-$DEPLOY_USER"   # validate before trusting
```

### 2.3 SSH Hardening (CRITICAL lock-out safety)

> CRITICAL: A bad sshd config can lock you out permanently. ALWAYS back up the
> original, validate with `sshd -t`, reload (do NOT restart the live session),
> then open a BRAND-NEW SSH session and confirm login succeeds BEFORE closing
> the existing session. Keep the old session open as a lifeline.

```bash
# 1) Backup with rollback point (Principle 3)
cp -a /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%F-%H%M%S)"

# 2) Apply hardening via a drop-in (idempotent, survives package upgrades)
cat > /etc/ssh/sshd_config.d/00-logen-hardening.conf <<'EOF'
# LOGEN SSH hardening — modern OpenSSH
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
MaxSessions 4
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
# Modern crypto only (TLS-grade KEX/ciphers/MACs)
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,sntrup761x25519-sha512@openssh.com
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
# Restrict who may log in
AllowUsers deploy
EOF

# 3) VALIDATE syntax BEFORE reloading — never reload an invalid config
sshd -t || { echo "sshd config INVALID — aborting"; exit 1; }

# 4) Reload (keeps current sessions alive), then TEST in a new session
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo ">>> NOW: from your workstation open a NEW session:"
echo ">>>   ssh -i ~/.ssh/id_ed25519 deploy@<host>"
echo ">>> Only after that succeeds, close the old session."
echo ">>> Rollback if locked risk: restore the .bak file and 'systemctl reload sshd'."
```

### 2.4 Timezone & Locale

```bash
# Idempotent: read current first
timedatectl show -p Timezone --value
timedatectl set-timezone UTC          # prefer UTC on servers

# Locale (Debian)
apt-get install -y locales
sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen
localectl set-locale LANG=en_US.UTF-8
# RHEL: dnf install -y glibc-langpack-en && localectl set-locale LANG=en_US.UTF-8
```

### 2.5 Swap (only if RAM < 4 GB) + swappiness

```bash
RAM_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
if [ "$RAM_MB" -lt 4096 ] && ! swapon --show | grep -q .; then
  SWAP_GB=2; [ "$RAM_MB" -ge 2048 ] && SWAP_GB=4
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB*1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Tune for a server (favor RAM, keep cache hot) — idempotent via drop-in
cat > /etc/sysctl.d/60-logen-swap.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null
```

### 2.6 Essential Packages (per OS family)

| Family | Install command base                                                       |
|--------|----------------------------------------------------------------------------|
| debian | `apt-get install -y ca-certificates curl wget gnupg git unzip vim ufw fail2ban htop rsync jq net-tools chrony logrotate` |
| rhel   | `dnf install -y ca-certificates curl wget gnupg2 git unzip vim firewalld fail2ban htop rsync jq chrony logrotate` |
| suse   | `zypper -n in ca-certificates curl wget gpg2 git unzip vim firewalld fail2ban htop rsync jq chrony logrotate` |
| arch   | `pacman -S --noconfirm ca-certificates curl wget gnupg git unzip vim ufw fail2ban htop rsync jq chrony logrotate` |

```bash
# Ensure time sync is on (chrony) — drift breaks TLS, logs, fail2ban
systemctl enable --now chronyd 2>/dev/null || systemctl enable --now chrony
```

## 3. Hardened systemd Unit Template

Use for app services (Node/Python/Go/Java/PHP workers). Hardened by default
(Principle 5: defense-in-depth). Adjust `ReadWritePaths` to the minimum needed.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=myapp application service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/var/www/myapp/current
ExecStart=/usr/local/bin/myapp-run
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

# --- Security hardening ---
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
# Only these paths are writable under ProtectSystem=strict:
ReadWritePaths=/var/www/myapp/shared/storage /var/log/myapp

# --- Resource limits ---
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 3.1 systemd Management Commands

```bash
systemctl daemon-reload                 # after creating/editing a unit
systemctl enable --now myapp            # enable on boot + start now
systemctl status myapp --no-pager       # READ: current state
systemctl restart myapp                 # WRITE: confirm + verify after
journalctl -u myapp -n 100 --no-pager   # READ: recent logs
systemctl show myapp -p ActiveState -p SubState   # machine-readable verify
systemd-analyze security myapp          # audit hardening score
```

## 4. Standard Directory Layout

Consistent layout makes deploy, backup, and audit predictable across hosts.

| Path                          | Owner:Group     | Mode | Purpose                              |
|-------------------------------|-----------------|------|--------------------------------------|
| `/var/www`                    | root:root       | 755  | Web app roots (per-app subdir)       |
| `/var/www/<app>`              | deploy:deploy   | 755  | App base (releases/, shared/, current)|
| `/var/www/<app>/shared`       | deploy:deploy   | 750  | Persistent: .env, storage, uploads   |
| `/var/backups`                | root:root       | 700  | Local backup staging                 |
| `/var/log/<app>`              | deploy:deploy   | 750  | App-specific logs                    |
| `/usr/local/bin`             | root:root       | 755  | Deploy/ops scripts (`*-run`, hooks)  |
| `/etc/logen`                | root:root       | 750  | Agent-managed config/notes           |
| `/opt/<app>`                  | deploy:deploy   | 755  | Non-web services / binaries          |

```bash
APP="myapp"; DU="deploy"
install -d -m 755 -o root  -g root  /var/www
install -d -m 755 -o "$DU" -g "$DU" "/var/www/$APP" "/var/www/$APP/releases"
install -d -m 750 -o "$DU" -g "$DU" "/var/www/$APP/shared" "/var/log/$APP"
install -d -m 700 -o root  -g root  /var/backups
install -d -m 750 -o root  -g root  /etc/logen
```

> Principle 9: application code lives only under release dirs and changes only via
> deploy. Non-code config (.env, nginx, systemd) may be managed directly here.

## Related

- `ops-discovery` — detect & inventory before/after provisioning; fills Server Profile.
- `ops-firewall` — UFW/firewalld baseline after packages are installed.
- `ops-security-hardening` — deeper layered hardening beyond SSH baseline.
- `ops-webserver` / `ops-runtime-*` — install the stack on top of this baseline.
- `ops-monitoring` / `ops-backup` — close the loop once the host is provisioned.
