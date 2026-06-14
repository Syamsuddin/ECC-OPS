#!/usr/bin/env node
// PostToolUse(Edit|Write): enforce secret-file permissions (Prinsip 5).
//   .env / secrets  -> 640 (owner deploy:www-data, group www-data read for runtime; never world-readable)
//   TLS private keys -> 600 (root only)
'use strict';
const fs = require('fs');
const { readPayload } = require('../lib/state');

(async () => {
  const p = await readPayload();
  const fp = (p && p.tool_input && p.tool_input.file_path) || '';
  try {
    if (/\.(pem|key)$/i.test(fp)) {
      fs.chmodSync(fp, 0o600);
    } else if (/(^|\/)\.env(\.|$)|(^|\/)secrets?\//i.test(fp)) {
      fs.chmodSync(fp, 0o640);
    }
  } catch (_) {
    /* file may not exist yet or perms may be managed elsewhere */
  }
  process.exit(0);
})();
