---
name: ops-sandbox
description: Shared isolation substrate (broker) for the intelligence layer. Provisions ephemeral REHEARSAL sandboxes (netns, CoW-twin, container, nspawn, microVM) to generate evidence, and CONTAINMENT wrappers (systemd-run, Landlock, seccomp, capability-drop) to bound the blast radius of real execution. Picks the lightest primitive meeting required parity within deadline, least-privilege first.
version: 1.0
---

# Sandbox Broker

`ops-sandbox` is infrastructure, not a reasoning pillar. It gives `ops-shadow`,
`ops-immunity`, and `ops-trust` ONE uniform way to obtain isolation, so capability
detection, least-privilege, lifecycle, and fidelity semantics live in a single place.

## Two modes
- **rehearsal** (off-prod) — build a disposable twin to OBSERVE an outcome.
- **containment** (on-prod) — wrap a real command so it CANNOT exceed its declared
  blast radius.

## Capability detection
Probe the host once and cache into `Server Profile.sandbox_capabilities` (container
runtime, namespaces, CoW storage, Landlock/seccomp, microVM, helper path). Re-probe on
the Profile's staleness schedule. NEVER assume a primitive exists — adapt (Principle 1).

## Primitive selection
Given `{aspect, parity_needed, deadline_s}`, choose the LIGHTEST primitive that meets
parity:

| aspect  | low parity            | medium                      | high parity            |
|---------|-----------------------|-----------------------------|------------------------|
| net     | logic (T0)            | netns rehearsal             | netns + traffic probe  |
| fs      | overlayfs             | overlayfs + validator       | nspawn copy            |
| service | systemd-run dry       | systemd-nspawn boot         | container from OS image|
| db      | EXPLAIN / pg txn      | CoW snapshot clone          | CoW clone + real load  |
| pkg     | `apt-get -s`          | container apply             | nspawn from OS image   |

Kernel-level changes (sysctl, modules, kernel upgrade) CANNOT be rehearsed by a
kernel-sharing sandbox — require microVM or report `degraded` honestly.

## Least-privilege
Prefer rootless primitives (Podman-rootless, bubblewrap, Landlock, user namespaces).
For primitives that need privilege (netns, nspawn, CoW LVM, microVM), call the
root-owned `logen-sandbox-helper` with whitelisted verbs only — the agent stays
unprivileged.

## Lifecycle & fidelity
- Every sandbox is ephemeral: resource-capped, auto-torn-down (even on error), and
  given a unique `handle`.
- Return `achieved_fidelity` (T0|T1|T2) and `contained` — these are written to the
  audit trail by `ops-audit-log.js` and consumed by `ops-trust` for evidence weighting.
- If the requested parity is unattainable, return `{degraded, reason}` — NEVER fake a
  twin or silently downgrade without saying so.

## Related
- Consumers: `ops-shadow` (rehearsal + guarded-apply containment), `ops-immunity`
  (antibody verification), `ops-trust` (evidence weighting, required modes).
- Command: `/sandbox`. Profile field: `sandbox_capabilities`. Helper:
  `logen-sandbox-helper` (root, NOPASSWD).
