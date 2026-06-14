'use strict';
// Shared state access for LOGEN hooks (ECC_OPS.md §XXII.1–2).
// Hooks are isolated processes that receive only the tool payload on stdin; host/operation
// context lives in control-side files that every hook reads through these helpers.
const fs = require('fs');
const P = require('./paths');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback === undefined ? null : fallback;
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(data); } };
    try {
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      // Guard: never hang a hook if stdin stays open with no EOF.
      const t = setTimeout(finish, 2000);
      if (t.unref) t.unref();
    } catch (_) {
      finish();
    }
  });
}

async function readPayload() {
  try {
    return JSON.parse((await readStdin()) || '{}');
  } catch (_) {
    return {};
  }
}

// §XXII.2 host-resolution order: LOGEN_HOST env wins, else active.json.host.
function activeHost() {
  if (process.env.LOGEN_HOST) return process.env.LOGEN_HOST;
  const a = readJSON(P.activeFile, {});
  return a && a.host ? a.host : null;
}

function active() {
  return readJSON(P.activeFile, {}) || {};
}

function opContext() {
  return readJSON(P.opContextFile, {}) || {};
}

module.exports = { readJSON, readStdin, readPayload, activeHost, active, opContext };
