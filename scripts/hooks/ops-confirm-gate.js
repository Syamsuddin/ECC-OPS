#!/usr/bin/env node
// PreToolUse(Bash): classify the command into a tier and gate it (ECC_OPS.md §V, Rule ops-change-management).
//   READ        -> allow (exit 0).
//   WRITE       -> non-blocking reminder to record a rollback point; the single confirmation is handled
//                  at the persona / Claude Code permission layer.
//   DESTRUCTIVE -> block (exit 2) unless a matching confirmation token is provided via LOGEN_CONFIRM,
//                  enforcing double-confirm + "prove a backup exists" before proceeding.
'use strict';
const { readPayload, opContext } = require('../lib/state');
const { classifyTier, opClass } = require('../lib/rules');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  const tier = classifyTier(cmd);

  if (tier === 'READ') process.exit(0);

  const klass = opClass(cmd);

  if (tier === 'DESTRUCTIVE') {
    const token = process.env.LOGEN_CONFIRM || '';
    const ctx = opContext();
    const expected = ctx.confirm_token || null;
    const ok = token && (!expected || token === expected);
    if (!ok) {
      process.stderr.write(
        `[LOGEN ops-confirm] DESTRUCTIVE (${klass}) blocked: double-confirm required.\n` +
        `  1) Verify a backup exists.  2) Set LOGEN_CONFIRM to the exact token shown and re-run.\n` +
        `  Command: ${cmd}\n`
      );
      process.exit(2); // block
    }
    process.exit(0);
  }

  // WRITE
  process.stderr.write(
    `[LOGEN ops-confirm] WRITE (${klass}): record a rollback point before proceeding (Rule ops-change-management).\n`
  );
  process.exit(0);
})();
