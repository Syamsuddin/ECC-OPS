'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { opHash, selectValidator, findFreshPass, TTL_S } = require('../scripts/lib/shadow');

test('opHash: deterministic and host-sensitive', () => {
  assert.equal(opHash('nginx -t', 'web01'), opHash('nginx  -t', 'web01')); // whitespace-normalized
  assert.notEqual(opHash('nginx -t', 'web01'), opHash('nginx -t', 'web02'));
});

test('selectValidator: argv form (execFileSync, no shell) + injection-safe', () => {
  assert.deepEqual(selectValidator('systemctl reload nginx'), { argv: ['nginx', '-t'], tier: 'T1' });
  assert.deepEqual(selectValidator('vim /etc/ssh/sshd_config'), { argv: ['sshd', '-t'], tier: 'T1' });
  assert.deepEqual(selectValidator('apt-get install nginx vim').argv, ['apt-get', 'install', '-s', 'nginx', 'vim']);
  assert.equal(selectValidator('rm -rf /var/www/old'), null);
  // an injected package arg with shell metacharacters is dropped -> no validator (advisory T0)
  assert.equal(selectValidator('apt-get install foo$(touch /tmp/x)'), null);
});

// Build a temp LOGEN_HOME with shadow records to exercise findFreshPass + the gate.
function tmpHome() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'logen-'));
  fs.mkdirSync(path.join(h, 'shadow'), { recursive: true });
  return h;
}
function writeRec(home, host, rec) {
  fs.appendFileSync(path.join(home, 'shadow', `${host}.jsonl`), JSON.stringify(rec) + '\n');
}
function rec(command, host, over) {
  return Object.assign(
    { op_hash: opHash(command, host), command, host, shadow_fidelity: 'T1', passed: true,
      rehearsed_at: new Date().toISOString(), ttl_s: TTL_S },
    over || {}
  );
}

// findFreshPass (fidelity/pass/TTL/exact-command logic) is exercised end-to-end through the gate
// below — each runGate is a fresh process with its own LOGEN_HOME, the only reliable way to redirect
// the path module that binds HOME at load time.
function runGate(command, home) {
  return spawnSync('node', [path.join(__dirname, '..', 'scripts', 'hooks', 'ops-shadow-gate.js')], {
    input: JSON.stringify({ tool_input: { command }, session_id: 's' }),
    encoding: 'utf8',
    env: { ...process.env, LOGEN_HOME: home },
  });
}

test('ops-shadow-gate: enforcement matrix', () => {
  const home = tmpHome();
  const host = 'web01';
  fs.writeFileSync(path.join(home, 'active.json'), JSON.stringify({ host }));
  const setCtx = (o) => fs.writeFileSync(path.join(home, 'op-context.json'), JSON.stringify(o));
  const cmd = 'systemctl reload nginx';

  // requires_shadow but no record -> block
  setCtx({ requires_shadow: true });
  assert.equal(runGate(cmd, home).status, 2);

  // fresh T1 pass -> allow
  writeRec(home, host, rec(cmd, host));
  assert.equal(runGate(cmd, home).status, 0);

  // expired record -> block again (different command file: write expired for a 2nd command)
  const cmd2 = 'systemctl reload php8.3-fpm';
  writeRec(home, host, rec(cmd2, host, { rehearsed_at: new Date(Date.now() - (TTL_S + 60) * 1000).toISOString() }));
  assert.equal(runGate(cmd2, home).status, 2);

  // T0 record never authorizes
  const cmd3 = 'apt-get upgrade';
  writeRec(home, host, rec(cmd3, host, { shadow_fidelity: 'T0' }));
  assert.equal(runGate(cmd3, home).status, 2);

  // not required -> pass regardless
  setCtx({});
  assert.equal(runGate('systemctl restart nginx', home).status, 0);

  // READ never gated
  setCtx({ requires_shadow: true });
  assert.equal(runGate('df -h', home).status, 0);

  fs.rmSync(home, { recursive: true, force: true });
});
