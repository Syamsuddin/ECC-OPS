#!/usr/bin/env node
// LOGEN /immunize CLI — drive the fleet immune system (ECC_OPS.md §XXI.3).
//   node scripts/immunize.js review                 list active antibodies (Memory lessons)
//   node scripts/immunize.js scan   <id|title>      scan the fleet for the detector + quorum verdict
//   node scripts/immunize.js apply  <id> <host>     print the remediation + the per-host safety gates
//   node scripts/immunize.js retire <id|title>      forget (tombstone) an antibody
// Per-host confirm only — never silent fleet-wide action (red line §XXI.3).
'use strict';
const { listAntibodies, findAntibody, scanFleet, quorumMet } = require('./lib/immunity');
const { forget } = require('./lib/memory');

const sub = process.argv[2];
const arg = process.argv[3];

if (sub === 'review') {
  const abs = listAntibodies();
  if (!abs.length) { console.log('(no active antibodies)'); process.exit(0); }
  for (const a of abs) console.log(`${a.id} [${a.confidence}] ${a.title} — ${a.fact}`);
  process.exit(0);
} else if (sub === 'scan') {
  if (!arg) { console.error('usage: immunize scan <id|title>'); process.exit(64); }
  const a = findAntibody(arg);
  if (!a) { console.error(`antibody not found: ${arg}`); process.exit(1); }
  const { matched, needsProbe } = scanFleet(a);
  const q = quorumMet(matched, a.evidence && a.evidence.shadow_passed);
  console.log(`antibody ${a.id}: matched=[${matched.join(', ')}] needsProbe=[${needsProbe.join(', ')}]`);
  console.log(`quorum ${q ? 'MET' : 'NOT MET'} (>=2 matched hosts or a shadow pass) -> ${q ? 'may OFFER immunization (per-host confirm)' : 'advisory only'}`);
  process.exit(0);
} else if (sub === 'apply') {
  const host = process.argv[4];
  if (!arg || !host) { console.error('usage: immunize apply <id> <host>'); process.exit(64); }
  const a = findAntibody(arg);
  if (!a) { console.error(`antibody not found: ${arg}`); process.exit(1); }
  console.log(`# Immunize ${host} with ${a.id} (${a.title}) — per-host CONFIRM required.`);
  console.log(`# 1) shadow-verify on ${host}:  node scripts/shadow.js rehearse "<remediation>"`);
  console.log('# 2) apply through the normal WRITE tier (containment + confirm + audit):');
  console.log((a.remediation && a.remediation.fix) || '# (no remediation recorded)');
  console.log(`# rollback: ${(a.remediation && a.remediation.rollback) || 'n/a'}`);
  process.exit(0);
} else if (sub === 'retire') {
  if (!arg) { console.error('usage: immunize retire <id|title>'); process.exit(64); }
  const a = findAntibody(arg);
  if (!a) { console.error(`antibody not found: ${arg}`); process.exit(1); }
  forget('global', a.title);
  console.log(`retired antibody ${a.id} (${a.title})`);
  process.exit(0);
} else {
  console.error('usage: immunize <review|scan|apply|retire> ...');
  process.exit(64);
}
