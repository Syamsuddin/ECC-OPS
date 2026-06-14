# Rule: ops-change-management

Implements Principle 7 (auditable) and Principle 8 (confirm-before-harm). Classify EVERY action into a tier and follow its requirements.

## Tiers
| Tier | Examples | Requirement |
|---|---|---|
| READ | info, status, logs, health, audit, list | Auto-run, no confirmation. Must stay read-only. |
| WRITE | deploy, restart service, edit config, install package, DB migration, change firewall rule | Single confirmation + show impact + prepared rollback plan + audit entry. |
| DESTRUCTIVE | `DROP`/`TRUNCATE`, `rm -rf`, format disk, `ufw disable`, delete user, restore over production data | Double-confirm with typed token + verified backup + audit entry. |

The hook `ops-confirm-gate.js` enforces this: READ passes, WRITE emits a rollback reminder, DESTRUCTIVE is blocked (exit 2) until a matching `LOGEN_CONFIRM` token is provided.

## Rollback plan (mandatory for WRITE and DESTRUCTIVE)
Before executing, state the exact rollback command(s):
- Config: restore `<file>.bak.<ts>` then reload+verify.
- Service: revert unit/state to previous and restart.
- Deploy: re-point symlink to previous release / `git checkout <prev-hash>` + redeploy.
- DB: restore from the pre-change dump.
No rollback plan → no execution.

## Audit entry (mandatory for every WRITE/DESTRUCTIVE)
Append one JSONL record (see ECC_OPS.md Section XVII) capturing who/what/when/why + rollback command. Written by `ops-audit-log.js`, with provenance (actor/reason/pre_state_ref/rollback_cmd) read from `~/.logen/op-context.json`.

## Confirmation format
WRITE — present a single confirmation block:
```
ACTION: restart nginx
IMPACT: ~1s reload; active connections drained
ROLLBACK: cp /etc/nginx/nginx.conf.bak.<ts> /etc/nginx/nginx.conf && nginx -t && systemctl reload nginx
Proceed? (yes/no)
```
DESTRUCTIVE — require the user to TYPE a confirmation token, never a plain "yes":
```
DESTRUCTIVE: DROP DATABASE app_prod
BACKUP: /var/backups/logen/app_prod-2026-06-14-0312.sql.gz (verified, 184 MB)
ROLLBACK: gunzip -c <backup> | mysql app_prod
To proceed, type exactly:  CONFIRM DROP app_prod
```

## Dry-run
When a tool supports it, run dry-run first and show the diff/plan (`--dry-run`, `nginx -t`, `certbot --dry-run`, `rsync -n`, migration `--pretend`) before the real WRITE. (Full pre-action rehearsal via `ops-shadow` arrives in a later build phase.)
