# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is **not a runnable codebase** — it is a single design specification: [ECC_OPS.md](ECC_OPS.md) ("ECC-Ops — AI Sysadmin Agent", Desain Lengkap v2.0). The directory contains only that document (~6,600 lines) plus this file. There is no `package.json`, build, lint, or test toolchain, and it is not a git repository.

The document specifies a **standalone AI sysadmin agent** (a self-contained Claude Code plugin) that operates Linux servers end-to-end: blank-server provisioning → web server / DNS / SSL → web app deployment → debugging → proactive monitoring → security hardening / firewall → backup/restore → incident response. It is fully independent — it must **not** reference any external "DEV" tooling, a DEV/OPS split, coding skills/agents, or an `npx ecc`/marketplace umbrella product. Treat ECC_OPS.md as the source of truth; edits here are edits to the design.

When you implement from this spec, the artifacts described become files in a plugin tree (`skills/`, `agents/`, `commands/`, `rules/`, `scripts/hooks/`, `hooks/hooks.json`) plus a control-side state dir (`~/.ecc-ops/profiles/`, audit log). This repo currently holds only the design.

## Working in this repo

- The primary deliverable is prose + embedded artifact definitions. Edit [ECC_OPS.md](ECC_OPS.md) directly.
- **Bilingual convention (preserve it):** narrative, explanations, and document section headings (`## I. …`) are **Indonesian**; artifact *contents* (SKILL.md frontmatter+body, subagent/command definitions, rules, shell/config/SQL code, code comments) are **English**.
- **Fence convention (critical):** every artifact (SKILL.md, subagent, command, rule) is embedded inside a **4-backtick** ` ````markdown … ```` ` wrapper so the **3-backtick** ` ```bash `/` ```nginx `/etc. blocks inside it nest correctly. When adding or editing an artifact, keep the outer wrapper at 4 backticks and inner code blocks at 3 — mismatching this breaks Markdown rendering across the whole section.
- There are no tests. "Validation" = internal consistency: the registry below, the file map (§XVIII), and the actual artifact sections must agree on names and counts.

## Registry (counts must stay in sync across the doc)

- **28 skills** (`skills/<name>/SKILL.md`; frontmatter `name`, `description`, `version`): `ops-server-core`, `ops-discovery`, `ops-memory`, `ops-webserver`, `ops-dns`, `ops-ssl`, `ops-database`, `ops-deploy`, `ops-secrets`, `ops-firewall`, `ops-security-hardening`, `ops-intrusion-detection`, `ops-backup`, `ops-monitoring`, `ops-log-management`, `ops-performance`, `ops-incident-response`, `ops-update-patch`, intelligence layer `ops-sandbox`, `ops-shadow`, `ops-immunity`, `ops-trust` (§XXI), and runtimes `ops-runtime-{php,node,python,go,java}`, `ops-containers`.
- **9 subagents** (`agents/<name>.md`; frontmatter `name`, `description`, `tools`, `model`): `server-provisioner` (the only one with `Write`/`Edit`), `deploy-operator`, `security-auditor`, `ops-troubleshooter`, `backup-operator`, `performance-tuner`, `incident-responder`, `monitoring-sentinel`, `immunity-synthesizer` (§XXI, read-only). Diagnostic/operator agents get `["Read","Bash"]` (read-first, least privilege). **Models are tiered (§III "Model Tiering"):** `haiku` for `monitoring-sentinel`; `opus` for `ops-troubleshooter` and `incident-responder`; `sonnet` for the rest. Orchestrator uses the session model; dynamic escalation to `opus` on P1/P2.
- **24 commands** (`commands/<name>.md`; frontmatter `description`): `/server-setup`, `/profile`, `/memory`, `/deploy`, `/rollback`, `/dns-setup`, `/ssl-setup`, `/firewall`, `/security-audit`, `/harden`, `/health-check`, `/monitor`, `/backup`, `/restore`, `/troubleshoot`, `/perf-tune`, `/logs`, `/update`, `/incident`, `/ops-doctor`, `/shadow`, `/immunize`, `/trust`, `/sandbox` (last four §XXI).
- **3 rules** (`rules/*.md`, no frontmatter): `ops-safety`, `ops-verify`, `ops-change-management`.
- **8 hooks** (`scripts/hooks/*.js` wired in `hooks/hooks.json`): `ops-context-load.js` (SessionStart — loads Profile+Memory digest, evaluates per-category TTL freshness §IV), `ops-safety-check.js`, `ops-confirm-gate.js`, `ops-post-verify.js`, `ops-env-protect.js`, `ops-audit-log.js`, `ops-shadow-gate.js` (§XXI), `ops-sandbox-wrap.js` (§XXI).

## Architecture (the four pillars that make it "intelligent")

1. **Orchestrator / Brain** — the top-level agent persona (not a subagent file). It triages each request, loads the Server Profile, routes to specialist subagents, enforces the approval tiers, and records every change to the audit trail.
2. **Server Profile + Operator Memory** — two complementary persistent stores read at session start. The **Server Profile** (`~/.ecc-ops/profiles/<host>.json`) is auto-discovered per-host state: OS, resources, stack, apps (domain/path/repo/deploy method/service), firewall posture, SSL certs+expiry, backup config, monitoring, last audit — schema-strict, refreshed (and overwritten) by the `ops-discovery` skill. The **Operator/Knowledge Memory** (`~/.ecc-ops/memory/{global,<host>}.jsonl`, managed by the `ops-memory` skill + `/memory` command) is the curated, free-form counterpart that discovery can't find and must never overwrite: operator identity, standing instructions, preferences, and lessons learned — the ODIN-style `memory_*` equivalent. Recall/write/forget/digest; writes are WRITE-tier (gated + audited) and never hold secrets.
3. **Three-tier approval system** — READ (auto), WRITE (single confirm + show impact + provide rollback), DESTRUCTIVE (double-confirm + verify a backup exists). Enforced by `ops-confirm-gate.js` + `ops-safety-check.js`.
4. **Audit trail & change management** — every WRITE appends a JSON entry (who/what/when/why + rollback command) via `ops-audit-log.js`.

**Advanced intelligence layer (§XXI, additive):** a shared isolation broker `ops-sandbox` (two modes — *rehearsal* off-prod for evidence, *containment* on-prod to bound blast radius) under a trilogy: `ops-shadow` (pre-action twin verification, 3 fidelity tiers T0/T1/T2), `ops-immunity` (fleet immune system — a resolved incident becomes a self-written detector + preventive remediation propagated fleet-wide as a Memory `lesson` antibody), and `ops-trust` (calibrated autonomy — the static tiers become an adaptive per-op-class ledger driven by counterfactual analysis of the audit trail). It only ever *strengthens* the safety model — non-negotiable design constants: T0 logic never sets `shadow_verified`; true DESTRUCTIVE ops are never auto-promotable; a sandbox/rehearsal pass alone never loosens autonomy; fleet immunization is per-host confirmed. State piggybacks existing stores (`autonomy_ledger` + `sandbox_capabilities` are Server Profile fields; antibodies are `ops-memory` entries) — no new top-level store except an ephemeral `~/.ecc-ops/sandbox/` workdir.

**Inter-component wiring (§XXII Runtime Contracts):** hooks are isolated processes that get only the tool payload, so context lives in control-side files every hook reads — `~/.ecc-ops/active.json` (the **active host** + operator, read first by every hook and at SessionStart; resolution order `ECC_OPS_HOST` env → `active.json.host`) and `op-context.json` (the orchestrator→gate→audit handoff: `op_class`, `actor`, `reason`, `pre_state_ref`, `rollback_cmd`, `blast_radius`). Shadow-rehearsal passes live in `~/.ecc-ops/shadow/<session>.jsonl` (TTL 1800s). Blocking PreToolUse hooks use **exit 2** (not 1). Ledger writers are single-owner: `ops-audit-log.js` writes prod evidence + demotion; `/shadow` writes rehearsal evidence; `/trust approve` applies promotions.

## The nine design principles (referenced by number throughout, e.g. "Principle 7")

1. Stack-agnostic (detect, then adapt) · 2. Read-first (diagnosis is read-only) · 3. Rollback-ready (every write saves a restore point) · 4. Idempotent · 5. Defense-in-depth · 6. Stateful & context-aware (Server Profile) · 7. Auditable · 8. Confirm-before-harm (the tiers) · 9. Server mirrors source (app code changes only via VCS/deploy; non-code files like `.env`/nginx/systemd may be set directly).

## Non-negotiable safety rules (any ops code you generate or run must respect these)

- **Never `chmod 777`** on production. Standard perms: `.env` **640** (owner `deploy:www-data`, group www-data read for runtime; never world-readable), code 644 / dirs 755, backups 600 / dir 700.
- **Never expose DB ports** (3306/5432/6379/27017) publicly; bind `127.0.0.1`, use SSH tunnels for remote access.
- **App DB users get `SELECT,INSERT,UPDATE,DELETE` only**, `@'localhost'`; a separate migration user holds DDL. Never `GRANT ALL`, never root for app connections.
- **Backups only in `/var/backups/<app>/`** (700), never in any webroot — dumps contain PII and password hashes.
- **Credentials only in `.env` (640, owner `deploy:www-data`) or a secret manager** — never in scripts, logs, terminal output, or git.
- **Deploy must not discard untracked work** — prefer `git fetch` + fast-forward over a blind `git reset --hard`; always save the previous commit and a DB backup first, and confirm before destructive ops (`rm -rf`, `DROP`/`TRUNCATE`, `systemctl stop/disable`, `ufw disable`).
- **Test a new SSH session before disabling root login or restarting sshd.**
