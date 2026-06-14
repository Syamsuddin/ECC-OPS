'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const L = require('../scripts/lib/ledger');

function withEvidence(prodSuccess, rehearsal, fidelity) {
  let e = L.newEntry();
  for (let i = 0; i < prodSuccess; i++) e = L.applyEvidence(e, { source: 'prod', result: 'success' });
  for (let i = 0; i < (rehearsal || 0); i++) e = L.applyEvidence(e, { source: 'rehearsal', fidelity: fidelity || 'T2' });
  return e;
}
const FIXED = Date.parse('2026-06-14T00:00:00Z');

test('applyEvidence: prod success raises alpha; prod failure demotes + sets probation', () => {
  let e = L.applyEvidence(L.newEntry(), { source: 'prod', result: 'success' });
  assert.equal(e.alpha, 2);
  assert.equal(e.success, 1);
  assert.equal(e.evidence.prod, 1);
  e.current_tier = 'auto-with-notify';
  e = L.applyEvidence(e, { source: 'prod', result: 'failed' }, '2026-06-14T00:00:00Z');
  assert.equal(e.beta, 2);
  assert.equal(e.failed, 1);
  assert.equal(e.current_tier, 'WRITE'); // instant demotion
  assert.ok(e.probation_until_prod > e.success);
});

test('rehearsal evidence is fidelity-weighted (T2 0.30, T1 0.15, T0 0.0)', () => {
  assert.equal(L.applyEvidence(L.newEntry(), { source: 'rehearsal', fidelity: 'T2' }).alpha, 1.3);
  assert.equal(L.applyEvidence(L.newEntry(), { source: 'rehearsal', fidelity: 'T1' }).alpha, 1.15);
  assert.equal(L.applyEvidence(L.newEntry(), { source: 'rehearsal', fidelity: 'T0' }).alpha, 1);
});

test('recommendTier: promotes with strong evidence (>=20 prod + high p5)', () => {
  const e = withEvidence(47, 130, 'T2'); // alpha = 1 + 47 + 39 = 87 -> p5 ~ 0.966
  assert.equal(L.recommendTier(e, { destructive: false }, FIXED), 'auto-with-notify');
});

test('recommendTier: rehearsal alone NEVER promotes (prod floor enforces the red line)', () => {
  assert.equal(L.recommendTier(withEvidence(0, 500, 'T2'), { destructive: false }, FIXED), null);
});

test('recommendTier: fewer than 20 prod does not promote', () => {
  assert.equal(L.recommendTier(withEvidence(10, 200, 'T2'), { destructive: false }, FIXED), null);
});

test('recommendTier: DESTRUCTIVE class is never promotable', () => {
  assert.equal(L.recommendTier(withEvidence(100, 200, 'T2'), { destructive: true }, FIXED), null);
});

test('recommendTier: a recent failure (probation + 90d window) blocks promotion', () => {
  let e = withEvidence(60, 130, 'T2');
  e = L.applyEvidence(e, { source: 'prod', result: 'failed' }, new Date().toISOString());
  assert.equal(L.recommendTier(e, { destructive: false }), null);
});

test('approve applies proposed_tier; demote forces WRITE', () => {
  let e = withEvidence(47, 130, 'T2');
  e.proposed_tier = L.recommendTier(e, { destructive: false }, FIXED);
  const ap = L.approve(e);
  assert.equal(ap.current_tier, 'auto-with-notify');
  assert.equal(ap.proposed_tier, null);
  assert.equal(L.demote(ap).current_tier, 'WRITE');
});

function tmpHomeWithHost() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logen-'));
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(home, 'active.json'), JSON.stringify({ host: 'web01', operator: 'syams@x' }));
  return home;
}

test('ops-confirm-gate: a promoted op-class is auto-approved (permissionDecision allow)', () => {
  const home = tmpHomeWithHost();
  const e = Object.assign(L.newEntry(), { current_tier: 'auto-with-notify' });
  fs.writeFileSync(path.join(home, 'profiles', 'web01.json'), JSON.stringify({ autonomy_ledger: { 'restart:nginx': e } }));
  fs.writeFileSync(path.join(home, 'op-context.json'), '{}');
  const run = (command) => spawnSync('node', [path.join(__dirname, '..', 'scripts', 'hooks', 'ops-confirm-gate.js')], {
    input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: { ...process.env, LOGEN_HOME: home },
  });
  const promoted = run('systemctl reload nginx'); // op_class restart:nginx (promoted)
  assert.equal(promoted.status, 0);
  assert.match(promoted.stdout, /permissionDecision[\s\S]*allow/);
  const plain = run('systemctl restart php8.3-fpm'); // restart:php8.3-fpm (not in ledger)
  assert.equal(plain.status, 0);
  assert.doesNotMatch(plain.stdout, /allow/);
  fs.rmSync(home, { recursive: true, force: true });
});

test('ops-audit-log: a WRITE feeds prod evidence into the ledger', () => {
  const home = tmpHomeWithHost();
  fs.writeFileSync(path.join(home, 'profiles', 'web01.json'), '{}');
  fs.writeFileSync(path.join(home, 'op-context.json'), '{}');
  spawnSync('node', [path.join(__dirname, '..', 'scripts', 'hooks', 'ops-audit-log.js')], {
    input: JSON.stringify({ tool_input: { command: 'systemctl reload nginx' }, tool_response: { success: true } }),
    encoding: 'utf8', env: { ...process.env, LOGEN_HOME: home },
  });
  const prof = JSON.parse(fs.readFileSync(path.join(home, 'profiles', 'web01.json'), 'utf8'));
  assert.ok(prof.autonomy_ledger && prof.autonomy_ledger['restart:nginx']);
  assert.equal(prof.autonomy_ledger['restart:nginx'].evidence.prod, 1);
  assert.equal(prof.autonomy_ledger['restart:nginx'].success, 1);
  fs.rmSync(home, { recursive: true, force: true });
});
