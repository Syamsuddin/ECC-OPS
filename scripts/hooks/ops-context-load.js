#!/usr/bin/env node
// SessionStart: inject a compact digest of the active host into context (ECC_OPS.md §XXII.3 / §IV).
// Loads: active host -> Server Profile summary + per-category freshness/TTL (profile_health) +
// curated operator Memory digest (global + host). This realizes Principle 6 and the persona doctrine
// "Remembered, not re-asked".
'use strict';
const { readJSON, activeHost } = require('../lib/state');
const { evaluateFreshness } = require('../lib/freshness');
const { digest } = require('../lib/memory');
const P = require('../lib/paths');

(async () => {
  const host = activeHost();
  const lines = [];

  if (!host) {
    lines.push('LOGEN: no active host set (~/.logen/active.json). Run /profile <host> to select one.');
  } else {
    const prof = readJSON(P.profileFor(host), null);
    if (prof) {
      const os = prof.os || {};
      const stack = prof.stack || {};
      const apps = (prof.apps || []).map((a) => a.name).join(', ') || '-';
      const fr = evaluateFreshness(prof);
      lines.push(`LOGEN active host: ${host} (${os.distro || '?'} ${os.version || ''}).`);
      lines.push(`stack: web=${(stack.web_server && stack.web_server.name) || '-'} | apps=${apps}`);
      lines.push(`profile_health=${fr.health}` + (fr.stale.length ? ` (stale: ${fr.stale.join(',')})` : ''));
      if (fr.criticalStale.length) {
        lines.push(`! critical_stale: ${fr.criticalStale.join(',')} — run /profile refresh before related ops.`);
      }
    } else {
      lines.push(`LOGEN active host: ${host} — no profile yet. Run /profile refresh to discover it.`);
    }
  }

  const mem = digest(host, 8);
  if (mem) lines.push('operator memory:\n' + mem);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
    })
  );
  process.exit(0);
})();
