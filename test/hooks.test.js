'use strict';
// Integration tests: spawn the actual hook processes with a tool payload on stdin and assert exit codes.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOKS = path.join(__dirname, '..', 'scripts', 'hooks');

function runHook(name, payload, env) {
  return spawnSync('node', [path.join(HOOKS, name)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

test('ops-safety-check blocks catastrophic with exit 2', () => {
  assert.equal(runHook('ops-safety-check.js', { tool_input: { command: 'rm -rf --no-preserve-root /' } }).status, 2);
  assert.equal(runHook('ops-safety-check.js', { tool_input: { command: 'ufw disable' } }).status, 2);
});

test('ops-safety-check allows safe with exit 0', () => {
  assert.equal(runHook('ops-safety-check.js', { tool_input: { command: 'systemctl status nginx' } }).status, 0);
});

test('ops-confirm-gate allows READ, reminds WRITE, blocks DESTRUCTIVE', () => {
  assert.equal(runHook('ops-confirm-gate.js', { tool_input: { command: 'df -h' } }).status, 0);
  assert.equal(runHook('ops-confirm-gate.js', { tool_input: { command: 'systemctl restart nginx' } }).status, 0);
  // DESTRUCTIVE without LOGEN_CONFIRM -> blocked (exit 2)
  assert.equal(runHook('ops-confirm-gate.js', { tool_input: { command: 'rm -rf /var/www/old' } }).status, 2);
  // DESTRUCTIVE with a confirmation token present -> allowed
  assert.equal(
    runHook('ops-confirm-gate.js', { tool_input: { command: 'rm -rf /var/www/old' } }, { LOGEN_CONFIRM: 'CONFIRM RM old' }).status,
    0
  );
});

test('PreToolUse stubs and context-load are non-blocking', () => {
  assert.equal(runHook('ops-shadow-gate.js', { tool_input: { command: 'systemctl restart nginx' } }).status, 0);
  assert.equal(runHook('ops-sandbox-wrap.js', { tool_input: { command: 'systemctl restart nginx' } }).status, 0);
  const r = runHook('ops-context-load.js', { session_id: 'test' }, { LOGEN_HOME: '/tmp/logen-nonexistent-xyz' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /SessionStart/);
});
