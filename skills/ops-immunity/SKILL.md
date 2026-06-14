---
name: ops-immunity
description: Fleet immune system. Turns a single resolved incident into a verified, reusable antibody (signature + self-written detector + preventive remediation), proactively scans the fleet for the latent condition, and offers to immunize hosts that have not yet failed — per-host confirmed, quorum-gated to avoid N=1 overfitting.
version: 1.0
---

# Operational Antibodies

Reactive ops fixes one host at a time. `ops-immunity` makes the whole fleet learn from
one host's pain: incident -> antibody -> fleet-wide prevention BEFORE recurrence.

## Antibody = a Memory lesson
An antibody is a Memory entry (`type: lesson`, `scope: global`) carrying:
`{ signature (host-agnostic precondition), detector (a READ check), remediation (fix +
rollback), confidence, expires_at }`. No new store — it reuses the Memory layer
(Section IV), so `forget` retires a bad antibody and `digest` compacts them.

## Lifecycle
1. **Synthesize** — `immunity-synthesizer` (read-only) abstracts the incident and writes
   the detector. Proposes only.
2. **Verify per-host** — for each matched host, run the remediation through `ops-shadow`
   (rehearsal on that host's twin) so the fix is proven against THAT host's state, not
   just the source host's. This defeats N=1 overfitting.
3. **Quorum** — promote from "advisory" to "offer immunization" only when the pattern is
   seen on >=2 hosts OR a shadow rehearsal passes. Record evidence + confidence.
4. **Immunize** — apply per host inside `ops-sandbox` containment, ALWAYS per-host
   confirmed (no silent mass action), each logged to the audit trail with its rollback.

## Safety (red lines)
- No fleet-wide auto-apply. Per-host confirmation unless the operator explicitly approves
  a batch.
- Detectors must be false-positive averse — a flood of bad alerts erodes trust faster
  than a missed one.
- A wrong generalization must be one `forget` away from gone.

## Related
- Subagent: `immunity-synthesizer` · Substrate: `ops-sandbox` · Verifier: `ops-shadow`
- Stores antibodies in: `ops-memory` (Section IV). Feeds outcomes to: `ops-trust`.
- Command: `/immunize`.
