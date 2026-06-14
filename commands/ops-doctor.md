---
description: Whole-system ops readiness check — verifies backups, SSL renewal, fail2ban, firewall, security updates, disk, and Server Profile freshness, returning a status checklist.
---

# /ops-doctor

A READ-tier, non-mutating health audit of every protective control. It does not fix
anything — it reports a checklist with PASS / WARN / FAIL status so the operator knows
exactly what to remediate. Safe to run anytime; ideal as a scheduled daily check.

## Procedure (all read-only)

1. **Backups.** Confirm backup cron/timer is enabled AND the latest artifact is fresh
   (< 24h) and non-empty.

   ```bash
   systemctl is-enabled ecc-backup.timer 2>/dev/null || crontab -l | grep -q ecc-backup
   find /var/backups/logen/db -name '*.sql.gz' -mtime -1 -size +1c | head -1
   ```

2. **SSL renewal.** Certbot timer active and no cert expiring within 21 days.

   ```bash
   systemctl is-active certbot.timer snap.certbot.renew.timer 2>/dev/null
   sudo certbot certificates 2>/dev/null | grep -E 'Domains|VALID'
   ```

3. **fail2ban.** Service active with at least the sshd jail enabled.

   ```bash
   systemctl is-active fail2ban && sudo fail2ban-client status | grep 'Jail list'
   ```

4. **Firewall.** UFW or firewalld active with a default-deny inbound posture.

   ```bash
   sudo ufw status verbose 2>/dev/null | head -3 || sudo firewall-cmd --state
   ```

5. **Security updates.** Unattended-upgrades / dnf-automatic timer enabled; count pending
   security updates.

   ```bash
   systemctl is-enabled apt-daily-upgrade.timer dnf-automatic.timer 2>/dev/null
   apt-get -s dist-upgrade 2>/dev/null | grep -c '^Inst.*security' || true
   ```

6. **Disk & inodes.** No filesystem above 85% capacity or inode usage.

   ```bash
   df -hP | awk 'NR>1 && $5+0>85 {print "WARN",$6,$5}'
   df -iP | awk 'NR>1 && $5+0>85 {print "WARN inodes",$6,$5}'
   ```

7. **Server Profile freshness.** Profile exists and was refreshed recently; flag drift
   (running OS/runtime versions differ from the recorded profile) and recommend `/profile`.

## Output

A status checklist, e.g.:

| Check | Status | Detail |
| --- | --- | --- |
| Backup cron active | PASS | ecc-backup.timer enabled |
| Backup freshness | PASS | latest db dump 4h old |
| SSL auto-renew | PASS | certbot.timer active; nearest expiry 58d |
| fail2ban | FAIL | service inactive — run `/harden` |
| Firewall | PASS | ufw active, default deny incoming |
| Security updates | WARN | 3 security updates pending — run `/update --security-only` |
| Disk capacity | WARN | / at 87% |
| Server Profile | WARN | profile 19d old — run `/profile` |

Each WARN/FAIL includes the remediation command. `/ops-doctor` performs only READ-tier
operations and never modifies the system.

## Subagents

- `monitoring-sentinel` — supplies resource/health signals for the disk and service checks.
- `security-auditor` — corroborates firewall, fail2ban, and update posture.
