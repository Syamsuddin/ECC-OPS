---
name: ops-memory
description: Persist and recall durable operator knowledge — operator identity, standing instructions, preferences, and lessons learned — across sessions, separate from and never overwritten by the auto-discovered Server Profile.
version: 1.0
---

# Operator & Knowledge Memory

The Server Profile records *what a host is* — auto-discovered, schema-strict, and
overwritten by `ops-discovery` on every refresh. This skill manages the complementary
store: *durable knowledge discovery can never find* — who the operator is and how they
want to be served, standing instructions, preferences, and lessons learned from
incidents. It is free-form, curated, and MUST NEVER be clobbered by discovery, which is
exactly why it lives in its own store.

## Store layout (control side)

```text
~/.logen/memory/
  global.jsonl        # scope "global": operator | instruction | preference | reference
  <host>.jsonl        # scope "host:<host>": host-specific lessons & quirks
```

Append-only JSONL, one entry per line — `grep`/`jq`-friendly and atomic to append,
mirroring the audit store. `forget` writes a tombstone instead of deleting in place;
`digest` compacts.

## Entry schema

```json
{
  "id": "mem_2f9c1a",
  "scope": "global",
  "type": "instruction",
  "title": "deploy-no-hard-reset",
  "fact": "Deploy app X only via git fetch + fast-forward and a service restart.",
  "why": "A blind `git reset --hard` would discard untracked work on the server.",
  "tags": ["deploy", "core"],
  "confidence": "high",
  "source": "operator",
  "created_at": "2026-06-09T04:10:00Z",
  "updated_at": "2026-06-09T04:10:00Z",
  "expires_at": null,
  "status": "active",
  "links": []
}
```

- `type`: `operator` | `instruction` | `preference` | `lesson` | `reference`
- `status`: `active` | `forgotten`   ·   `confidence`: `high` | `medium` | `low`
- `scope`: `global` (whole fleet) | `host:<host>` (one host)

## Operations

### recall (READ)
- At session start the orchestrator loads `global.jsonl` plus the target host's file,
  keeps `status=active` and unexpired entries, ranks them by scope match -> tag overlap
  -> confidence, and injects a compact digest into context. This is the LOGEN
  equivalent of an auto-loaded memory block.
- On demand: `recall <query>` filters by tag or text.

### write (WRITE)
- Capture a durable fact when the operator states a preference or standing order, or
  after an incident yields a lesson worth keeping.
- Dedup FIRST: if an active entry with the same `scope`+`title` exists, UPDATE it (bump
  `updated_at`) instead of appending a duplicate.
- WRITE tier: show the proposed entry, take one confirmation, append, and record it to
  the audit trail like any other change.
- NEVER store secrets, credentials, tokens, password hashes, or PII. Memory holds
  intent and knowledge, not data (see rule `ops-safety` — non-negotiable).

### forget (WRITE)
- Append a tombstone (`status: forgotten`, referencing the target `id`) so the change is
  auditable; the entry stops being recalled immediately.
- Use when an instruction is retired or a fact proved wrong.

### digest (READ -> WRITE on compaction)
- Summarize active memory into the compact recall block. On compaction, drop
  forgotten/expired entries, merge redundant ones, and rewrite the file (a WRITE).

## Boundaries
- Memory is ADVISORY, not authoritative. Live system facts (versions, ports, services)
  come from the Server Profile / live discovery — never trust memory over the server.
- A remembered instruction does NOT bypass the safety tiers: a lesson may inform a fix,
  but WRITE/DESTRUCTIVE actions still require their own confirmations.
- Files `600`, dir `700`, owned by the control user — memory holds operator-identifying
  notes.

## Related
- Server Profile (Section IV) — the auto-discovered, schema-strict counterpart.
- Command: `/memory` — manual recall/write/forget/digest.
- Hooks: `ops-confirm-gate.js` gates every write; `ops-audit-log.js` records it.
