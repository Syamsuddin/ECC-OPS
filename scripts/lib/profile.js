'use strict';
// Server Profile read/write (ECC_OPS.md §IV). The autonomy_ledger (§XXI.4) lives inside the profile.
const fs = require('fs');
const P = require('./paths');

function readProfile(host) {
  try { return JSON.parse(fs.readFileSync(P.profileFor(host), 'utf8')); } catch (_) { return null; }
}

function writeProfile(host, obj) {
  try { fs.mkdirSync(P.profilesDir, { recursive: true, mode: 0o700 }); } catch (_) { /* ignore */ }
  try { fs.writeFileSync(P.profileFor(host), JSON.stringify(obj, null, 2), { mode: 0o600 }); return true; }
  catch (_) { return false; }
}

module.exports = { readProfile, writeProfile };
