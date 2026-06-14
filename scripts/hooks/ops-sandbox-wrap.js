#!/usr/bin/env node
// PreToolUse(Bash): wrap WRITE/DESTRUCTIVE in containment matching op-context.blast_radius.
// ECC_OPS.md §XXI.5 / §XXII.7.
//
// TODO(M4): for ops whose policy demands containment, rewrite the command to run inside
//   `systemd-run --scope -p ProtectSystem=strict -p ReadWritePaths=<blast_radius> -p NoNewPrivileges=yes`
//   (or a Landlock wrapper) and set contained=true in op-context.json. If blast_radius is missing or
//   over-broad -> exit 2 and ask the orchestrator to declare it.
// Until M4 lands this is a safe pass-through.
'use strict';
process.exit(0);
