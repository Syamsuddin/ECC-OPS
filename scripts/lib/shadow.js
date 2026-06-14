'use strict';
// ops-shadow rehearsal records (ECC_OPS.md §XXI.2, §XXII.8).
// A rehearsal pass is keyed by op_hash = sha1(host + normalized command) and stored per host in
// ~/.logen/shadow/<host>.jsonl. A record only authorizes the gate while it is fresh (within ttl_s)
// and its fidelity is T1 or T2 — T0 (logic-only) never authorizes (the design's hard red line).
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');
const P = require('./paths');

const TTL_S = 1800; // 30 min

function opHash(command, host) {
  const norm = String(command || '').trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha1').update(`${host || ''}\n${norm}`).digest('hex').slice(0, 16);
}

// Map a planned command to a native T1 dry-run validator (real binary validates the plan, no infra).
// Returns { argv, tier } (argv runs via execFileSync — NO shell, so nothing in the command can inject)
// or null when nothing safe applies (caller treats null as T0 advisory).
function selectValidator(command) {
  const c = command || '';
  // Command-verb patterns first (a package op that merely names "nginx" is still a package op).
  if (/\b(apt|apt-get)\s+install\b/.test(c)) {
    // Extract package args after `install` and keep ONLY safe package-name tokens — anything with a
    // shell metacharacter is dropped (so an injected `foo$(...)` yields no validator -> T0).
    const after = c.replace(/^.*\b(?:apt|apt-get)\s+install\b/, '').trim();
    const pkgs = after.split(/\s+/).filter((t) => /^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(t));
    return pkgs.length ? { argv: ['apt-get', 'install', '-s', ...pkgs], tier: 'T1' } : null;
  }
  if (/\bcomposer\s+install\b/.test(c)) return { argv: ['composer', 'validate'], tier: 'T1' };
  if (/\bvisudo\b|sudoers/.test(c)) return { argv: ['visudo', '-cf', '/etc/sudoers'], tier: 'T1' };
  // Config/service patterns.
  if (/\bsshd\b/.test(c) || /sshd_config/.test(c)) return { argv: ['sshd', '-t'], tier: 'T1' };
  if (/\bnginx\b/.test(c) || /\/etc\/nginx\//.test(c)) return { argv: ['nginx', '-t'], tier: 'T1' };
  if (/\b(apachectl|apache2|httpd)\b/.test(c) || /\/etc\/(apache2|httpd)\//.test(c)) return { argv: ['apachectl', 'configtest'], tier: 'T1' };
  if (/\bnamed\b|\bbind9?\b/.test(c) || /named\.conf/.test(c)) return { argv: ['named-checkconf'], tier: 'T1' };
  return null;
}

function writeRecord(host, record) {
  try { fs.mkdirSync(P.shadowDir, { recursive: true, mode: 0o700 }); } catch (_) { /* ignore */ }
  try { fs.appendFileSync(P.shadowFor(host || 'unknown'), JSON.stringify(record) + '\n', { mode: 0o600 }); } catch (_) { /* ignore */ }
}

function readRecords(host) {
  let raw;
  try { raw = fs.readFileSync(P.shadowFor(host || 'unknown'), 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch (_) { /* skip */ }
  }
  return out;
}

// Newest fresh, passing T1/T2 record for this exact command+host, else null.
function findFreshPass(host, command, nowMs) {
  const now = nowMs || Date.now();
  const h = opHash(command, host);
  let best = null;
  for (const r of readRecords(host)) {
    if (r.op_hash !== h || !r.passed) continue;
    if (r.shadow_fidelity !== 'T1' && r.shadow_fidelity !== 'T2') continue;
    if (now - Date.parse(r.rehearsed_at) >= (r.ttl_s || TTL_S) * 1000) continue;
    if (!best || Date.parse(r.rehearsed_at) > Date.parse(best.rehearsed_at)) best = r;
  }
  return best;
}

// Run the T1 validator for a planned command and persist the outcome. T0 (no validator) is recorded
// but never sets a pass that the gate honors.
function rehearse(host, command, nowIso) {
  const sel = selectValidator(command);
  let fidelity = 'T0';
  let passed = false;
  let detail = 'no native validator — advisory (T0) only';
  if (sel) {
    fidelity = sel.tier;
    const shown = sel.argv.join(' ');
    try {
      execFileSync(sel.argv[0], sel.argv.slice(1), { stdio: ['ignore', 'ignore', 'pipe'], timeout: 10000 });
      passed = true;
      detail = `${shown}: ok`;
    } catch (_) {
      passed = false;
      detail = `${shown}: FAILED`;
    }
  }
  const record = {
    op_hash: opHash(command, host),
    command,
    host: host || null,
    shadow_fidelity: fidelity,
    passed,
    rehearsed_at: nowIso || new Date().toISOString(),
    ttl_s: TTL_S,
    detail,
  };
  writeRecord(host, record);
  return record;
}

module.exports = { TTL_S, opHash, selectValidator, writeRecord, readRecords, findFreshPass, rehearse };
