---
description: Inspect sandbox capabilities of a host, list and tear down ephemeral sandboxes, and dry-detect which isolation primitives are available. READ except teardown (WRITE).
---

# /sandbox

Inspect and manage the isolation substrate (`ops-sandbox`) on a host.

## Modes
- **caps** (default) — print `Server Profile.sandbox_capabilities`; with `--probe`,
  re-detect live (container runtime, namespaces, CoW storage, Landlock/seccomp, microVM)
  and refresh the Profile. READ.
- **list** — show ephemeral sandboxes currently allocated (handles, age, resource use).
  READ.
- **gc** — tear down leaked/orphaned ephemeral sandboxes past their TTL. WRITE
  (control-side cleanup; never touches the live host state being managed).

## Safety
- Capability probing is read-only.
- Teardown only removes LOGEN-owned ephemeral sandboxes (prefixed `ecc-shadow-`),
  never operator workloads.

## Related
- Skill: `ops-sandbox`
- Used by: `/shadow`, `/immunize`, `/trust`
