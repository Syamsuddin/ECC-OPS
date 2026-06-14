# Rencana Coding ECC-OPS

Dokumen ini menerjemahkan desain [ECC_OPS.md](ECC_OPS.md) menjadi rencana implementasi berfase, dependency-aware, dengan *Definition of Done* (DoD) per milestone. Sumber kebenaran tetap `ECC_OPS.md`; dokumen ini hanya **urutan & cara membangunnya**.

Target: sebuah Claude Code plugin mandiri (`skills/`, `agents/`, `commands/`, `rules/`, `scripts/hooks/`, `hooks/hooks.json`) + state sisi-kontrol (`~/.ecc-ops/`) + helper privileged sisi-host.

**Registry final yang harus tercapai:** 28 skills · 9 subagents · 24 commands · 3 rules · 8 hooks.

> **Catatan versioning:** build lengkap (M0–M8, termasuk lapisan kecerdasan) dirilis sebagai **LOGEN v1.0.0**. Label "v1.0/v2.0" pada fase di bawah adalah target internal saat perencanaan; tag rilis aktual tunggal = **v1.0.0** di akhir M8. Akhir M3 hanyalah checkpoint *base agent* (bukan rilis terpisah).

---

## 0. Prinsip rencana

1. **Safety-first, bukan feature-first.** Fondasi keselamatan (rules + hook pemblokir + audit) dibangun & diuji **sebelum** apa pun yang menyentuh server.
2. **Tiap milestone shippable & teruji.** Plugin harus tetap *loadable* di akhir tiap milestone; tak ada milestone yang meninggalkan repo dalam keadaan rusak.
3. **Incremental vertikal.** Tiap domain dibangun utuh (skill + subagent + command + lewat hook + tulis audit) lalu diverifikasi end-to-end, bukan semua skill dulu baru semua hook.
4. **Spec-driven.** Tiap artifact sudah terdefinisi lengkap di `ECC_OPS.md` — coding = menyalin/menyempurnakan artifact + mengimplementasi skeleton hook JS + helper bash. Kolom "Spec" menunjuk seksi sumbernya.
5. **Konstanta desain tak boleh diubah saat coding** (garis merah §XXI.6 & §XXII): T0 tak pernah `shadow_verified`; DESTRUCTIVE tak pernah auto-promote; sandbox-pass tak pernah cukup sendiri; imunisasi per-host; blokir PreToolUse = `exit 2`.

---

## 1. Prasyarat & tech stack

| Komponen | Teknologi | Catatan |
|---|---|---|
| Plugin host | Claude Code (CLI/IDE) | memuat `skills/agents/commands/rules/hooks` relatif root plugin |
| Hooks | **Node.js** (tanpa dependensi eksternal bila bisa) | baca stdin JSON, tulis state JSON/JSONL; `exit 2` = blokir |
| Helper privileged | **bash** (`ecc-ops-sandbox-helper`) | root-owned, NOPASSWD whitelist (§XXII.10) |
| State sisi-kontrol | file JSON/JSONL di `~/.ecc-ops/` | `active.json`, `op-context.json`, `profiles/`, `memory/`, `audit/`, `shadow/`, `sandbox/` |
| Artifact prompt | Markdown (SKILL.md, subagent, command, rule) | konvensi bilingual + 4-backtick wrapper (lihat CLAUDE.md) |

**Catatan kalibrasi `ops-trust`** (§XXI.4): persentil ke-5 Beta butuh inverse-CDF Beta — Node tak punya di stdlib. Siapkan implementasi kecil (mis. fungsi `betaInvCDF` via bisection pada regularized incomplete beta) sebagai util bersama; tandai sebagai item M6.

---

## 2. Strategi pengujian (WAJIB dibaca lebih dulu)

> **Jangan pernah iterasi coding di server produksi (mis. SIMURU live).** Sediakan **host uji sekali-pakai** (VM/container throwaway, atau klon staging) untuk verifikasi end-to-end. Hook pemblokir & helper privileged HARUS lulus uji di host uji sebelum menyentuh host nyata.

Tiga lapis pengujian, sesuai jenis artifact:

1. **Hooks (Node.js) — unit-testable, tanpa server.** Beri payload JSON ke stdin, assert exit code + stdout/stderr + efek pada file state. Contoh wajib: tiap regex katastrofik `ops-safety-check.js` (harus `exit 2`); klasifikasi tier `ops-confirm-gate.js`; pembacaan `active.json`/`op-context.json`; komputasi TTL `ops-context-load.js`; update Beta `ops-trust`.
2. **Artifact prompt (skill/subagent/command/rule) — validasi statik + behavioral.** Statik: frontmatter valid, nama unik, referensi `Related:` resolve, fence seimbang (skrip `validate.sh` — lihat M0). Behavioral: jalankan command di sesi Claude Code terhadap **host uji**, amati apakah menempuh tier, menulis audit, memperbarui profil.
3. **Integrasi end-to-end — host uji.** Skenario penuh (mis. `/server-setup` → `/deploy` → `/rollback`) di host uji; verifikasi profil, audit, dan rollback benar.

DoD global tiap milestone: (a) plugin tetap loadable, (b) `validate.sh` hijau, (c) unit test hook milestone itu hijau, (d) skenario behavioral milestone lulus di host uji.

---

## 3. Scaffold repo (Milestone M0)

```
ecc-ops/
├── .claude-plugin/plugin.json     # manifest (Section XIX)
├── hooks/hooks.json               # wiring 8 hook (SessionStart + PreToolUse + PostToolUse)
├── scripts/
│   ├── hooks/                     # 8 *.js (awalnya stub yang exit 0)
│   └── lib/                       # util bersama: context.js (resolve host + baca active/op-context), audit.js, beta.js
├── skills/                        # 28 <name>/SKILL.md
├── agents/                        # 9 <name>.md
├── commands/                      # 24 <name>.md
├── rules/                         # 3 *.md
├── tools/
│   ├── ecc-ops-sandbox-helper     # helper bash (host-install)
│   └── sudoers.d-ecc-ops          # template /etc/sudoers.d/ecc-ops
├── test/                          # unit test hook + validate.sh
└── README.md
```

**DoD M0:** plugin termuat di Claude Code tanpa error; `/` menampilkan command (boleh stub); `validate.sh` berjalan (cek hitungan & frontmatter); CI lokal sederhana (node test runner) tersambung.

---

## 4. Milestone berfase

Tiap baris: **Deliverable** (artifact) · **Spec** (seksi `ECC_OPS.md`) · **Depends** · **DoD inti**.

### M1 — Fondasi keselamatan ⚠️ (gerbang untuk semua yang menyentuh server)

| Deliverable | Spec | DoD inti |
|---|---|---|
| 3 rules: `ops-safety`, `ops-verify`, `ops-change-management` | §XV | dimuat ke konteks; tercermin di perilaku |
| 5 hook inti: `ops-safety-check`, `ops-confirm-gate`, `ops-post-verify`, `ops-env-protect`, `ops-audit-log` | §XVI | unit test tiap regex katastrofik `exit 2`; tier WRITE/DESTRUCTIVE ditahan; `.env`→640; audit JSONL ter-append |
| `scripts/lib/context.js` (resolusi host §XXII.2, baca `active.json`/`op-context.json`) | §XXII.1–2 | host ter-resolve `ECC_OPS_HOST`→`active.json`; util teruji |
| Skema audit + provenance | §XVII, §XXII.6 | entri berisi who/what/when/why + rollback_cmd dari `op-context.json` |

**Depends:** M0. **Ukuran:** L. **Catatan:** ini lapisan paling kritis — selesaikan & uji tuntas sebelum M2+.

### M2 — State & konteks

| Deliverable | Spec | DoD inti |
|---|---|---|
| Skill `ops-discovery` + skema Server Profile (+ `freshness` TTL) | §IV | discovery mengisi profil; `profile_health` & TTL benar |
| Skill `ops-memory` + store `memory/` | §IV (Memori) | recall/write/forget/digest jalan; dedup `scope+title`; tanpa secret |
| Hook `ops-context-load.js` (SessionStart) | §XVI, §XXII.3 | menyuntik digest Profile+Memory via `additionalContext`; menandai `critical_stale` |
| Command `/profile`, `/memory` | §VII, §IV | menampilkan/menyegarkan profil & memori |

**Depends:** M1. **Ukuran:** M.

### M3 — Operasi dasar (per domain, vertikal)

Bangun & verifikasi **satu sub-domain pada satu waktu**. Tiap sub-domain = skill(s) + subagent(bila ada) + command(s), lewat tier + audit.

| Sub | Deliverable | Spec |
|---|---|---|
| M3a Provisioning | `ops-server-core`; subagent `server-provisioner`; `/server-setup` | §VII |
| M3b Web/DNS/SSL | `ops-webserver`,`ops-dns`,`ops-ssl`; `/dns-setup`,`/ssl-setup` | §VIII |
| M3c Runtimes | `ops-runtime-{php,node,python,go,java}`,`ops-containers` | §IX |
| M3d Deploy | `ops-deploy`; subagent `deploy-operator`; `/deploy`,`/rollback` | §X |
| M3e Data | `ops-database`,`ops-backup`,`ops-secrets`; subagent `backup-operator`; `/backup`,`/restore` | §XI |
| M3f Security | `ops-firewall`,`ops-security-hardening`,`ops-intrusion-detection`,`ops-incident-response`; subagent `security-auditor`,`incident-responder`; `/firewall`,`/security-audit`,`/harden`,`/incident` | §XII |
| M3g Observability | `ops-monitoring`,`ops-log-management`,`ops-performance`; subagent `monitoring-sentinel`,`performance-tuner`; `/health-check`,`/monitor`,`/logs`,`/perf-tune` | §XIII |
| M3h Maintenance | `ops-update-patch`; subagent `ops-troubleshooter`; `/update`,`/troubleshoot`,`/ops-doctor` | §XIV |

**Cakupan M3:** 22 skills · 8 subagents · 18 commands. **Depends:** M2. **Ukuran:** XL (terbesar — bisa diparalelkan per sub-domain). **DoD per sub:** command jalan end-to-end di host uji, lewat tier, perbarui profil, tulis audit, rollback teruji. **Tonggak penting:** model tiering (§III) diset di frontmatter subagent (`monitoring-sentinel`=haiku; `ops-troubleshooter`,`incident-responder`=opus; sisanya sonnet).

> Setelah M3, ECC-OPS sudah **fungsional penuh sebagai sysadmin agent** (tanpa lapisan kecerdasan). Bisa dirilis sebagai v1.0.

### M4 — Intelligence: `ops-sandbox` (substrat) — §XXI.6 Fase 1

| Deliverable | Spec | DoD inti |
|---|---|---|
| Skill `ops-sandbox`; command `/sandbox` | §XXI.1 | broker kontrak jalan |
| Helper `ecc-ops-sandbox-helper` + `sudoers.d-ecc-ops` | §XXII.10 | verb whitelist; `visudo -c` lolos; non-root memanggil via sudo NOPASSWD |
| Caps-probe → `Profile.sandbox_capabilities` | §XXII.9 | mendeteksi container/userns/CoW/Landlock/seccomp/kvm |
| Hook `ops-sandbox-wrap.js` (containment) | §XXI.5, §XXII.7 | bungkus WRITE dlm `systemd-run` ke `blast_radius`; kosong/lebar→`exit 2` |

**Depends:** M3. **Ukuran:** L. **Mengapa duluan:** containment = ROI keamanan tertinggi & menaikkan plafon `ops-trust`.

### M5 — Intelligence: `ops-shadow` (rehearsal) — §XXI.6 Fase 2

| Deliverable | Spec | DoD inti |
|---|---|---|
| Skill `ops-shadow`; command `/shadow` | §XXI.2 | T1 (validator native) dulu, lalu T2 (netns/CoW twin) |
| Store `shadow/<session>.jsonl` | §XXII.1, §XXII.8 | rekaman pass + `shadow_fidelity` + TTL 1800s |
| Hook `ops-shadow-gate.js` | §XXI.2, §XXII.8 | blokir op `requires_shadow` tanpa pass T1/T2 segar |

**Depends:** M4. **Ukuran:** L. **Garis merah:** `shadow_verified` hanya T1/T2; T0 advisory.

### M6 — Intelligence: `ops-trust` (otonomi terkalibrasi) — §XXI.6 Fase 3a

| Deliverable | Spec | DoD inti |
|---|---|---|
| Skill `ops-trust`; command `/trust` | §XXI.4 | ledger tampil/dikelola |
| `autonomy_ledger` (field Profile) + util `beta.js` | §XXI.4, §XXII.5 | Beta(1,1); bobot prod 1.0/T2 0.30/T1 0.15; p5≥0.95; `prod_success≥20` |
| Pemetaan `command→op_class:scope` | §XXII.4 | kunci dihitung sekali → `op-context.json` |
| `ops-confirm-gate.js` baca ledger (bukan tabel statik) | §XXII.5 | promosi diusulkan (meta-approval); demosi instan; DESTRUCTIVE dikecualikan |

**Depends:** M5 (butuh bukti rehearsal) + M1 (confirm-gate). **Ukuran:** L. **Risiko utama:** kalibrasi bobot — uji dengan dataset audit sintetis.

### M7 — Intelligence: `ops-immunity` (sistem imun fleet) — §XXI.6 Fase 3b

| Deliverable | Spec | DoD inti |
|---|---|---|
| Skill `ops-immunity`; subagent `immunity-synthesizer`; command `/immunize` | §XXI.3 | insiden→antibodi (Memory `lesson/global`) |
| Verifikasi per-host via `ops-shadow` + kuorum | §XXI.3 | antibodi diuji di twin tiap host; kuorum ≥2 host / shadow-pass |

**Depends:** M5 (shadow) + M2 (memory) + M3f (incident flow). **Ukuran:** M. **Garis merah:** imunisasi **per-host confirm**, tak pernah massal-otomatis.

### M8 — Hardening, dokumentasi, rilis

| Deliverable | DoD inti |
|---|---|
| Integrasi E2E (skenario lintas-milestone di host uji) | skenario besar lulus; audit & rollback konsisten |
| README + panduan instalasi (§XIX) | operator bisa pasang dari nol |
| `validate.sh` final + CI | hitungan 28/9/24/3/8, fence, frontmatter, referensi resolve — hijau |
| Tag versi | v2.0 (lengkap dgn lapisan kecerdasan) |

---

## 5. Graf dependensi & urutan

```
M0 scaffold
  └─ M1 safety foundation ⚠️ (gate)
       └─ M2 state & context
            └─ M3 base ops (a..h)  ── rilis v1.0 fungsional ──┐
                 └─ M4 ops-sandbox (containment)              │
                      └─ M5 ops-shadow (rehearsal)            │
                           ├─ M6 ops-trust ──────┐            │
                           └─ M7 ops-immunity ───┴─ M8 rilis v2.0
```

- **Jalur kritis:** M0→M1→M2→M3→M4→M5→(M6,M7)→M8.
- **Paralelisasi aman:** sub-domain M3a–M3h bisa dikerjakan paralel setelah M2; M6 & M7 paralel setelah M5.
- **Titik rilis:** akhir M3 = **v1.0** (sysadmin agent penuh, tanpa kecerdasan lanjutan); akhir M8 = **v2.0**.

---

## 6. Definition of Done — template global (tiap milestone)

- [ ] Plugin tetap **loadable** di Claude Code (tak ada error parse/frontmatter).
- [ ] `validate.sh` **hijau** (hitungan registry, fence 4-backtick seimbang, frontmatter valid, referensi `Related:` resolve).
- [ ] **Unit test hook** milestone hijau (khusus milestone yang menyentuh hook).
- [ ] **Skenario behavioral** milestone lulus di **host uji** (bukan prod).
- [ ] Operasi WRITE/DESTRUCTIVE menempuh tier + menulis **audit** + menyediakan **rollback**.
- [ ] Tak ada **garis merah** yang dilanggar (cek konstanta §XXI.6/§XXII).
- [ ] Dokumentasi singkat milestone (apa yang berfungsi, batasan diketahui) dicatat.

---

## 7. Risk register

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Kalibrasi bobot fidelitas `ops-trust` salah** | seluruh trilogi percaya bukti lemah | uji dgn audit sintetis; gerbang `prod_success≥20` jadi pengaman keras; tunda M6 auto-promote sampai data nyata cukup |
| **Develop di prod (SIMURU)** | outage / kehilangan WIP | wajib host uji; M1 (blocker hooks) lebih dulu; `no-edit-code-server` |
| **Primitif sandbox tak tersedia di host** | T2/containment gagal | caps-probe + degradasi jujur (lapor fidelitas); fallback T1; microVM opsional |
| **Privilege helper bocor** | eskalasi hak | helper verb whitelist ketat; sudoers `visudo -c`; agent tetap non-root |
| **Hook tak dapat konteks host (fleet)** | salah host tersentuh | `active.json` wajib dibaca; update per-host sebelum tiap langkah batch |
| **Skeleton hook menyembunyikan algoritma sulit** | molor | M1 & M6 paling padat-logika — alokasikan ekstra; `beta.js` & regex tier diuji unit |

---

## 8. Mulai dari mana

1. **M0 scaffold** + `validate.sh` (cek hitungan & frontmatter sejak awal).
2. **M1 fondasi keselamatan** — selesaikan & uji tuntas; ini gerbang untuk semua sisanya.
3. Siapkan **host uji** (VM/container throwaway) sebelum M3.
4. Lanjut M2 → M3 (paralel per sub-domain) → **rilis v1.0**.
5. Lapisan kecerdasan M4→M5→(M6,M7)→M8 → **rilis v2.0**.

> Aturan emas: **tak ada milestone menyentuh server sebelum M1 lulus**, dan **tak ada coding di prod**.
