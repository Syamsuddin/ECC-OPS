#!/usr/bin/env node
// LOGEN /trust CLI — govern the calibrated autonomy ledger (ECC_OPS.md §XXI.4).
//   node scripts/trust.js show [op-class]      print ledger entries for the active host
//   node scripts/trust.js approve <op-class>   apply a PROPOSED promotion (human meta-approval)
//   node scripts/trust.js demote  <op-class>   force back to WRITE (always allowed)
//   node scripts/trust.js explain <op-class>   show the calibration + promotion-gate reasoning
'use strict';
const { activeHost } = require('./lib/state');
const { getEntry, setEntry, approve, demote, p5, recommendTier, PROMOTE_MIN_PROD } = require('./lib/ledger');
const { readProfile } = require('./lib/profile');

const sub = process.argv[2];
const opClass = process.argv[3];
const host = activeHost();
const isDestructive = (k) => /^(restore|db-drop)\b/.test(k || '');

function show(k, e) {
  console.log(
    `${k}: tier=${e.current_tier} proposed=${e.proposed_tier || '-'} ` +
    `prod=${e.evidence.prod} rehearsal=${e.evidence.rehearsal} fail=${e.failed + e.rolled_back} p5=${p5(e).toFixed(3)}`
  );
}

if (sub === 'show') {
  if (opClass) { show(opClass, getEntry(host, opClass)); process.exit(0); }
  const led = (readProfile(host) || {}).autonomy_ledger || {};
  const keys = Object.keys(led);
  if (!keys.length) console.log('(empty ledger)');
  for (const k of keys) show(k, getEntry(host, k));
  process.exit(0);
} else if (sub === 'approve') {
  if (!opClass) { console.error('usage: trust approve <op-class>'); process.exit(64); }
  if (isDestructive(opClass)) { console.error(`refused: ${opClass} is DESTRUCTIVE and never promotable`); process.exit(1); }
  const e = getEntry(host, opClass);
  if (!e.proposed_tier) { console.error(`no proposed promotion for ${opClass}`); process.exit(1); }
  const napproved = approve(e); setEntry(host, opClass, napproved);
  console.log(`approved: ${opClass} -> ${napproved.current_tier}`); process.exit(0);
} else if (sub === 'demote') {
  if (!opClass) { console.error('usage: trust demote <op-class>'); process.exit(64); }
  const e = demote(getEntry(host, opClass)); setEntry(host, opClass, e);
  console.log(`demoted: ${opClass} -> ${e.current_tier}`); process.exit(0);
} else if (sub === 'explain') {
  if (!opClass) { console.error('usage: trust explain <op-class>'); process.exit(64); }
  const e = getEntry(host, opClass);
  const rec = recommendTier(e, { destructive: isDestructive(opClass) });
  const noFail = !e.last_failure || (Date.now() - Date.parse(e.last_failure)) / 86400000 > 90;
  console.log(`${opClass}: alpha=${e.alpha.toFixed(2)} beta=${e.beta.toFixed(2)} p5=${p5(e).toFixed(3)} prod=${e.evidence.prod}`);
  console.log(
    `gate: p5>=0.95 (${p5(e) >= 0.95}) AND prod>=${PROMOTE_MIN_PROD} (${e.evidence.prod >= PROMOTE_MIN_PROD}) ` +
    `AND no-fail-90d (${noFail}) AND not-destructive (${!isDestructive(opClass)}) => ${rec || 'no change'}`
  );
  process.exit(0);
} else {
  console.error('usage: trust <show|approve|demote|explain> [op-class]');
  process.exit(64);
}
