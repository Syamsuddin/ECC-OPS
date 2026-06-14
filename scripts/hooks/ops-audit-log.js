#!/usr/bin/env node
// PostToolUse(Bash): append one audit JSONL record for every WRITE/DESTRUCTIVE (Prinsip 7).
// Provenance (actor/reason/pre_state_ref/rollback_cmd) comes from the control-side files
// active.json + op-context.json (ECC_OPS.md §XVII / §XXII.6). READ is never audited.
'use strict';
const { readPayload, active, opContext, activeHost } = require('../lib/state');
const { classifyTier, opClass } = require('../lib/rules');
const { appendAudit } = require('../lib/audit');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  const tier = classifyTier(cmd);
  if (tier === 'READ') process.exit(0);

  const a = active();
  const ctx = opContext();
  const resp = p && p.tool_response;
  const ok = resp ? (resp.success !== false && !resp.error) : true;

  appendAudit({
    timestamp: new Date().toISOString(),
    host: activeHost() || ctx.host || a.host || 'unknown',
    actor: a.operator || ctx.actor || 'unknown',
    tier,
    op_class: ctx.op_class || opClass(cmd),
    command: cmd,
    target: ctx.target || null,
    pre_state_ref: ctx.pre_state_ref || null,
    result: ok ? 'success' : 'failed',
    rollback_cmd: ctx.rollback_cmd || null,
    reason: ctx.reason || null,
    shadow_fidelity: ctx.shadow_fidelity || 'none',
    contained: ctx.contained === true,
    model: ctx.model || null,
  });
  process.exit(0);
})();
