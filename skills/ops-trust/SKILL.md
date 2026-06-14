---
name: ops-trust
description: Calibrated autonomy. Replaces the static approval tiers with an adaptive, per-op-class, per-host trust ledger driven by counterfactual analysis of the agent's own audited track record. Promotion needs human meta-approval; demotion is automatic and instant. True DESTRUCTIVE ops are never promotable. Sandbox lowers the price of risk.
version: 1.0
---

# Earned Autonomy

Trust is a measured, earned, revocable quantity — not a fixed table. Friction should fall
where the agent has proven itself, and snap back the instant it fails.

## The ledger (in Server Profile)
`autonomy_ledger[op-class:scope]` tracks `{success, failed, rolled_back, last_failure,
evidence:{prod, rehearsal}, current_tier, proposed_tier, required_modes}`. It lives in
the Profile so it persists and is auditable.

## Two loops
1. **Counterfactual RCA** — on an incident, align symptom onset with the audit timeline +
   metrics to assign causal credit/blame to a prior change. This produces the
   success/failure signal — grounded in the audit trail, not guesswork.
2. **Calibration** — a per-op-class Beta/Bayesian estimate turns signals into a
   recommended tier. Weight evidence by fidelity: real prod outcomes outweigh rehearsal
   passes (the parity gap is real).

## Decisions
- **Promotion** (stricter -> looser, e.g. WRITE -> auto-with-notify) is PROPOSED to the
  human and applied only on meta-approval. The human approves a *policy* once, not every
  action.
- **Demotion** (looser -> stricter) is AUTOMATIC and INSTANT on any failure/rollback, and
  reported with the cause.
- **required_modes** — a policy may require `shadow` and/or `containment` as a
  precondition for autonomy. Containment caps the blast radius, which is what makes looser
  autonomy safe.

## Hard limits (design constants — never overridden at runtime)
- True DESTRUCTIVE ops (DROP/TRUNCATE, `rm -rf`, `ufw disable`, restore-over-prod) are
  NEVER promotable. The ledger governs routine WRITE only.
- A sandbox/rehearsal pass alone never justifies promotion — it lowers uncertainty, not
  the catastrophic-tail risk.
- Every promotion/demotion is itself an audit entry: trust is auditable too.

## Related
- Reads: audit trail (Section XVII), `ops-shadow` evidence, `ops-immunity` outcomes.
- Enforced by: `ops-confirm-gate.js` (reads the ledger instead of a static table).
- Command: `/trust`. Profile field: `autonomy_ledger`.
