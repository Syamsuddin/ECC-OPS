'use strict';
// Command classification for LOGEN safety hooks.
// - BLOCKED: catastrophic patterns, hard-blocked by ops-safety-check.js (exit 2). ECC_OPS.md §XVI.
// - DESTRUCTIVE / WRITE: approval-tier classification for ops-confirm-gate.js. §V / Rule ops-change-management.
// - opClass(): command -> op-class:scope key for the trust ledger and audit. §XXII.4.

const BLOCKED = [
  { re: /\bchmod\s+(-[A-Za-z]*\s+)*777\b/, msg: 'chmod 777 is never allowed (world-writable).' },
  { re: /\brm\b(?=[^|;&\n]*(?:--no-preserve-root|\s\/(?:\s|$|\*|\.|\{)))(?=[^|;&\n]*(?:-[a-z]*r|--recursive))(?=[^|;&\n]*(?:-[a-z]*f|--force))/, msg: 'rm -rf on / (incl. /*, /., /{...}) is forbidden (flag order independent).' },
  { re: /\brm\s+-[a-z]*\s+--no-preserve-root\b/, msg: 'rm --no-preserve-root is forbidden.' },
  { re: /\bufw\s+disable\b/, msg: 'ufw disable removes all firewall protection.' },
  { re: /\biptables\s+(-F|--flush)\b/, msg: 'iptables flush exposes the server.' },
  { re: /\bnft\s+flush\s+ruleset\b/, msg: 'nft flush ruleset exposes the server.' },
  { re: /DROP\s+DATABASE\b/i, msg: 'DROP DATABASE must go through DESTRUCTIVE confirmation.' },
  { re: /GRANT\s+ALL\b[\s\S]*@['"]?%/i, msg: "GRANT ALL to '%' violates least privilege." },
  { re: /\bmkfs(\.\w+)?\b/, msg: 'mkfs formats a filesystem — forbidden.' },
  { re: /\bdd\b[^\n]*\bof=\/dev\//, msg: 'dd to a block device can destroy the disk.' },
  { re: /(^|[\s;&|])(>|>>)\s*\/dev\/(sd|nvme|vd|xvd)\w*/, msg: 'Redirect to a raw block device is forbidden.' },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, msg: 'Fork bomb detected.' },
];

const DESTRUCTIVE = [
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/,
  /\brm\s+-rf?\b[^|;&]*\//,
  /\bTRUNCATE\b/i,
  /\bufw\s+disable\b/,
  /\brestore\b/i,
  /\bDROP\s+(TABLE|DATABASE)\b/i,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-z]*f/,
  /\bmkfs(\.\w+)?\b/,
  /\bdd\b[^\n]*of=\/dev\//,
  /\bshred\b/,
  /\b(reboot|shutdown|halt|poweroff)\b/,
];

const WRITE = [
  /\bsystemctl\s+(stop|disable|mask|restart|reload|start|enable)\b/,
  /\bapt(-get)?\s+(install|remove|purge|upgrade|dist-upgrade)\b/,
  /\bdnf\s+(install|remove|upgrade)\b/,
  /\bcertbot\b/,
  /\bmigrate\b/,
  /\bufw\s+(allow|deny|limit|delete|reject)\b/,
  /\bnft\b|\biptables\b/,
  /\bnpm\s+ci\b/,
  /\bcomposer\s+install\b/,
  /\bgit\s+(pull|fetch|merge|checkout|switch)\b/,
  /\b(cp|mv|ln|tee)\b/,
  /\bsed\s+-i\b/,
  /\b(chmod|chown)\b/,
];

function isCatastrophic(cmd) {
  for (const r of BLOCKED) if (r.re.test(cmd)) return r.msg;
  return null;
}

function classifyTier(cmd) {
  if (!cmd || !cmd.trim()) return 'READ';
  for (const re of DESTRUCTIVE) if (re.test(cmd)) return 'DESTRUCTIVE';
  for (const re of WRITE) if (re.test(cmd)) return 'WRITE';
  return 'READ';
}

// Best-effort command -> op-class:scope (§XXII.4). The orchestrator may override by
// writing op_class into op-context.json; this is the fallback derivation.
function opClass(cmd) {
  const c = cmd || '';
  if (/\bcertbot\b/.test(c)) return 'ssl';
  if (/\bmigrate\b/.test(c)) return 'migrate';
  const svc = c.match(/\bsystemctl\s+(?:restart|reload|start|stop)\s+([^\s;&|]+)/);
  if (svc) return 'restart:' + svc[1].replace(/\.service$/, '');
  if (/\bufw\b|\bnft\b|\biptables\b/.test(c)) return 'firewall';
  if (/\b(?:apt|apt-get|dnf)\s+(?:upgrade|install|remove|purge|dist-upgrade)/.test(c)) return 'pkg-update';
  if (/\brestore\b/i.test(c)) return 'restore';
  if (/\bDROP\b|\bTRUNCATE\b/i.test(c)) return 'db-drop';
  if (/\bgit\s+(?:pull|fetch)\b/.test(c) || /releases\//.test(c)) return 'deploy';
  return 'generic';
}

module.exports = { BLOCKED, DESTRUCTIVE, WRITE, isCatastrophic, classifyTier, opClass };
