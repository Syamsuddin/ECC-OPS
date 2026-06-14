---
description: Profile a slow-but-healthy server, isolate the bottleneck layer, and propose tuning changes with expected impact.
---

# /perf-tune

Profiling is read-only; applying tuning is tier WRITE (confirm + saved-config rollback).

## Steps

1. Capture a baseline (response time, load/iostat/free, runtime worker utilization, DB slow-query summary). Record the "before."
2. Locate the constrained layer — web (nginx), runtime (PHP-FPM/PM2/gunicorn), or database — using `ops-performance` diagnostics.
3. Produce ranked recommendations: lever, proposed value, rationale, expected impact, risk, and rollback. Lead with reversible high-impact changes.
4. On confirmation, apply one change, then re-measure the same metric (before/after) to prove the effect; update the Server Profile.

Delegates to: **performance-tuner**. One layer at a time; measure before and after; never max-size beyond available RAM.
