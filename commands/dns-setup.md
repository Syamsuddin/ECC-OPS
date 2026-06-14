---
description: Configure and verify DNS records (apex + www, MX/TXT/CAA) and confirm propagation so a domain points at this server before serving or issuing SSL.
---

# /dns-setup

Set up and validate DNS for a domain so it correctly resolves to this server. This
command applies the **ops-dns** skill and is READ-first: it inspects and verifies
before recommending any provider-side change.

## Steps

1. **Gather context (READ).** Load the Server Profile for this host to get its public
   IP(s). Ask for the target domain if not supplied. Determine the desired pattern
   (apex+www as A/A, or apex A + www CNAME).
2. **Audit current records (READ).** Run `dig` for A/AAAA/CNAME/MX/TXT/CAA/NS against
   public resolvers (`@1.1.1.1`, `@8.8.8.8`) and show the current state vs. desired.
3. **Plan changes.** Present the exact records to create/modify at the DNS provider,
   including recommended TTLs. If a migration is involved, propose the TTL strategy
   (lower first, cut over, raise back). This is the WRITE proposal — confirm before
   the operator applies them at the provider (or before any configured provider API
   call runs).
4. **Verify propagation (READ).** Re-query until the public resolver returns this
   server's IP. Confirm the SSL prerequisite: `dig +short A <domain> @1.1.1.1` equals
   the server's public IP.
5. **Advise CAA & mail (optional).** Recommend a CAA record for the chosen CA and,
   for mail-sending hosts, SPF/DMARC plus a matching PTR at the IP provider.
6. **Record.** Update the Server Profile with the domain(s) and confirmed resolution,
   and log the change to the audit trail.

## Subagents & Skills
- Skill: **ops-dns** (records, propagation, prerequisites).
- Runs largely as direct READ checks; hands off to **/ssl-setup** once A records resolve.

## Output
A before/after record table, propagation confirmation, and a clear "ready for SSL"
or "blocked: fix A record" verdict.
