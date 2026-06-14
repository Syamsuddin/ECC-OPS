'use strict';
// End-to-end: a single WRITE op marked requires_shadow + require_containment flows correctly through
// the full LOGEN hook pipeline and lands in the audit trail + trust ledger. Exercises every wired
// intelligence hook in one scenario (the M0-M7 loop), without touching a real server.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opHash } = require('../scripts/lib/shadow');

const HOOKS = path.join(__dirname, '..', 'scripts', 'hooks');
function runHook(name, payload, home) {
  return spawnSync('node', [path.join(HOOKS, name)], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, LOGEN_HOME: home },
  });
}

test('E2E: requires_shadow + require_containment op flows through the whole pipeline', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logen-'));
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'shadow'), { recursive: true });
  const host = 'web01';
  fs.writeFileSync(path.join(home, 'active.json'), JSON.stringify({ host, operator: 'syams@x' }));
  fs.writeFileSync(path.join(home, 'profiles', `${host}.json`), '{}');
  fs.writeFileSync(path.join(home, 'op-context.json'), JSON.stringify({
    requires_shadow: true, require_containment: true, blast_radius: ['/var/www/app'],
    op_class: 'deploy:shop', actor: 'syams@x', reason: 'release v2', rollback_cmd: 'git checkout PREV',
  }));

  const cmd = 'git pull --ff-only';                 // tier WRITE; op_class overridden to deploy:shop
  const payload = { tool_input: { command: cmd }, session_id: 's' };

  // 1. safety-check — not catastrophic -> allow
  assert.equal(runHook('ops-safety-check.js', payload, home).status, 0);

  // 2. shadow-gate — requires_shadow but no rehearsal -> BLOCK
  assert.equal(runHook('ops-shadow-gate.js', payload, home).status, 2);

  // ...operator runs /shadow rehearse (simulated as a fresh passing T1 record) -> shadow-gate allows
  fs.appendFileSync(path.join(home, 'shadow', `${host}.jsonl`), JSON.stringify({
    op_hash: opHash(cmd, host), command: cmd, host, shadow_fidelity: 'T1', passed: true,
    rehearsed_at: new Date().toISOString(), ttl_s: 1800,
  }) + '\n');
  assert.equal(runHook('ops-shadow-gate.js', payload, home).status, 0);

  // 3. sandbox-wrap — require_containment, command not contained -> BLOCK
  assert.equal(runHook('ops-sandbox-wrap.js', payload, home).status, 2);
  // ...wrapped in containment -> allow
  const wrapped = { tool_input: { command: `sudo logen-sandbox-helper contain deploy-shop /var/www/app -- ${cmd}` }, session_id: 's' };
  assert.equal(runHook('ops-sandbox-wrap.js', wrapped, home).status, 0);

  // 4. confirm-gate — WRITE, op-class not promoted -> allow (reminder)
  assert.equal(runHook('ops-confirm-gate.js', payload, home).status, 0);

  // 5. audit-log (success) -> audit entry written + prod evidence fed to the ledger
  runHook('ops-audit-log.js', { ...payload, tool_response: { success: true } }, home);

  const audit = fs.readFileSync(path.join(home, 'audit', `${host}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const entry = audit[audit.length - 1];
  assert.equal(entry.op_class, 'deploy:shop');
  assert.equal(entry.tier, 'WRITE');
  assert.equal(entry.result, 'success');
  assert.equal(entry.reason, 'release v2');
  assert.equal(entry.rollback_cmd, 'git checkout PREV');

  const prof = JSON.parse(fs.readFileSync(path.join(home, 'profiles', `${host}.json`), 'utf8'));
  assert.equal(prof.autonomy_ledger['deploy:shop'].evidence.prod, 1);
  assert.equal(prof.autonomy_ledger['deploy:shop'].success, 1);

  fs.rmSync(home, { recursive: true, force: true });
});

test('E2E: catastrophic command is hard-blocked regardless of context', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logen-'));
  const r = runHook('ops-safety-check.js', { tool_input: { command: 'rm -rf --no-preserve-root /' } }, home);
  assert.equal(r.status, 2);
  fs.rmSync(home, { recursive: true, force: true });
});
