---
description: Issue and install a TLS certificate (Let's Encrypt/Certbot), wire it into the web server, enable auto-renewal, and apply TLS hardening with verification.
---

# /ssl-setup

Obtain and install HTTPS for a domain, then harden and verify it. This command applies
the **ops-ssl** skill. Issuing a cert and reloading the web server is a **WRITE**
operation — show impact and confirm before applying.

## Steps

1. **Preflight (READ).** Confirm the DNS prerequisite via ops-dns: the hostname(s)
   resolve to this server's public IP (HTTP-01) — or that DNS-provider credentials are
   available (DNS-01 / wildcard). Verify ports 80/443 are open (ops-firewall) and the
   web server is healthy.
2. **Detect & choose method.** Identify the web server (Nginx/Apache/Caddy). For
   Caddy, certificates are automatic — only verify. Otherwise choose plugin
   (`--nginx`/`--apache`), `webroot`, or `standalone`; use DNS-01 for wildcards.
3. **Backup (Principle 3).** Snapshot the existing server block/vhost before Certbot
   edits it, so the change is reversible.
4. **Issue (WRITE — confirm).** Run Certbot with the chosen method and all `-d` names.
   Show the exact command and its impact (config edit + reload) before executing.
5. **Auto-renewal.** Verify `certbot.timer`, run `certbot renew --dry-run`, and install
   the deploy hook that reloads the web server only on successful renewal.
6. **Harden.** Apply the TLS snippet (TLSv1.2/1.3, modern ciphers, OCSP stapling,
   session settings). Propose HSTS as a separate, explicit confirmation — start
   without `includeSubDomains`/`preload`.
7. **Verify (Principle 2).** `nginx -t && systemctl reload nginx`; `curl -sI` for a
   200 over HTTP/2; `openssl s_client` to confirm protocol/cipher and chain.
8. **Record.** Save certificate domains and expiry to the Server Profile, register the
   host with the expiry monitor (ops-monitoring), and log to the audit trail.

## Subagents & Skills
- Skill: **ops-ssl** (issuance, renewal, hardening); **ops-dns** (preflight); **ops-firewall** (ports).
- Subagent: **security-auditor** may follow up to score the resulting TLS posture.

## Output
The issued certificate's domains and expiry, renewal-test result, hardening summary,
and a verified "HTTPS live" confirmation.
