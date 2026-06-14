'use strict';
// ops-trust calibrated autonomy ledger (ECC_OPS.md §XXI.4, §XXII.5).
// Each op-class:scope is a Beta(alpha,beta) with prior Beta(1,1). Evidence updates it, weighted by
// fidelity (prod 1.0 / T2 0.30 / T1 0.15 / T0 0.0). Promotion is PROPOSED only — applied by human
// /trust approve; demotion is automatic and instant on any prod failure. DESTRUCTIVE is never promotable.
const { lowerBound } = require('./beta');
const { readProfile, writeProfile } = require('./profile');

// design constants (must NOT be relaxed at runtime — §XXI.4 red lines)
const WEIGHTS = { prod: 1.0, T2: 0.30, T1: 0.15, T0: 0.0 };
const PROMOTE_P5 = 0.95;          // 5th-percentile lower bound of Beta
const PROMOTE_MIN_PROD = 20;      // real prod successes floor -> rehearsal alone can never promote
const PROBATION_PROD = 10;        // fresh prod successes required after a failure before re-proposing
const FAILURE_WINDOW_DAYS = 90;

function newEntry() {
  return {
    alpha: 1, beta: 1, success: 0, failed: 0, rolled_back: 0,
    last_failure: null, evidence: { prod: 0, rehearsal: 0 },
    current_tier: 'WRITE', proposed_tier: null,
    required_modes: [], probation_until_prod: 0,
  };
}

function norm(entry) {
  const e = Object.assign(newEntry(), entry || {});
  e.evidence = Object.assign({ prod: 0, rehearsal: 0 }, e.evidence);
  return e;
}

// Apply one outcome. ev = {source:'prod', result:'success'|'failed'|'rolled_back'} or {source:'rehearsal', fidelity:'T1'|'T2'|'T0'}.
function applyEvidence(entry, ev, nowIso) {
  const e = norm(entry);
  if (ev.source === 'prod') {
    if (ev.result === 'success') {
      e.alpha += WEIGHTS.prod; e.success++; e.evidence.prod++;
    } else {
      e.beta += WEIGHTS.prod;
      if (ev.result === 'rolled_back') e.rolled_back++; else e.failed++;
      e.last_failure = nowIso || new Date().toISOString();
      e.current_tier = 'WRITE';            // instant demotion
      e.proposed_tier = null;
      e.probation_until_prod = e.success + PROBATION_PROD;
    }
  } else if (ev.source === 'rehearsal') {
    e.alpha += WEIGHTS[ev.fidelity] || 0;
    e.evidence.rehearsal++;
  }
  return e;
}

function p5(entry) {
  const e = norm(entry);
  return lowerBound(e.alpha, e.beta, 0.05);
}

function daysSince(iso, now) {
  if (!iso) return Infinity;
  return (now - Date.parse(iso)) / 86400000;
}

// Returns the tier to PROPOSE ('auto-with-notify') or null. Never promotes DESTRUCTIVE classes.
function recommendTier(entry, opts, nowMs) {
  const e = norm(entry);
  opts = opts || {};
  const now = nowMs || Date.now();
  if (opts.destructive) return null;
  if (e.success < (e.probation_until_prod || 0)) return null; // probation
  const modesOk = !(e.required_modes || []).length ||
    (Array.isArray(opts.satisfiedModes) && e.required_modes.every((m) => opts.satisfiedModes.includes(m)));
  const noRecentFailure = daysSince(e.last_failure, now) > FAILURE_WINDOW_DAYS;
  if (p5(e) >= PROMOTE_P5 && e.evidence.prod >= PROMOTE_MIN_PROD && noRecentFailure && modesOk) {
    return 'auto-with-notify';
  }
  return null;
}

// The tier the confirm-gate enforces. Promotion only takes effect after approve().
function effectiveTier(entry) {
  return norm(entry).current_tier || 'WRITE';
}

function approve(entry) {
  const e = norm(entry);
  if (e.proposed_tier) { e.current_tier = e.proposed_tier; e.proposed_tier = null; }
  return e;
}

function demote(entry) {
  const e = norm(entry);
  e.current_tier = 'WRITE';
  e.proposed_tier = null;
  return e;
}

// --- profile-backed persistence (autonomy_ledger lives in ~/.logen/profiles/<host>.json) ---
function getEntry(host, opClass) {
  const prof = readProfile(host) || {};
  const led = prof.autonomy_ledger || {};
  return norm(led[opClass]);
}

function setEntry(host, opClass, entry) {
  const prof = readProfile(host) || {};
  prof.autonomy_ledger = prof.autonomy_ledger || {};
  prof.autonomy_ledger[opClass] = entry;
  return writeProfile(host, prof);
}

module.exports = {
  WEIGHTS, PROMOTE_P5, PROMOTE_MIN_PROD, PROBATION_PROD, FAILURE_WINDOW_DAYS,
  newEntry, applyEvidence, p5, recommendTier, effectiveTier, approve, demote,
  getEntry, setEntry,
};
