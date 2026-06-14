'use strict';
// ops-sandbox broker primitives (ECC_OPS.md §XXI.1, §XXII.7–10).
// Containment-mode helpers (M4): capability detection, blast-radius validation, and the
// systemd-run/helper wrapping used by ops-sandbox-wrap.js. Rehearsal mode arrives in M5.
const { execSync } = require('child_process');

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
  } catch (_) {
    return '';
  }
}

// §XXII.9 capability probe -> Server Profile.sandbox_capabilities. Best-effort; never throws.
// On non-Linux hosts most probes return empty -> the corresponding capability stays null/false
// and ops-sandbox degrades honestly (reports reduced fidelity rather than faking it).
function detectCapabilities() {
  const caps = {
    container_runtime: null,
    namespaces: [],
    cow_storage: null,
    landlock: false,
    seccomp: false,
    microvm: null,
    privileged_helper: null,
  };
  if (sh('command -v podman')) caps.container_runtime = 'podman';
  else if (sh('command -v docker')) caps.container_runtime = 'docker';

  const maxUserns = sh('cat /proc/sys/user/max_user_namespaces 2>/dev/null');
  if (maxUserns && Number(maxUserns) > 0) caps.namespaces = ['mnt', 'net', 'pid', 'user'];

  const fstype = sh('findmnt -no FSTYPE / 2>/dev/null');
  const lvattr = sh('lvs --noheadings -o lv_attr 2>/dev/null');
  if (/zfs|btrfs/.test(fstype)) caps.cow_storage = { type: fstype };
  else if (/^\s*t/m.test(lvattr)) caps.cow_storage = { type: 'lvm-thin' };

  const rel = sh('uname -r');
  const m = rel.match(/^(\d+)\.(\d+)/);
  if (m && (Number(m[1]) > 5 || (Number(m[1]) === 5 && Number(m[2]) >= 13))) caps.landlock = true;

  if (/Seccomp/.test(sh('grep Seccomp /proc/self/status 2>/dev/null'))) caps.seccomp = true;
  if (sh('test -e /dev/kvm && echo yes') === 'yes') caps.microvm = 'kvm';

  const helper = sh('command -v logen-sandbox-helper');
  if (helper) caps.privileged_helper = helper;
  return caps;
}

// A declared blast radius must be a non-empty list of absolute paths, none of which is a
// whole-system root. This is what makes containment meaningful (§XXII.7).
const DANGEROUS_BLAST = new Set(['/', '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/var', '/root', '/home', '/dev', '/proc', '/sys', '']);

function blastRadiusOk(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return false;
  for (const p of paths) {
    if (typeof p !== 'string' || !p.startsWith('/')) return false;
    const norm = p.replace(/\/+$/, '') || '/';
    if (DANGEROUS_BLAST.has(norm)) return false;
  }
  return true;
}

function isContained(cmd) {
  return /\b(systemd-run|logen-sandbox-helper\s+contain|bwrap|firejail)\b/.test(cmd || '');
}

// Build the containment invocation: the non-root agent calls the root-owned helper, which runs
// the command in a systemd-run scope restricted to ReadWritePaths=<blast_radius> (§XXII.10).
function wrapContainment(cmd, paths, id) {
  const rw = (paths || []).join(',');
  const unit = String(id || 'op').replace(/[^a-zA-Z0-9]/g, '-');
  return `sudo logen-sandbox-helper contain ${unit} ${rw} -- ${cmd}`;
}

module.exports = { detectCapabilities, blastRadiusOk, isContained, wrapContainment };
