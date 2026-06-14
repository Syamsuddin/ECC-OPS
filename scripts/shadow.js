#!/usr/bin/env node
// LOGEN /shadow CLI — drives ops-shadow rehearsal so the gate and the rehearsal share one op_hash.
// Usage:
//   node scripts/shadow.js rehearse "<command>"   run the T1 validator, record the outcome (exit 0 if pass)
//   node scripts/shadow.js check    "<command>"   is there a fresh passing record? (exit 0 if yes)
//   node scripts/shadow.js list                   list rehearsal records for the active host
'use strict';
const { activeHost } = require('./lib/state');
const { rehearse, readRecords, findFreshPass, opHash } = require('./lib/shadow');

const sub = process.argv[2];
const arg = process.argv.slice(3).join(' ');
const host = activeHost();

if (sub === 'rehearse') {
  if (!arg) { console.error('usage: shadow rehearse "<command>"'); process.exit(64); }
  const r = rehearse(host, arg);
  const verified = r.passed && (r.shadow_fidelity === 'T1' || r.shadow_fidelity === 'T2');
  // Feed REHEARSAL evidence to the trust ledger (fidelity-weighted; never enough alone to promote).
  if (verified && host) {
    try {
      const { getEntry, setEntry, applyEvidence, recommendTier } = require('./lib/ledger');
      const { opClass } = require('./lib/rules');
      const klass = opClass(arg);
      if (klass !== 'generic') {
        let e = getEntry(host, klass);
        e = applyEvidence(e, { source: 'rehearsal', fidelity: r.shadow_fidelity });
        e.proposed_tier = recommendTier(e, { destructive: false });
        setEntry(host, klass, e);
      }
    } catch (_) { /* best-effort */ }
  }
  console.log(`[shadow] ${r.shadow_fidelity} ${r.passed ? 'PASS' : 'FAIL'} — ${r.detail}`);
  console.log(`shadow_verified=${verified} op_hash=${r.op_hash} host=${host || '-'}`);
  process.exit(r.passed ? 0 : 1);
} else if (sub === 'check') {
  const p = findFreshPass(host, arg);
  console.log(p ? `fresh pass (${p.shadow_fidelity}) op_hash=${opHash(arg, host)}` : 'no fresh pass');
  process.exit(p ? 0 : 1);
} else if (sub === 'list') {
  for (const r of readRecords(host)) {
    console.log(`${r.rehearsed_at} ${r.shadow_fidelity} ${r.passed ? 'PASS' : 'FAIL'} ${r.op_hash} ${r.command}`);
  }
  process.exit(0);
} else {
  console.error('usage: shadow <rehearse|check|list> ["<command>"]');
  process.exit(64);
}
