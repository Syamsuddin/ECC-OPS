#!/usr/bin/env node
// PreToolUse(Bash): enforce CONTAINMENT for WRITE/DESTRUCTIVE ops whose policy requires it.
// ECC_OPS.md §XXI.5 / §XXII.7. Opt-in: only active when op-context.json marks the operation
//   require_containment: true   (or required_modes includes "containment").
// Behaviour:
//   - blast_radius missing / over-broad  -> exit 2 (ask the orchestrator to declare a narrow one).
//   - command not already wrapped         -> exit 2 with the exact contained command to re-issue.
//   - command already contained, or not required, or READ -> exit 0.
// Enforcement (not silent rewrite): the hook can only allow/deny, so it blocks until the agent
// re-issues the command wrapped via `logen-sandbox-helper contain`.
'use strict';
const { readPayload, opContext } = require('../lib/state');
const { classifyTier } = require('../lib/rules');
const { blastRadiusOk, isContained, wrapContainment } = require('../lib/sandbox');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  if (classifyTier(cmd) === 'READ') process.exit(0);

  const ctx = opContext();
  const required =
    ctx.require_containment === true ||
    (Array.isArray(ctx.required_modes) && ctx.required_modes.includes('containment'));
  if (!required) process.exit(0);

  const blast = ctx.blast_radius || [];
  if (!blastRadiusOk(blast)) {
    process.stderr.write(
      '[LOGEN ops-sandbox] containment required but blast_radius is missing or over-broad.\n' +
      '  Declare a narrow blast_radius in ~/.logen/op-context.json (e.g. ["/var/www/app"]) — never "/" or system dirs.\n'
    );
    process.exit(2);
  }

  if (isContained(cmd)) process.exit(0);

  process.stderr.write(
    '[LOGEN ops-sandbox] this WRITE/DESTRUCTIVE op must run inside containment. Re-issue it wrapped:\n' +
    '  ' + wrapContainment(cmd, blast, ctx.op_class || 'op') + '\n'
  );
  process.exit(2);
})();
