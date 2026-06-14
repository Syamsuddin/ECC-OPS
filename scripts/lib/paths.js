'use strict';
// LOGEN control-side paths (ECC_OPS.md §XVIII / §XXII.1).
// Override root with LOGEN_HOME (useful for tests / non-default installs).
const os = require('os');
const path = require('path');

const HOME = process.env.LOGEN_HOME || path.join(os.homedir(), '.logen');

module.exports = {
  HOME,
  activeFile: path.join(HOME, 'active.json'),       // active host context (§XXII.1) — read first by every hook
  opContextFile: path.join(HOME, 'op-context.json'), // current operation handoff (§XXII.1)
  profilesDir: path.join(HOME, 'profiles'),
  memoryDir: path.join(HOME, 'memory'),
  auditDir: path.join(HOME, 'audit'),
  shadowDir: path.join(HOME, 'shadow'),
  sandboxDir: path.join(HOME, 'sandbox'),
  profileFor: (host) => path.join(HOME, 'profiles', `${host}.json`),
  auditFor: (host) => path.join(HOME, 'audit', `${host}.jsonl`),
  memoryGlobal: path.join(HOME, 'memory', 'global.jsonl'),
  memoryFor: (host) => path.join(HOME, 'memory', `${host}.jsonl`),
  shadowFor: (session) => path.join(HOME, 'shadow', `${session}.jsonl`),
};
