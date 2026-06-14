#!/usr/bin/env node
// PostToolUse(Bash): append one audit JSONL record for every WRITE/DESTRUCTIVE (Prinsip 7), and feed
// the ops-trust ledger with the prod outcome (§XXII.5). Provenance comes from active.json + op-context.json
// (§XVII / §XXII.6). READ is never audited. DESTRUCTIVE never enters the ledger (red line §XXI.4).
'use strict';
const { readPayload, active, opContext, activeHost } = require('../lib/state');
const { classifyTier, opClass } = require('../lib/rules');
const { appendAudit } = require('../lib/audit');
const { getEntry, setEntry, applyEvidence, recommendTier } = require('../lib/ledger');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  const tier = classifyTier(cmd);
  if (tier === 'READ') process.exit(0);

  const a = active();
  const ctx = opContext();
  const resp = p && p.tool_response;
  const ok = resp ? (resp.success !== false && !resp.error) : true;
  const host = activeHost() || ctx.host || a.host || 'unknown';
  const klass = ctx.op_class || opClass(cmd);

  appendAudit({
    timestamp: new Date().toISOString(),
    host,
    actor: a.operator || ctx.actor || 'unknown',
    tier,
    op_class: klass,
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

  // Feed the trust ledger with PROD evidence — WRITE only (DESTRUCTIVE is never promotable).
  if (tier === 'WRITE' && host !== 'unknown' && klass !== 'generic') {
    try {
      let e = getEntry(host, klass);
      const result = ok ? 'success' : (resp && resp.rolled_back ? 'rolled_back' : 'failed');
      e = applyEvidence(e, { source: 'prod', result }, new Date().toISOString());
      e.proposed_tier = recommendTier(e, { destructive: false });
      setEntry(host, klass, e);
    } catch (_) { /* ledger update is best-effort */ }
  }

  process.exit(0);
})();
