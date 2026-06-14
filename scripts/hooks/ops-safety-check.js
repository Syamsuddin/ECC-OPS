#!/usr/bin/env node
// PreToolUse(Bash): hard-block catastrophic commands. exit 2 = block, stderr shown to the agent.
// ECC_OPS.md §XVI / §XXII.3. This is the non-negotiable floor — it fires regardless of model reasoning.
'use strict';
const { readPayload } = require('../lib/state');
const { isCatastrophic } = require('../lib/rules');

(async () => {
  const p = await readPayload();
  const cmd = (p && p.tool_input && p.tool_input.command) || '';
  const msg = isCatastrophic(cmd);
  if (msg) {
    process.stderr.write(`[LOGEN ops-safety] BLOCKED: ${msg}\nCommand: ${cmd}\n`);
    process.exit(2); // block the tool call
  }
  process.exit(0);
})();
