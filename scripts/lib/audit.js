'use strict';
// Append-only audit writer for LOGEN (ECC_OPS.md §XVII). One JSONL record per WRITE/DESTRUCTIVE.
const fs = require('fs');
const path = require('path');
const P = require('./paths');

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (_) { /* ignore */ }
}

// Mask common secret assignments so credentials never land in the audit trail.
function maskSecrets(s) {
  return String(s).replace(/(password|secret|token|api[_-]?key|passwd)\s*[=:]\s*\S+/gi, '$1=****');
}

function appendAudit(entry) {
  ensureDir(P.auditDir);
  const host = entry.host || 'unknown';
  if (entry.command) entry.command = maskSecrets(entry.command);
  const line = JSON.stringify(entry) + '\n';
  try { fs.appendFileSync(P.auditFor(host), line, { mode: 0o600 }); } catch (_) { /* ignore */ }
  // Combined convenience log alongside the per-host file.
  try { fs.appendFileSync(path.join(P.auditDir, 'audit.jsonl'), line, { mode: 0o600 }); } catch (_) { /* ignore */ }
}

module.exports = { appendAudit, maskSecrets };
