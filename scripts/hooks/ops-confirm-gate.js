#!/usr/bin/env node
// PreToolUse(Bash): classify the command into a tier and gate it (ECC_OPS.md §V, §XXII.5, Rule ops-change-management).
//   READ        -> allow.
//   WRITE       -> consult the ops-trust autonomy_ledger for the op-class: if it has earned a looser tier
//                  (auto-with-notify/auto), emit permissionDecision "allow" (no confirmation prompt);
//                  otherwise emit a rollback reminder and let the normal confirmation flow run.
//   DESTRUCTIVE -> NEVER consults the ledger (red line): block (exit 2) unless LOGEN_CONFIRM matches.
'use strict';
const { readPayload, opContext, activeHost } = require('../lib/state');
const { classifyTier, opClass } = require('../lib/rules');
const { getEntry, effectiveTier } = require('../lib/ledger');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  const tier = classifyTier(cmd);
  if (tier === 'READ') process.exit(0);

  const ctx = opContext();
  const klass = ctx.op_class || opClass(cmd);

  if (tier === 'DESTRUCTIVE') {
    const token = process.env.LOGEN_CONFIRM || '';
    const expected = ctx.confirm_token || null;
    const ok = token && (!expected || token === expected);
    if (!ok) {
      process.stderr.write(
        `[LOGEN ops-confirm] DESTRUCTIVE (${klass}) blocked: double-confirm required.\n` +
        `  1) Verify a backup exists.  2) Set LOGEN_CONFIRM to the exact token shown and re-run.\n` +
        `  Command: ${cmd}\n`
      );
      process.exit(2);
    }
    process.exit(0);
  }

  // WRITE — earned autonomy via the trust ledger.
  const host = activeHost();
  const eff = host ? effectiveTier(getEntry(host, klass)) : 'WRITE';
  if (eff === 'auto-with-notify' || eff === 'auto') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `trust ledger: ${klass} is ${eff}`,
      },
    }));
    process.stderr.write(`[LOGEN ops-confirm] WRITE (${klass}) auto-approved by trust ledger (${eff}).\n`);
    process.exit(0);
  }

  process.stderr.write(
    `[LOGEN ops-confirm] WRITE (${klass}): record a rollback point before proceeding (Rule ops-change-management).\n`
  );
  process.exit(0);
})();
