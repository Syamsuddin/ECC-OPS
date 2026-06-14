---
description: Rehearse a planned change on a disposable twin and report the outcome with its fidelity tier, before anything touches production.
---

# /shadow

Pre-flight a WRITE/DESTRUCTIVE change and show evidence + fidelity.

## Modes
- **rehearse `<planned change>`** (default) — run the change through the highest tier
  available (T0/T1/T2), print the predicted/observed result, the fidelity tier, and a
  diff. READ (the twin is disposable; production is untouched).
- **apply** — guarded-apply a previously rehearsed-and-passed plan to production INSIDE
  containment; records `shadow_fidelity` to the audit trail. WRITE/DESTRUCTIVE per the
  underlying op's tier.

## Output contract
Every result states: tier (T0/T1/T2), `shadow_verified` (true only for T1/T2), what was
observed, and — if degraded — exactly what could NOT be verified.

## Safety
- T0 is advisory and labeled as such; it never authorizes an apply on its own.
- `apply` re-checks Profile freshness; if prod drifted since the rehearsal, it
  re-rehearses first.

## Related
- Skill: `ops-shadow` · Substrate: `ops-sandbox` · Gate: `ops-shadow-gate.js`
