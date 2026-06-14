<div align="center">

# 🛡 LOGEN — Linux Operational Agent

**AI Sysadmin Agent untuk Operasi Server Linux — End-to-End**

*Plugin Claude Code yang mengoperasikan server Linux dari nol hingga produksi — **aman**, **sadar-konteks**, dan **auditable**.*

![Status](https://img.shields.io/badge/status-alpha%20(M1)-orange?style=flat-square)
![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Linux-informational?style=flat-square&logo=linux&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2?style=flat-square&logo=anthropic&logoColor=white)
![Node](https://img.shields.io/badge/hooks-Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

![Skills](https://img.shields.io/badge/skills-28-blueviolet?style=flat-square)
![Subagents](https://img.shields.io/badge/subagents-9-blueviolet?style=flat-square)
![Commands](https://img.shields.io/badge/commands-24-blueviolet?style=flat-square)
![Hooks](https://img.shields.io/badge/hooks-8-blueviolet?style=flat-square)
![Safety](https://img.shields.io/badge/safety-read--first%20%7C%20rollback--ready-success?style=flat-square)

</div>

---

> **LOGEN adalah "kepala operasi" (chief of operations) untuk infrastruktur server Anda.**
> Bukan sekadar menjalankan perintah — ia *memahami konteks tiap host, mengingat sejarahnya, menimbang risiko sebelum bertindak, dan menjelaskan setiap keputusan.* Anda cukup menyatakan **apa** yang ingin dicapai; LOGEN mengurus **bagaimana**-nya, dengan jaring pengaman di setiap langkah.

## Mengapa LOGEN?

| Tanpa LOGEN | Dengan LOGEN |
|---|---|
| 🧩 Best practice tersebar di ratusan dokumen | 📚 Pengetahuan operasional sebagai **skill** yang langsung dieksekusi |
| 💥 Operasi destruktif tanpa jaring pengaman | 🛡 **Tiering persetujuan** + rollback disiapkan sebelum write |
| ❄ Server "snowflake", tak ada yang ingat caranya | 🗂 **Server Profile** persisten menjaga konteks tiap host |
| ❓ Sulit menjawab "siapa mengubah apa, kapan, kenapa" | 📜 **Audit trail** lengkap dengan perintah rollback di tiap perubahan |

## Empat pilar kecerdasan

1. **Orchestrator / Brain** — persona agent utama: triase, muat profil, routing ke subagent spesialis, tegakkan tier, catat audit.
2. **Server Profile + Memory** — state per-host (`~/.logen/profiles/`) + memori operator kuratif (`~/.logen/memory/`), dibaca tiap awal sesi.
3. **Three-tier approval** — READ (otomatis) · WRITE (konfirmasi tunggal + rollback) · DESTRUCTIVE (double-confirm + bukti backup), ditegakkan hook tak-bisa-dibypass-LLM.
4. **Audit trail** — tiap WRITE menulis entri JSON (who/what/when/why + rollback) ke `~/.logen/audit/`.

Plus **lapisan kecerdasan lanjutan** (desain §XXI–XXII): `ops-sandbox` (rehearsal + containment), `ops-shadow` (verifikasi pra-aksi), `ops-immunity` (sistem imun fleet), `ops-trust` (otonomi terkalibrasi).

## Status build

LOGEN dibangun berfase (lihat [CODING_PLAN.md](CODING_PLAN.md)). Registry target: **28 skills · 9 subagents · 24 commands · 3 rules · 8 hooks**.

| Fase | Cakupan | Status |
|---|---|---|
| **M0** Scaffold | manifest, hooks.json, lib, validator | ✅ |
| **M1** Fondasi keselamatan | 3 rules + 5 hook inti + wiring `~/.logen/` | ✅ |
| **M2** State & konteks | `ops-discovery`, `ops-memory`, SessionStart | ⏳ |
| **M3** Operasi dasar (8 domain) | skills + subagents + commands | ⏳ → rilis v1.0 |
| **M4–M7** Lapisan kecerdasan | sandbox · shadow · trust · immunity | ⏳ → rilis v2.0 |
| **M8** Hardening & rilis | E2E, docs, packaging | ⏳ |

Hook keselamatan (`ops-safety-check`, `ops-confirm-gate`, `ops-post-verify`, `ops-env-protect`, `ops-audit-log`) sudah aktif & teruji; tiga hook lanjutan (`ops-context-load` minimal, `ops-shadow-gate`, `ops-sandbox-wrap`) ter-wire sebagai pass-through aman sampai fasenya tiba.

## Struktur repo

```
.claude-plugin/plugin.json   # manifest plugin LOGEN
hooks/hooks.json             # wiring 8 hook (SessionStart · PreToolUse · PostToolUse)
scripts/
  hooks/*.js                 # 8 hook (Node.js)
  lib/*.js                   # modul bersama: paths, state, rules, audit (wiring §XXII)
rules/*.md                   # 3 rule kebijakan (ops-safety, ops-verify, ops-change-management)
skills/ agents/ commands/    # artifact (dibangun M2–M7)
tools/                       # validate.sh, logen-sandbox-helper, sudoers.d-logen
test/*.test.js               # unit + integration test hook
ECC_OPS.md                   # spesifikasi desain lengkap (§I–§XXII) — sumber kebenaran
CODING_PLAN.md               # rencana implementasi berfase
```

State runtime (di luar repo, sisi-kontrol): `~/.logen/{active.json, op-context.json, profiles/, memory/, audit/, shadow/, sandbox/}`.

## Keamanan (non-negotiable)

- **Never `chmod 777`**; `.env` = `640` (owner `deploy:www-data`), backups `600`/dir `700`.
- **Never expose DB ports** publik; bind `127.0.0.1`.
- **App DB user** least-privilege `@'localhost'`; tak pernah `GRANT ALL`/root untuk app.
- **Backup hanya di `/var/backups/logen/<app>/`**, tak pernah di webroot.
- **Kredensial hanya di `.env`/secret manager** — tak pernah di skrip, log, atau git.
- **Deploy tak membuang WIP untracked**; selalu simpan commit sebelumnya + backup DB lebih dulu.
- Hook pemblokir memakai **exit 2** (PreToolUse) dan tak bisa di-bypass oleh penalaran model.

## Pengembangan

```bash
npm test                 # unit + integration test hook (node --test)
npm run validate         # validator struktural (counts, JSON, syntax, wiring)
```

> ⚠️ **Jangan iterasi coding di server produksi.** Gunakan host uji sekali-pakai (VM/container). Tak ada milestone menyentuh server sebelum fondasi keselamatan (M1) lulus.

## Lisensi

MIT © Syamsuddin. Lihat [LICENSE](LICENSE).
