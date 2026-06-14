---
description: Inspect and adjust the calibrated autonomy ledger — review the agent's track record per operation class, approve proposed promotions, or force a demotion.
---

# /trust

Govern earned autonomy (`ops-trust`).

## Modes
- **show** (default) — print the `autonomy_ledger` for a host/op-class: counts, last
  failure, evidence split (prod vs rehearsal), current and proposed tier, required modes.
  READ.
- **approve `<op-class>`** — grant a PROPOSED promotion as a standing policy
  (meta-approval). WRITE; recorded to the audit trail.
- **demote `<op-class>`** — force an op-class back to a stricter tier. WRITE, instant.
- **explain `<op-class>`** — show the counterfactual reasoning and evidence behind the
  current recommendation. READ.

## Safety
- True DESTRUCTIVE classes cannot be promoted; `approve` refuses them.
- Demotion is always allowed and never requires justification beyond the trigger.

## Related
- Skill: `ops-trust` · Gate: `ops-confirm-gate.js` · `/shadow`, `/immunize`
