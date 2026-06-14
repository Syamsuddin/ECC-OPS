#!/usr/bin/env node
// SessionStart: inject a compact digest of the active host into context (ECC_OPS.md §XXII.3).
// M1 scope: active host + Server Profile summary.
// TODO(M2): add the curated Memory digest (global + host) and per-category TTL freshness evaluation.
'use strict';
const { readJSON, activeHost } = require('../lib/state');
const P = require('../lib/paths');

(async () => {
  const host = activeHost();
  let ctx;
  if (!host) {
    ctx = 'LOGEN: no active host set (~/.logen/active.json). Run /profile <host> to select one.';
  } else {
    const prof = readJSON(P.profileFor(host), null);
    if (prof) {
      const os = prof.os || {};
      const stack = prof.stack || {};
      const apps = (prof.apps || []).map((a) => a.name).join(',') || '-';
      ctx =
        `LOGEN active host: ${host} (${os.distro || '?'} ${os.version || ''}). ` +
        `profile_health=${prof.profile_health || 'unknown'}. ` +
        `web=${(stack.web_server && stack.web_server.name) || '-'} | apps=${apps}.`;
    } else {
      ctx = `LOGEN active host: ${host} — no profile yet. Run /profile refresh to discover it.`;
    }
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
    })
  );
  process.exit(0);
})();
