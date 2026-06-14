'use strict';
// Server Profile cache freshness (ECC_OPS.md §IV "Cache & Invalidation Semantics").
// Per-category TTL (hours); a profile is critical_stale if a high-risk category is past TTL.
const DEFAULT_TTL_H = {
  os: 720, resources: 720, stack: 168, apps: 168,
  firewall: 24, ssl: 12, backup: 24, disks: 1,
};
const HIGH_RISK = ['ssl', 'firewall', 'disks'];

function hoursSince(iso, now) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (now - t) / 3.6e6;
}

// Returns { health: 'fresh'|'stale'|'critical_stale', stale: [...], criticalStale: [...] }.
// Categories with no checked_at (no freshness entry and no last_discovery fallback) are skipped,
// never flagged — a minimal profile is not "critically stale" just for being sparse.
function evaluateFreshness(profile, nowMs) {
  const now = nowMs || Date.now();
  const fresh = (profile && profile.freshness) || {};
  const lastDisc = profile && profile.last_discovery;
  const stale = [];
  for (const cat of Object.keys(DEFAULT_TTL_H)) {
    const entry = fresh[cat] || {};
    const checked = entry.checked_at || lastDisc;
    if (!checked) continue;
    const ttl = entry.ttl_h || DEFAULT_TTL_H[cat];
    if (hoursSince(checked, now) > ttl) stale.push(cat);
  }
  const criticalStale = stale.filter((c) => HIGH_RISK.includes(c));
  let health = 'fresh';
  if (criticalStale.length) health = 'critical_stale';
  else if (stale.length) health = 'stale';
  return { health, stale, criticalStale };
}

module.exports = { DEFAULT_TTL_H, HIGH_RISK, evaluateFreshness, hoursSince };
