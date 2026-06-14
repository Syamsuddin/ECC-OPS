#!/usr/bin/env node
// PreToolUse(Bash): require a fresh passing shadow rehearsal for ops the policy tags requires_shadow.
// ECC_OPS.md §XXI.2 / §XXII.8. Opt-in via op-context.json (requires_shadow:true or required_modes
// includes "shadow"). Records are keyed by the active host (~/.logen/shadow/<host>.jsonl).
//   READ                                  -> exit 0
//   requires_shadow + fresh T1/T2 pass    -> exit 0
//   requires_shadow + no fresh pass       -> exit 2 (tell the agent to run /shadow rehearse first)
'use strict';
const { readPayload, opContext, activeHost } = require('../lib/state');
const { classifyTier } = require('../lib/rules');
const { findFreshPass, opHash } = require('../lib/shadow');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  if (classifyTier(cmd) === 'READ') process.exit(0);

  const ctx = opContext();
  const required =
    ctx.requires_shadow === true ||
    (Array.isArray(ctx.required_modes) && ctx.required_modes.includes('shadow'));
  if (!required) process.exit(0);

  const host = activeHost() || ctx.host || null;
  if (findFreshPass(host, cmd)) process.exit(0);

  process.stderr.write(
    '[LOGEN ops-shadow] this op requires a passing rehearsal first — no fresh T1/T2 record.\n' +
    `  Run:  node scripts/shadow.js rehearse "${cmd}"   then re-issue. (op_hash ${opHash(cmd, host)})\n`
  );
  process.exit(2);
})();
