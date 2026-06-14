#!/usr/bin/env node
// PostToolUse(Bash): after a service change, verify it is active (Rule ops-verify). Advisory only.
'use strict';
const { execSync } = require('child_process');
const { readPayload } = require('../lib/state');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  const m = cmd.match(/\bsystemctl\s+(?:restart|reload|start)\s+([^\s;&|]+)/);
  if (m) {
    const svc = m[1];
    let state = 'unknown';
    try {
      state = execSync(`systemctl is-active ${svc}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) {
      state = (e && e.stdout ? String(e.stdout).trim() : '') || 'inactive';
    }
    if (state !== 'active') {
      process.stderr.write(`[LOGEN ops-verify] WARNING: ${svc} is '${state}' after the change — consider rollback.\n`);
    }
  }
  process.exit(0);
})();
