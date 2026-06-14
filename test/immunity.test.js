'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const I = require('../scripts/lib/immunity');

test('evalClause + evaluateDetector over a Server Profile', () => {
  const prof = {
    os: { distro: 'Ubuntu' },
    resources: { ram_mb: 2048 },
    firewall: { allowed: [{ port: 22 }, { port: 6379 }] },
    stack: { runtimes: [{ name: 'php', version: '8.3' }] },
  };
  assert.equal(I.evalClause(prof, { path: 'os.distro', op: 'eq', value: 'Ubuntu' }), true);
  assert.equal(I.evalClause(prof, { path: 'resources.ram_mb', op: 'lt', value: 4096 }), true);
  assert.equal(I.evalClause(prof, { path: 'firewall.allowed', op: 'any_eq', field: 'port', value: 6379 }), true);
  assert.equal(I.evalClause(prof, { path: 'firewall.allowed', op: 'any_eq', field: 'port', value: 9999 }), false);
  const det = { all: [
    { path: 'resources.ram_mb', op: 'lt', value: 4096 },
    { path: 'firewall.allowed', op: 'any_eq', field: 'port', value: 6379 },
  ] };
  assert.equal(I.evaluateDetector(det, prof), true);
  assert.equal(I.evaluateDetector({ probe: 'some-host-check' }, prof), null); // probe-only -> needs host
  assert.equal(I.evaluateDetector({ all: [] }, prof), false);
});

test('quorumMet: >=2 matched hosts OR a shadow pass', () => {
  assert.equal(I.quorumMet(['a', 'b'], false), true);
  assert.equal(I.quorumMet(['a'], false), false);
  assert.equal(I.quorumMet(['a'], true), true);
  assert.equal(I.quorumMet([], false), false);
});

test('makeAntibody: deterministic id + Memory-lesson structure', () => {
  const ab = I.makeAntibody({ title: 'redis-exposed', signature: 'redis bound publicly', confidence: 'high' });
  assert.equal(ab.type, 'lesson');
  assert.equal(ab.scope, 'global');
  assert.equal(ab.antibody, true);
  assert.equal(ab.id, I.antibodyId('redis-exposed'));
});

function setupHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logen-'));
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  fs.mkdirSync(path.join(home, 'memory'), { recursive: true });
  const fw = (port) => ({ resources: { ram_mb: 2048 }, firewall: { allowed: [{ port: 22 }, { port }] } });
  fs.writeFileSync(path.join(home, 'profiles', 'web01.json'), JSON.stringify(fw(6379)));
  fs.writeFileSync(path.join(home, 'profiles', 'web02.json'), JSON.stringify(fw(443)));
  fs.writeFileSync(path.join(home, 'profiles', 'web03.json'), JSON.stringify(fw(6379)));
  const ab = I.makeAntibody({
    title: 'redis-exposed', signature: 'redis port open to the world',
    detector: { all: [{ path: 'firewall.allowed', op: 'any_eq', field: 'port', value: 6379 }] },
    remediation: { fix: 'ufw delete allow 6379', rollback: 'ufw allow 6379' }, confidence: 'medium',
  }, '2026-06-14T00:00:00Z');
  fs.writeFileSync(path.join(home, 'memory', 'global.jsonl'), JSON.stringify(ab) + '\n');
  return { home, ab };
}
function cli(home, ...args) {
  return spawnSync('node', [path.join(__dirname, '..', 'scripts', 'immunize.js'), ...args],
    { encoding: 'utf8', env: { ...process.env, LOGEN_HOME: home } });
}

test('immunize CLI: review -> scan (fleet + quorum) -> retire', () => {
  const { home, ab } = setupHome();

  assert.match(cli(home, 'review').stdout, new RegExp(ab.id));

  const scan = cli(home, 'scan', ab.id).stdout;
  assert.match(scan, /web01/);
  assert.match(scan, /web03/);
  assert.doesNotMatch(scan, /web02/);
  assert.match(scan, /quorum MET/); // web01 + web03 -> 2 hosts

  assert.match(cli(home, 'retire', ab.id).stdout, /retired/);
  assert.match(cli(home, 'review').stdout, /no active antibodies/);

  fs.rmSync(home, { recursive: true, force: true });
});
