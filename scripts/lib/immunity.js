'use strict';
// ops-immunity — fleet immune system (ECC_OPS.md §XXI.3).
// An antibody is a Memory lesson (scope global) carrying a host-agnostic signature, a self-written
// DETECTOR, and a verified remediation. The detector is a small predicate over the Server Profile
// (safe, evaluable from the control side); complex computed checks may instead carry a `probe`
// (a read-only shell command the agent runs on the host). Quorum (>=2 matched hosts OR a shadow
// pass) is required to promote an antibody from "advisory" to "offer immunization".
const crypto = require('crypto');
const fs = require('fs');
const P = require('./paths');
const { writeEntry, recall } = require('./memory');

function antibodyId(title) {
  return 'ab_' + crypto.createHash('sha1').update(String(title || '')).digest('hex').slice(0, 8);
}

// Build the antibody as a Memory lesson entry (persisted via saveAntibody).
function makeAntibody(spec, nowIso) {
  return {
    id: antibodyId(spec.title),
    scope: 'global',
    type: 'lesson',
    antibody: true,
    title: spec.title,
    fact: spec.signature,                 // host-agnostic precondition, in words
    detector: spec.detector || { all: [] },
    remediation: spec.remediation || null, // { fix, rollback }
    confidence: spec.confidence || 'low',
    evidence: spec.evidence || { hosts: [], shadow_passed: false },
    status: 'active',
    created_at: nowIso || new Date().toISOString(),
    expires_at: spec.expires_at || null,
  };
}

function getPath(obj, p) {
  if (!obj || !p) return undefined;
  let cur = obj;
  for (const seg of String(p).split('.')) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function evalClause(profile, clause) {
  const v = getPath(profile, clause.path);
  switch (clause.op) {
    case 'exists': return v !== undefined && v !== null;
    case 'missing': return v === undefined || v === null;
    case 'eq': return v === clause.value;
    case 'ne': return v !== clause.value;
    case 'gt': return typeof v === 'number' && v > clause.value;
    case 'lt': return typeof v === 'number' && v < clause.value;
    case 'gte': return typeof v === 'number' && v >= clause.value;
    case 'lte': return typeof v === 'number' && v <= clause.value;
    case 'regex': return typeof v === 'string' && new RegExp(clause.value).test(v);
    case 'includes': return Array.isArray(v) && v.includes(clause.value);
    case 'any_eq': return Array.isArray(v) && v.some((el) => el && el[clause.field] === clause.value);
    case 'any_gt': return Array.isArray(v) && v.some((el) => el && typeof el[clause.field] === 'number' && el[clause.field] > clause.value);
    default: return false;
  }
}

// A structured detector matches when ALL its clauses hold. A probe-only detector returns null
// (cannot be evaluated from the control side — the agent must run it on the host).
function evaluateDetector(detector, profile) {
  if (!detector) return false;
  if (detector.probe && !(detector.all && detector.all.length)) return null;
  const clauses = detector.all || [];
  if (!clauses.length) return false;
  return clauses.every((c) => evalClause(profile, c));
}

function listHostProfiles() {
  try {
    return fs.readdirSync(P.profilesDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  } catch (_) { return []; }
}

function readProfileFor(host) {
  try { return JSON.parse(fs.readFileSync(P.profileFor(host), 'utf8')); } catch (_) { return null; }
}

// Hosts whose Server Profile carries the latent condition. probe-only detectors -> { needsProbe: hosts }.
function scanFleet(antibody) {
  const matched = [];
  const needsProbe = [];
  for (const host of listHostProfiles()) {
    const prof = readProfileFor(host);
    if (!prof) continue;
    const r = evaluateDetector(antibody.detector, prof);
    if (r === null) needsProbe.push(host);
    else if (r === true) matched.push(host);
  }
  return { matched, needsProbe };
}

// Promote advisory -> offer when >=2 hosts carry the condition OR a shadow rehearsal passed.
function quorumMet(matchedHosts, shadowPassed) {
  return (Array.isArray(matchedHosts) && matchedHosts.length >= 2) || shadowPassed === true;
}

function saveAntibody(antibody) {
  return writeEntry('global', antibody);
}

// Active antibodies = recalled global lessons flagged antibody:true.
function listAntibodies() {
  return recall(null).filter((e) => e && e.antibody === true && e.status !== 'forgotten');
}

function findAntibody(idOrTitle) {
  return listAntibodies().find((a) => a.id === idOrTitle || a.title === idOrTitle) || null;
}

module.exports = {
  antibodyId, makeAntibody, getPath, evalClause, evaluateDetector,
  listHostProfiles, readProfileFor, scanFleet, quorumMet, saveAntibody, listAntibodies, findAntibody,
};
