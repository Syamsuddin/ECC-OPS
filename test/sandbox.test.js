'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { blastRadiusOk, isContained, wrapContainment, detectCapabilities } = require('../scripts/lib/sandbox');

test('blastRadiusOk: rejects empty/over-broad/relative, accepts narrow', () => {
  assert.equal(blastRadiusOk([]), false);
  assert.equal(blastRadiusOk('nope'), false);
  assert.equal(blastRadiusOk(['/']), false);
  assert.equal(blastRadiusOk(['/etc']), false);
  assert.equal(blastRadiusOk(['/var']), false);
  assert.equal(blastRadiusOk(['/var/www/app', '/']), false);
  assert.equal(blastRadiusOk(['relative/path']), false);
  assert.equal(blastRadiusOk(['/var/www/app']), true);
  assert.equal(blastRadiusOk(['/var/www/app', '/var/log/app']), true);
});

test('isContained: detects wrappers', () => {
  assert.equal(isContained('systemd-run --scope foo'), true);
  assert.equal(isContained('sudo logen-sandbox-helper contain op /var/www -- cmd'), true);
  assert.equal(isContained('rm -rf /var/www/old'), false);
});

test('wrapContainment: builds the helper invocation, sanitizes the unit id', () => {
  assert.equal(
    wrapContainment('rm -rf /var/www/app/old', ['/var/www/app'], 'deploy:shop'),
    'sudo logen-sandbox-helper contain deploy-shop /var/www/app -- rm -rf /var/www/app/old'
  );
});

test('detectCapabilities: returns a shaped object without throwing', () => {
  const c = detectCapabilities();
  assert.ok(c && typeof c === 'object');
  for (const k of ['container_runtime', 'namespaces', 'cow_storage', 'landlock', 'seccomp', 'microvm', 'privileged_helper']) {
    assert.ok(k in c, `missing key ${k}`);
  }
});

function runWrap(command, home) {
  return spawnSync('node', [path.join(__dirname, '..', 'scripts', 'hooks', 'ops-sandbox-wrap.js')], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, LOGEN_HOME: home },
  });
}

test('ops-sandbox-wrap: enforcement matrix', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logen-'));
  const ctx = (o) => fs.writeFileSync(path.join(home, 'op-context.json'), JSON.stringify(o));

  // containment not required -> pass through
  ctx({});
  assert.equal(runWrap('systemctl restart nginx', home).status, 0);

  // required + over-broad blast -> block
  ctx({ require_containment: true, blast_radius: ['/'] });
  assert.equal(runWrap('rm -rf /var/www/app/old', home).status, 2);

  // required + good blast + uncontained -> block (with wrapped suggestion)
  ctx({ require_containment: true, blast_radius: ['/var/www/app'], op_class: 'deploy:shop' });
  const r = runWrap('rm -rf /var/www/app/old', home);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /logen-sandbox-helper contain/);

  // required + good blast + already contained -> pass
  assert.equal(
    runWrap('sudo logen-sandbox-helper contain op /var/www/app -- rm -rf /var/www/app/old', home).status,
    0
  );

  // required via required_modes + READ command -> pass (READ never gated)
  ctx({ required_modes: ['containment'], blast_radius: ['/var/www/app'] });
  assert.equal(runWrap('df -h', home).status, 0);

  fs.rmSync(home, { recursive: true, force: true });
});

test('logen-sandbox-helper: refuses unsafe paths / ids / unknown verbs (defense-in-depth, not just the hook)', () => {
  const helper = path.join(__dirname, '..', 'tools', 'logen-sandbox-helper');
  const run = (...args) => spawnSync('bash', [helper, ...args], { encoding: 'utf8' });
  // Unsafe ReadWritePaths are refused BEFORE systemd-run (so this is testable on any OS).
  for (const bad of ['/', '/etc', '/var', '/usr', 'relative/path']) {
    assert.notEqual(run('contain', 'op', bad, '--', 'echo', 'hi').status, 0, `should refuse rw='${bad}'`);
  }
  // Invalid id (shell metacharacters) refused.
  assert.notEqual(run('contain', 'bad;id', '/var/www/app', '--', 'echo', 'hi').status, 0);
  // Unknown verb -> exit 64.
  assert.equal(run('totally-unknown-verb').status, 64);
});
