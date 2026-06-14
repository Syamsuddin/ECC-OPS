---
name: ops-dns
description: Manage DNS records (A/AAAA/CNAME/MX/TXT/CAA/PTR), verify propagation, and satisfy DNS prerequisites before issuing SSL certificates.
version: 1.0
---

# DNS Operations

## When to Use
- Pointing a domain (apex + www) at a server before serving traffic or issuing SSL.
- Verifying that DNS changes have propagated globally.
- Setting up mail-related records (MX, SPF/TXT, reverse DNS/PTR).
- Restricting which CAs may issue certs for a domain (CAA).
- Planning a low-risk migration with TTL strategy.

DNS itself is usually managed at the registrar/provider (READ from the server,
WRITE at the provider). The agent verifies records and advises; it does not assume
API access unless configured.

## Record Types — Reference

| Type | Purpose | Example value | Notes |
|------|---------|---------------|-------|
| **A** | Hostname → IPv4 | `203.0.113.10` | Required before HTTP-01 SSL issuance |
| **AAAA** | Hostname → IPv6 | `2001:db8::10` | Add only if server has working IPv6 |
| **CNAME** | Alias → another name | `www → example.com.` | Never on the apex/root; not alongside other records |
| **MX** | Mail exchanger | `10 mail.example.com.` | Lower priority number = preferred |
| **TXT** | Arbitrary text | `v=spf1 ...` / ACME tokens | SPF, DKIM, DMARC, DNS-01 challenge |
| **CAA** | Authorize CAs | `0 issue "letsencrypt.org"` | Restricts who can issue certs |
| **PTR** | IP → hostname (reverse) | `10.113.0.203.in-addr.arpa` | Set at IP/hosting provider, not domain zone |

## Recommended Setup — Apex + www

Two common patterns:

```text
# Pattern A: both as A records (simplest, works on every provider)
example.com.      A      203.0.113.10
www.example.com.  A      203.0.113.10

# Pattern B: apex A + www as CNAME (single source of truth for IP)
example.com.      A      203.0.113.10
www.example.com.  CNAME  example.com.
```

The web server then handles the canonical redirect (see ops-webserver: `www -> apex`
or vice versa via `return 301`).

## Verify Propagation

```bash
# A / AAAA records
dig +short A   example.com
dig +short AAAA example.com
dig +short www.example.com

# Query a specific public resolver (bypass local cache)
dig +short A example.com @1.1.1.1
dig +short A example.com @8.8.8.8

# Authoritative answer + TTL
dig example.com A +noall +answer
dig example.com NS +short            # which nameservers are authoritative

# Alternatives
host example.com
nslookup example.com 1.1.1.1
```

A record is "propagated" for SSL purposes once the public resolver used by the CA
returns the server's IP. Local `/etc/hosts` overrides do NOT count.

## Prerequisite Before Issuing SSL (Principle 2)

```bash
# The hostname being secured MUST resolve to THIS server's public IP.
THIS_IP=$(curl -s https://ifconfig.me)
RESOLVED=$(dig +short A example.com @1.1.1.1 | tail -n1)
echo "server=$THIS_IP  dns=$RESOLVED"
[ "$THIS_IP" = "$RESOLVED" ] && echo "OK: ready for HTTP-01" || echo "MISMATCH: fix A record first"
```

If they differ, HTTP-01/TLS-ALPN issuance will fail. Either fix the A record and
wait for TTL, or use DNS-01 (works without an A record — see ops-ssl wildcard).

## CAA — Restrict Certificate Authorities

```text
example.com.  CAA  0 issue "letsencrypt.org"
example.com.  CAA  0 issuewild "letsencrypt.org"      # wildcard issuance
example.com.  CAA  0 iodef "mailto:security@example.com"
```

```bash
dig +short CAA example.com    # verify
```

Without a CAA record any CA may issue; adding one is defense-in-depth (Principle 5).
Ensure the CA you use (e.g. `letsencrypt.org`) is listed, or issuance will be refused.

## Mail: SPF / DKIM / DMARC / Reverse DNS

```text
example.com.        TXT  "v=spf1 ip4:203.0.113.10 -all"
_dmarc.example.com. TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
sel._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=MIGf..."   # from mail server
```

Reverse DNS (PTR) must match the sending hostname or mail will be flagged as spam:
```bash
dig +short -x 203.0.113.10        # should return mail.example.com.
```
Set the PTR at the hosting/IP provider (it controls the reverse zone), not in the
domain's forward zone.

## TTL Strategy for Migration

1. **Before** the change: lower TTL on the affected records to 300s (5 min) and wait
   for the OLD TTL to elapse so caches expire quickly.
2. **Cut over**: update the A/AAAA to the new IP. Clients pick it up within ~5 min.
3. **After** verifying stability: raise TTL back to 3600s+ to reduce query load.

```bash
# Watch the change take effect
watch -n 30 'dig +short A example.com @1.1.1.1'
```

Keep both old and new servers serving during the cutover window so no requests drop.

## Related
- [ops-ssl](../ops-ssl/SKILL.md) — needs A record (HTTP-01) or DNS access (DNS-01).
- [ops-webserver](../ops-webserver/SKILL.md) — serves the names resolved here; canonical redirects.
- [ops-discovery](../ops-discovery/SKILL.md) — records domains/IPs into the Server Profile.
- [ops-security-hardening](../ops-security-hardening/SKILL.md) — CAA, SPF/DMARC as layered defense.
