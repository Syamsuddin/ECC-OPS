---
name: ops-update-patch
description: Safely update OS packages, runtimes, and dependencies with pre-update backup, reboot detection, post-update health verification, and rollback readiness across Debian/Ubuntu (apt) and RHEL/Rocky/Alma (dnf).
version: 1.0
---

# OS, Package & Runtime Updates

Updates are a WRITE-tier operation (single confirmation + impact + rollback) and major
version jumps are effectively DESTRUCTIVE-adjacent (require a fresh backup first). Never
run blind updates on a production host. Always: audit (read-first) -> snapshot/backup ->
apply -> detect reboot-required -> verify services & app health -> record to audit trail.

## When to Use

- Routine security patching or scheduled OS/package updates.
- Upgrading a language runtime in place (e.g. PHP 8.3 -> 8.4, Node 20 -> 22).
- Configuring automatic security updates (unattended-upgrades / dnf-automatic).
- Planning and executing a maintenance window.

## Step 0 — Read-First Audit (always safe)

Inventory what would change *before* touching anything.

```bash
# Debian / Ubuntu
sudo apt-get update -qq
apt list --upgradable 2>/dev/null          # full list of upgradable packages
apt-get -s dist-upgrade                     # dry-run simulation, no changes

# Count security-only updates
apt-get -s dist-upgrade | grep -ci '^Inst.*security' || true

# RHEL / Rocky / Alma
sudo dnf check-update || true               # exit 100 = updates available
dnf updateinfo list security                # security advisories only
```

Capture the current state for rollback reference (Principle 3 — Rollback-ready):

```bash
# Snapshot installed package versions before the change
dpkg -l > "/var/backups/logen/pkglist-$(date +%F-%H%M).txt"   # apt
rpm -qa | sort > "/var/backups/logen/pkglist-$(date +%F-%H%M).txt"  # dnf

# Record currently held/pinned packages so we don't fight them
apt-mark showhold
```

## Step 1 — Backup Before Large Updates

Before a dist-upgrade, kernel update, or runtime major bump, ensure a fresh backup exists
(delegate to `ops-backup`). For DB-bearing hosts this is mandatory.

```bash
# Verify a recent backup exists (fresh < 24h); trigger one if stale.
LATEST=$(ls -t /var/backups/logen/db/*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ] || [ "$(find "$LATEST" -mtime +1 2>/dev/null)" ]; then
  echo "No fresh backup -> running pre-update backup"
  /usr/local/sbin/ecc-backup-now   # provided by ops-backup
fi
```

## Step 2 — Apply Updates

Prefer security-only patches for unattended/routine runs; full upgrade inside a window.

```bash
# Debian/Ubuntu — security + recommended only, non-interactive, keep existing configs
sudo DEBIAN_FRONTEND=noninteractive apt-get \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  dist-upgrade -y

sudo apt-get autoremove --purge -y
sudo apt-get clean
```

```bash
# RHEL/Rocky/Alma
sudo dnf upgrade --security -y     # security only
# or full: sudo dnf upgrade -y
sudo dnf autoremove -y
```

## Step 3 — Detect Reboot-Required

A kernel, glibc, systemd, or openssl update usually needs a reboot or a service restart.
Never auto-reboot a production box — surface it and let the operator schedule it.

```bash
# Debian/Ubuntu
if [ -f /var/run/reboot-required ]; then
  echo "REBOOT REQUIRED:"; cat /var/run/reboot-required.pkgs 2>/dev/null
fi

# RHEL/Rocky/Alma
sudo dnf needs-restarting -r; echo "exit=$?"   # exit 1 => reboot recommended
needs-restarting -s                            # services using stale libs

# Cross-distro: which running processes use deleted (upgraded) libs?
sudo lsof -nP 2>/dev/null | grep -i '(deleted)' | awk '{print $1,$2}' | sort -u
```

If only services hold stale libraries, restart them targeted (WRITE-tier) instead of a
full reboot:

```bash
sudo systemctl restart php8.3-fpm nginx   # example; only the affected units
```

## Step 4 — Verify (rule: ops-verify)

```bash
# All enabled units are active?
systemctl --failed --no-legend            # must be empty
systemctl is-system-running               # 'running' (or 'degraded' -> inspect)

# Per-app HTTP health (adapt to Server Profile app list)
curl -fsS -o /dev/null -w '%{http_code}\n' https://example.com/health

# Runtime sanity
php -v ; nginx -t ; node -v 2>/dev/null
```

If anything is degraded, roll back using the package snapshot from Step 0 (downgrade the
offending package) or restore from the Step 1 backup, then re-verify.

## Runtime Major Upgrade — PHP 8.3 -> 8.4 (side-by-side)

Never remove the old runtime until the new one is proven. Install side-by-side, switch the
Nginx upstream socket, verify, then retire the old version (Principle 4 — Idempotent,
Principle 3 — Rollback-ready).

```bash
# 1) Install 8.4 alongside 8.3 (Ondrej PPA on Ubuntu / Sury on Debian)
sudo add-apt-repository -y ppa:ondrej/php
sudo apt-get update -qq
sudo apt-get install -y php8.4-fpm php8.4-cli \
  php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-gd php8.4-bcmath

# 2) Recreate the app's FPM pool config for 8.4 (mirror the 8.3 pool)
sudo cp /etc/php/8.3/fpm/pool.d/app.conf /etc/php/8.4/fpm/pool.d/app.conf
# adjust the listen socket inside to /run/php/php8.4-fpm-app.sock
sudo systemctl enable --now php8.4-fpm
```

```bash
# 3) Validate the app under 8.4 BEFORE flipping traffic
sudo -u www-data php8.4 /var/www/app/artisan about     # Laravel example
php8.4 -m | grep -E 'opcache|mysqli'                   # required extensions present
```

```nginx
# 4) Point Nginx at the 8.4 socket (config change = WRITE; keep a copy of the old file)
location ~ \.php$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php8.4-fpm-app.sock;   # was php8.3-fpm-app.sock
}
```

```bash
# 5) Test + reload, then verify end-to-end
sudo nginx -t && sudo systemctl reload nginx
curl -fsS -o /dev/null -w '%{http_code}\n' https://example.com/
php -v   # confirm CLI default if you switched it: sudo update-alternatives --config php

# 6) ONLY after the app is stable for the agreed bake-in period: retire 8.3
sudo systemctl disable --now php8.3-fpm
sudo apt-get purge -y 'php8.3-*' && sudo apt-get autoremove --purge -y
```

Rollback (within bake-in): revert the Nginx `fastcgi_pass` to the 8.3 socket, `nginx -t`,
reload — 8.3 is still installed and running, so traffic returns instantly.

## Automatic Security Updates

Enable unattended security patching, but constrain it to *security* origins, exclude
risky packages, and never auto-reboot in business hours.

```bash
# Debian/Ubuntu
sudo apt-get install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades
```

```ini
# /etc/apt/apt.conf.d/50unattended-upgrades  (verify Allowed-Origins carefully)
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
    "mysql-server";
    "mariadb-server";
    "nginx";
    "php8.*";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Mail "ops@example.com";
Unattended-Upgrade::MailReport "on-change";
```

```ini
# /etc/apt/apt.conf.d/20auto-upgrades  (enable the timers)
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
```

Verify the configuration is actually effective (don't trust the file alone):

```bash
# Dry-run shows exactly which origins/packages would be acted on
sudo unattended-upgrades --dry-run --debug 2>&1 | grep -E 'Allowed origins|Packages that'
systemctl status apt-daily-upgrade.timer --no-pager   # timer enabled & next run
```

```bash
# RHEL/Rocky/Alma equivalent
sudo dnf install -y dnf-automatic
sudo sed -i 's/^upgrade_type.*/upgrade_type = security/' /etc/dnf/automatic.conf
sudo sed -i 's/^apply_updates.*/apply_updates = yes/'   /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
systemctl list-timers dnf-automatic.timer --no-pager
```

## Maintenance Window & Communication

| Phase | Action |
| --- | --- |
| T-24h | Announce window (channel/email/status page); confirm fresh backup planned |
| T-1h  | Run Step 0 audit; freeze deploys; verify rollback artifacts exist |
| T-0   | Enter window: backup -> apply -> reboot if required -> verify |
| T+0   | Smoke-test every app in Server Profile (HTTP health, login path, DB connectivity) |
| Post  | Close window, post status, write audit entry (who/what/when/why + rollback ref) |

Guidelines:
- Schedule low-traffic hours; keep the window short and reversible.
- One change-class per window where possible (kernel vs. runtime vs. DB) to isolate blame.
- Enable a maintenance page only for DESTRUCTIVE-adjacent work (DB major upgrade, reboot).
- Record start/end and outcome to the audit trail (Principle 7); update the Server Profile
  (OS/runtime versions, last-update timestamp).

## Related

- `ops-backup` — pre-update backup and restore-based rollback.
- `ops-server-core` — base packages, kernel, systemd, reboot handling.
- `ops-runtime-php` / `ops-runtime-node` / `ops-runtime-python` — runtime-specific upgrade detail.
- `ops-monitoring` — post-update health watch and regression alerting.
- `ops-incident-response` — escalation path if an update causes an outage (see Section XII).
