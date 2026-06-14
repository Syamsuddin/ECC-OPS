'use strict';
// Operator & Knowledge Memory recall (ECC_OPS.md §IV). Append-only JSONL with tombstones.
// recall() collapses to the latest active entry per (scope,title), dropping forgotten/expired ones.
const fs = require('fs');
const P = require('./paths');

function readJsonl(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch (_) { /* skip malformed line */ }
  }
  return out;
}

const CONF_RANK = { high: 3, medium: 2, low: 1 };

// Newest line per (scope,title) wins (append-only => latest state). Drop tombstones + expired.
function activeEntries(entries, nowMs) {
  const now = nowMs || Date.now();
  const byKey = new Map();
  for (const e of entries) {
    if (!e || !e.title) continue;
    byKey.set(`${e.scope || 'global'}::${e.title}`, e);
  }
  const out = [];
  for (const e of byKey.values()) {
    if (e.status === 'forgotten') continue;
    if (e.expires_at && Date.parse(e.expires_at) <= now) continue;
    out.push(e);
  }
  return out;
}

// Active memory for the session: global + the active host's file, ranked
// (standing instructions first, then by confidence).
function recall(host, nowMs) {
  const global = readJsonl(P.memoryGlobal);
  const perHost = host ? readJsonl(P.memoryFor(host)) : [];
  const active = activeEntries(global.concat(perHost), nowMs);
  active.sort((a, b) => {
    const ta = a.type === 'instruction' ? 1 : 0;
    const tb = b.type === 'instruction' ? 1 : 0;
    if (tb !== ta) return tb - ta;
    return (CONF_RANK[b.confidence] || 0) - (CONF_RANK[a.confidence] || 0);
  });
  return active;
}

function digest(host, limit, nowMs) {
  const entries = recall(host, nowMs).slice(0, limit || 8);
  if (!entries.length) return '';
  return entries.map((e) => `• [${e.type || 'note'}] ${e.title}: ${e.fact}`).join('\n');
}

module.exports = { readJsonl, activeEntries, recall, digest };
