---
description: Recall, add, update, forget, or digest the agent's durable operator memory (identity, standing instructions, preferences, lessons) — curated knowledge, separate from the Server Profile.
---

# /memory

Manage the durable knowledge the agent carries across sessions, stored on the control
side at `~/.logen/memory/` (Principle 6). This is curated operator knowledge, distinct
from the auto-discovered Server Profile (`/profile`).

## Modes
- **recall** (default) — print the active memory relevant to the current scope/host;
  `recall <query>` filters by tag or text. READ tier.
- **write** — add or update a durable fact: `write <type> "<fact>"`. Shows the proposed
  entry, asks one confirmation, appends to the right scope file, and records it to the
  audit trail. WRITE tier.
- **forget** — retire a fact by id: `forget <id>`. Writes a tombstone (auditable); the
  entry stops being recalled. WRITE tier.
- **digest** — compact memory: drop forgotten/expired entries, merge redundant ones, and
  print the summary. Compaction rewrites the file (WRITE).

## Scope resolution
- `global` entries apply to every host (operator identity, standing instructions,
  preferences).
- `host:<host>` entries apply only to that host (quirks, lessons). The active host comes
  from the session or an explicit argument.

## Safety
- NEVER store secrets, credentials, or PII — memory holds intent and knowledge, not data.
- Memory is advisory: live system facts come from `/profile` and discovery, not memory.
- Every write/forget is gated (single confirm) and audited.

## Related
- Skill: `ops-memory`
- Commands: `/profile` (the auto-discovered Server Profile), `/ops-doctor`
