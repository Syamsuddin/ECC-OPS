'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isCatastrophic, classifyTier, opClass } = require('../scripts/lib/rules');

test('catastrophic commands are hard-blocked', () => {
  const cases = [
    'chmod 777 /var/www',
    'rm -rf --no-preserve-root /',
    'rm -fr /',
    'rm -rf /*',
    'rm -rf /.',
    'rm -rf /{bin,etc}',
    'ufw disable',
    'iptables -F',
    'nft flush ruleset',
    'mkfs.ext4 /dev/sda1',
    'dd if=/dev/zero of=/dev/sda bs=1M',
    'DROP DATABASE app',
    ':(){ :|:& };:',
  ];
  for (const c of cases) assert.ok(isCatastrophic(c), `should block: ${c}`);
});

test('safe commands are not blocked', () => {
  const cases = [
    'ls -la',
    'systemctl status nginx',
    'df -h',
    'chmod 640 /var/www/app/.env',
    'git pull --ff-only',
    'nginx -t',
    'rm -rf /var/www/old', // a specific path is DESTRUCTIVE-tier, not hard-blocked
  ];
  for (const c of cases) assert.equal(isCatastrophic(c), null, `should allow: ${c}`);
});

test('tier classification (READ/WRITE/DESTRUCTIVE)', () => {
  assert.equal(classifyTier(''), 'READ');
  assert.equal(classifyTier('systemctl status nginx'), 'READ');
  assert.equal(classifyTier('df -h'), 'READ');
  assert.equal(classifyTier('systemctl restart nginx'), 'WRITE');
  assert.equal(classifyTier('apt-get install nginx'), 'WRITE');
  assert.equal(classifyTier('certbot renew'), 'WRITE');
  assert.equal(classifyTier('php artisan migrate'), 'WRITE');
  assert.equal(classifyTier('rm -rf /var/www/old'), 'DESTRUCTIVE');
  assert.equal(classifyTier('TRUNCATE TABLE users'), 'DESTRUCTIVE');
  assert.equal(classifyTier('git reset --hard origin/main'), 'DESTRUCTIVE');
  assert.equal(classifyTier('ufw disable'), 'DESTRUCTIVE');
});

test('op-class derivation (§XXII.4)', () => {
  assert.equal(opClass('certbot certonly -d a.com'), 'ssl');
  assert.equal(opClass('systemctl reload nginx'), 'restart:nginx');
  assert.equal(opClass('systemctl restart php8.3-fpm.service'), 'restart:php8.3-fpm');
  assert.equal(opClass('ufw allow 443/tcp'), 'firewall');
  assert.equal(opClass('php artisan migrate --force'), 'migrate');
  assert.equal(opClass('apt-get upgrade -y'), 'pkg-update');
  assert.equal(opClass('mysql app < restore.sql && echo restore'), 'restore');
  assert.equal(opClass('git pull --ff-only'), 'deploy');
  assert.equal(opClass('echo hello'), 'generic');
});
