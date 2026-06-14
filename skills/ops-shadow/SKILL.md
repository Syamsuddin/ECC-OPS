---
name: ops-shadow
description: Pre-action empirical verification. Rehearses a planned WRITE/DESTRUCTIVE change on a disposable twin (via ops-sandbox) across three fidelity tiers (T0 logic, T1 native validators, T2 ephemeral twin), then applies to production inside containment. Turns "rollback-ready" into "pre-verified". Only T1/T2 may set shadow_verified.
version: 1.0
---

# Shadow Execution

Verify a risky change with evidence BEFORE production is touched. The Server Profile is
the seed: it tells the twin which OS image, stack versions, config paths, and data
engine to reproduce.

## Fidelity tiers
- **T0 (logic)** — reason over the Profile + plan and PREDICT the outcome. Advisory
  only; NEVER sets `shadow_verified`. Catches reasoning-detectable errors (anti-patterns,
  `max_children` vs RAM math, logical contradictions).
- **T1 (native validators)** — run the tool's own dry-run/validate mode on the host or
  control node, no extra infra: `nginx -t`/`-T`, `apachectl configtest`, `sshd -t`,
  `named-checkconf`/`checkzone`, `visudo -c`, `systemd-analyze verify`, `ufw --dry-run`,
  `rsync -n`, `apt-get -s install`, `git apply --check`, `composer validate`. Postgres
  DDL is transactional (`BEGIN; …; ROLLBACK;`); MySQL DDL auto-commits — use a T2 clone.
- **T2 (ephemeral twin)** — ask `ops-sandbox` for a rehearsal sandbox and actually run
  the change, observing runtime (service comes up? migration succeeds? lock duration?
  endpoint responds?).

## Tier selection
Pick by `(operation tier) × (parity needed) × (available isolation from Profile) ×
(deadline)`. Config edits → T1 is enough. Migrations / service lifecycle → prefer T2.
Kernel changes → T2 microVM or report unverified. Emergencies (P1) may run T1 +
containment-only when there is no time for a full twin.

## The hard rule
`shadow_verified: true` is set ONLY by T1 or T2. Always report which tier ran. On
missing isolation, degrade to T1+T0 and state plainly that runtime behavior is
UNVERIFIED — then let the operator (or `ops-trust` policy) decide.

## Lifecycle
plan -> rehearse (ops-sandbox rehearsal) -> observe -> if pass: guarded-apply
(ops-sandbox containment) -> post-verify -> audit (record `shadow_fidelity`).
If the twin fails, fix the plan on the twin until green, then present evidence + diff.

## Boundaries
- A twin is necessary, not sufficient: it cannot replicate production load, data scale,
  or live traffic. Timing observations (lock time, p95) are INDICATIVE.
- Re-validate Profile freshness before guarded-apply: if prod drifted during the
  rehearsal window, re-rehearse (ties to Server Profile staleness semantics, Section IV).

## Related
- Substrate: `ops-sandbox`. Command: `/shadow`. Hook: `ops-shadow-gate.js`.
- Feeds: `ops-trust` (evidence), `ops-immunity` (antibody verification).
