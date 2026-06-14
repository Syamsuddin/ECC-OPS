---
name: ops-ssl
description: Issue, renew, and harden TLS/SSL certificates with Let's Encrypt/Certbot — including wildcard via DNS-01, auto-renewal hooks, and modern cipher/HSTS configuration.
version: 1.0
---

# TLS / SSL Operations (Let's Encrypt / Certbot)

## When to Use
- Issuing a certificate for a new domain (single, multi-SAN, or wildcard).
- Enabling and verifying automatic renewal.
- Hardening TLS (protocols, ciphers, OCSP stapling, HSTS).
- Monitoring certificate expiry proactively.
- Diagnosing TLS errors (expired, mixed content, redirect loop, OCSP).

Issuing/renewing a cert and reloading the web server is a WRITE operation: confirm
first. Always verify the DNS prerequisite (ops-dns) before HTTP-01 issuance.

## Install Certbot — per OS

```bash
# Debian/Ubuntu (snap is upstream-recommended; apt also works)
apt update && apt install -y certbot python3-certbot-nginx python3-certbot-apache

# RHEL/Rocky/Alma
dnf install -y epel-release
dnf install -y certbot python3-certbot-nginx python3-certbot-apache

# DNS-01 plugin example (Cloudflare) — for wildcard
apt install -y python3-certbot-dns-cloudflare
```

## Issue a Certificate

```bash
# Nginx plugin: edits the server block and reloads automatically
certbot --nginx -d example.com -d www.example.com \
        --redirect --agree-tos -m admin@example.com --no-eff-email

# Apache plugin
certbot --apache -d example.com -d www.example.com --redirect -m admin@example.com

# Webroot (no web-server plugin; app serves the challenge dir)
certbot certonly --webroot -w /var/www/letsencrypt \
        -d example.com -d www.example.com -m admin@example.com --agree-tos

# Standalone (Certbot binds :80 itself — stop the web server first)
systemctl stop nginx
certbot certonly --standalone -d example.com -m admin@example.com --agree-tos
systemctl start nginx
```

## Wildcard via DNS-01

Wildcards (`*.example.com`) require DNS-01; HTTP-01 cannot validate a wildcard.

```bash
# Cloudflare credentials file (dir 700, file 600) — create the dir first on a fresh host
install -d -m 700 /root/.secrets
install -m 600 /dev/null /root/.secrets/cloudflare.ini
printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" > /root/.secrets/cloudflare.ini

certbot certonly \
  --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d example.com -d '*.example.com' \
  -m admin@example.com --agree-tos --no-eff-email
```

Store the API token via ops-secrets; restrict the token to the single zone (Principle 5).

## Auto-Renewal + Deploy Hook

Certbot installs a systemd timer (`certbot.timer`) or cron job automatically. Verify
and add a deploy hook to reload services only when a cert actually renews.

```bash
systemctl list-timers certbot.timer          # confirm timer is active
certbot renew --dry-run                       # simulate renewal end-to-end

# Reload web server after any successful renewal (runs only on renew)
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
nginx -t && systemctl reload nginx
# systemctl reload apache2   # if Apache
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh
```

## TLS Hardening

Certbot drops `options-ssl-nginx.conf`; for explicit control use the snippet below.
Recommended Mozilla "intermediate" profile (broad compatibility, no legacy TLS).

```nginx
# /etc/nginx/snippets/tls-hardening.conf
ssl_protocols             TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;                       # TLS 1.3 picks; let client choose
ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

# Session resumption
ssl_session_cache    shared:SSL:10m;
ssl_session_timeout  1d;
ssl_session_tickets  off;

# OCSP stapling
ssl_stapling         on;
ssl_stapling_verify  on;
ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;
```

### HSTS — enable only after you are sure

```nginx
# Add AFTER confirming HTTPS works on every subdomain you'll include.
# preload is hard to reverse — add it last, deliberately.
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
# add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

HSTS forces HTTPS for `max-age`. If a subdomain still needs HTTP, or your cert lapses,
clients will be unable to connect. Start without `includeSubDomains`/`preload`, verify,
then expand. This is a deliberate, confirmed change.

## Monitor Expiry

```bash
# Local: days remaining for a live cert file
openssl x509 -enddate -noout -in /etc/letsencrypt/live/example.com/fullchain.pem

# Remote: check the served cert (catches misconfig, not just file age)
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -enddate
```

```bash
#!/usr/bin/env bash
# /usr/local/bin/ssl-expiry-check.sh — warn under 21 days (wire to ops-monitoring)
set -euo pipefail
THRESHOLD_DAYS=21
for host in "$@"; do
  end=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
        | openssl x509 -noout -enddate | cut -d= -f2)
  end_epoch=$(date -d "$end" +%s 2>/dev/null || date -jf '%b %e %T %Y %Z' "$end" +%s)
  days=$(( (end_epoch - $(date +%s)) / 86400 ))
  if [ "$days" -lt "$THRESHOLD_DAYS" ]; then
    echo "WARN  $host expires in ${days}d"
  else
    echo "OK    $host expires in ${days}d"
  fi
done
```

## Verify After Issuance (Principle 2)

```bash
nginx -t && systemctl reload nginx
curl -sI https://example.com | head -n1                 # expect HTTP/2 200
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | grep -E 'Protocol|Cipher'                            # expect TLSv1.3 / strong cipher
```

## Troubleshooting

| Symptom | Likely cause | Diagnose | Fix |
|---------|--------------|----------|-----|
| **Cert expired / NET::ERR_CERT_DATE_INVALID** | Renewal failed silently | `certbot renew --dry-run`; check `certbot.timer`; read `/var/log/letsencrypt/` | Fix renewal blocker (DNS/port 80), `certbot renew --force-renewal`, reload |
| **Mixed content** | Page loads `http://` assets over HTTPS | Browser console; grep templates for `http://` | Use protocol-relative or `https://`; set `X-Forwarded-Proto` so app builds HTTPS URLs |
| **Redirect loop (ERR_TOO_MANY_REDIRECTS)** | App+proxy both redirect, or proxy strips HTTPS | `curl -sIL`; check `X-Forwarded-Proto`; check app `force_https` | Pass `X-Forwarded-Proto $scheme`; redirect in one layer only |
| **OCSP stapling not working** | Missing `chain.pem`/resolver, or fetch failed | `openssl s_client -status -connect host:443 \| grep -A1 OCSP` | Set `ssl_trusted_certificate chain.pem` + `resolver`; reload |
| **HTTP-01 challenge fails** | A record wrong, port 80 closed, ACME path blocked | `dig +short A host`; `ss -ltnp \| grep :80`; UFW rule | Fix A record (ops-dns), open 80 (ops-firewall), keep `/.well-known/acme-challenge/` reachable |
| **SAN mismatch (cert for wrong name)** | Domain not in cert | `openssl s_client ... \| openssl x509 -noout -text \| grep DNS:` | Reissue with all `-d` names; ensure `server_name` matches |

## Related
- [ops-dns](../ops-dns/SKILL.md) — A record / DNS-01 prerequisite for issuance.
- [ops-webserver](../ops-webserver/SKILL.md) — where certs and TLS snippets are wired in.
- [ops-firewall](../ops-firewall/SKILL.md) — port 80/443 must be open for ACME and HTTPS.
- [ops-secrets](../ops-secrets/SKILL.md) — store DNS-provider API tokens for DNS-01.
- [ops-monitoring](../ops-monitoring/SKILL.md) — alert on approaching expiry.
- [ops-security-hardening](../ops-security-hardening/SKILL.md) — HSTS, cipher policy as layered defense.
