#!/usr/bin/env node
// PreToolUse(Bash): require a passing shadow rehearsal for ops the trust policy tags `requires_shadow`.
// ECC_OPS.md §XXI.2 / §XXII.8.
//
// TODO(M5): hash the pending command + active host, look up a fresh passing record (shadow_fidelity in
//   {T1,T2}, now - rehearsed_at < ttl_s) in ~/.logen/shadow/<session>.jsonl. If `requires_shadow` and no
//   fresh pass -> exit 2 with an instruction to run `/shadow rehearse`. READ always passes.
// Until M5 lands this is a safe pass-through so the plugin loads and runs unhindered.
'use strict';
process.exit(0);
