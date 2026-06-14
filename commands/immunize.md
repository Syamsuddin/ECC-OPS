---
description: Review synthesized antibodies, scan the fleet for latent matches, and immunize hosts that have not yet failed — per-host confirmed.
---

# /immunize

Drive the fleet immune system (`ops-immunity`).

## Modes
- **review** (default) — list candidate antibodies (signature, detector, confidence,
  matched hosts) awaiting verification. READ.
- **scan `<antibody-id>`** — run the detector across the fleet and show which hosts carry
  the latent condition. READ.
- **apply `<antibody-id> <host>`** — verify on the host's twin (`ops-shadow`), then
  immunize inside containment. WRITE, per-host confirmed.
- **retire `<antibody-id>`** — `forget` a bad antibody from memory. WRITE.

## Safety
- Nothing is applied fleet-wide automatically. Each host is confirmed unless a batch is
  explicitly approved.
- Promotion to "offer" requires quorum (>=2 hosts or a shadow pass).

## Related
- Skill: `ops-immunity` · Subagent: `immunity-synthesizer` · `/shadow`, `/sandbox`
