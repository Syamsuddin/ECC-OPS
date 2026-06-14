# ECC-Ops — AI Sysadmin Agent

**Desain Lengkap v2.0 — Agent AI Sysadmin Server Mandiri**

ECC-Ops adalah agent AI sysadmin mandiri yang mengoperasikan server Linux secara end-to-end: dari provisioning server kosong, konfigurasi web server/DNS/SSL, deployment aplikasi web, debugging, monitoring proaktif, hardening keamanan, hingga backup/restore dan incident response. Ditujukan untuk sysadmin, DevOps engineer, dan pemilik server — baik yang mengelola satu host tunggal maupun fleet berisi puluhan server. Agent ini bekerja dengan prinsip aman-dulu: setiap diagnosa bersifat read-only, setiap perubahan menyiapkan titik mundur, dan setiap operasi berisiko meminta konfirmasi eksplisit dari operator manusia.

## Daftar Isi

1. **I. Visi & Tujuan**
2. **II. Prinsip Desain**
3. **III. Arsitektur Agent**
4. **IV. Server Profile — Model Pengetahuan & Status**
5. **V. Sistem Keamanan & Persetujuan**
6. **VI. Matriks Stack yang Didukung**
7. **VII. Domain — Provisioning & Server Core**
8. **VIII. Domain — Web Serving, DNS & SSL**
9. **IX. Domain — Runtimes & Containers**
10. **X. Domain — Deployment & Rollback**
11. **XI. Domain — Data: Database, Backup & Secrets**
12. **XII. Domain — Security & Hardening**
13. **XIII. Domain — Observability: Monitoring, Logs & Performance**
14. **XIV. Domain — Maintenance & Incident Response**
15. **XV. Rules**
16. **XVI. Hooks & Enforcement**
17. **XVII. Audit Trail & Change Management**
18. **XVIII. Peta File Lengkap**
19. **XIX. Instalasi & Packaging**
20. **XX. Alur Kerja & Siklus Hidup Sysadmin**
21. **XXI. Lapisan Kecerdasan Lanjutan — Sandbox & Trilogi ops-shadow / ops-immunity / ops-trust**
22. **XXII. Runtime Contracts & Wiring — Kontrak Antar-Komponen**

## I. Visi & Tujuan

ECC-Ops dirancang sebagai **"kepala operasi" (chief of operations) yang cerdas** untuk infrastruktur server — sebuah agent yang tidak sekadar menjalankan perintah, tetapi memahami konteks tiap host, mengingat sejarahnya, menimbang risiko sebelum bertindak, dan menjelaskan setiap keputusan. Alih-alih operator menghafal ratusan perintah, lokasi config yang tersebar, dan urutan langkah yang rawan salah, ECC-Ops menyatukan seluruh pengetahuan operasional ke dalam satu agent yang konsisten, auditable, dan dapat diandalkan untuk pekerjaan rutin maupun darurat.

**Masalah yang dipecahkan:**

- **Fragmentasi pengetahuan** — best practice tersebar di ratusan dokumen; ECC-Ops memusatkannya sebagai skill yang langsung dapat dieksekusi.
- **Operasi rawan error & destruktif** — `rm -rf`, `DROP TABLE`, atau `ufw disable` tanpa jaring pengaman; ECC-Ops menegakkan tiering persetujuan dan selalu menyiapkan rollback.
- **Server "snowflake"** — tiap host dikonfigurasi sedikit berbeda dan tak ada yang ingat caranya; ECC-Ops menyimpan **Server Profile** persisten agar konteks tidak hilang.
- **Diagnosa lambat saat insiden** — runbook tercecer; ECC-Ops menyediakan prosedur incident response terstruktur yang read-first.
- **Audit & kepatuhan** — sulit menjawab "siapa mengubah apa, kapan, mengapa"; setiap perubahan ECC-Ops tercatat lengkap dengan perintah rollback-nya.

**Non-goals (yang BUKAN tujuan ECC-Ops):**

- **Bukan pengganti judgment manusia** untuk keputusan berisiko tinggi — operasi DESTRUCTIVE selalu memerlukan persetujuan eksplisit; agent menyarankan, manusia memutuskan.
- **Bukan platform PaaS/orkestrator kluster** seperti Kubernetes control-plane — fokusnya operasi server pada level host (single & fleet), bukan menggantikan platform orkestrasi besar.
- **Bukan editor kode aplikasi** — sesuai Prinsip 9, kode aplikasi hanya berubah lewat VCS/deploy; agent tidak melakukan edit liar pada source di server.
- **Bukan SIEM/observability suite penuh** — ia mengintegrasikan dan memanfaatkan tooling monitoring/logging, bukan menggantikan stack observability enterprise.
- **Tidak berasumsi atau memaksakan stack tertentu** — ia beradaptasi pada apa yang sudah ada (Prinsip 1), bukan memaksa migrasi.

## II. Prinsip Desain

| # | Prinsip | Penjelasan & Implikasi Praktis |
|---|---------|-------------------------------|
| 1 | **Stack-agnostic** | Agent mendeteksi dulu apa yang ada di server (web server, runtime, DB, OS) baru beradaptasi — tidak pernah berasumsi. *Implikasi:* setiap operasi diawali fase discovery; satu agent melayani Nginx maupun Apache, PHP maupun Node, tanpa konfigurasi ulang. |
| 2 | **Read-first** | Diagnosa dan audit selalu read-only; aksi write hanya dilakukan setelah konteks dipahami dan operator mengonfirmasi. *Implikasi:* subagent diagnostik (`security-auditor`, `ops-troubleshooter`) hanya diberi tools `["Read","Bash"]` read-only. |
| 3 | **Rollback-ready** | Setiap operasi write menyiapkan titik mundur sebelum eksekusi — commit hash, salinan config, atau backup DB. *Implikasi:* agent tidak pernah memodifikasi tanpa lebih dulu menyimpan keadaan lama dan menampilkan perintah pembalik. |
| 4 | **Idempotent** | Perintah dapat diulang tanpa menumpuk efek samping. *Implikasi:* deploy, instalasi paket, dan penulisan config dirancang agar menjalankan ulang menghasilkan keadaan yang sama, aman untuk retry. |
| 5 | **Defense-in-depth** | Keamanan dibangun berlapis — SSH, runtime, web server, DB, filesystem, kernel — bukan satu kontrol tunggal. *Implikasi:* hardening tidak berhenti di firewall; tiap lapisan punya checklist tersendiri. |
| 6 | **Stateful & context-aware** | Agent menyimpan Server Profile persisten sehingga ingat konteks tiap server lintas sesi. *Implikasi:* tidak perlu deteksi ulang dari nol setiap kali; agent "mengenal" host yang dikelolanya. |
| 7 | **Auditable** | Setiap perubahan tercatat: who/what/when/why + perintah rollback. *Implikasi:* hook `ops-audit-log.js` mencatat otomatis; pertanyaan kepatuhan dapat dijawab dari audit trail. |
| 8 | **Confirm-before-harm** | Tiering persetujuan: READ otomatis, WRITE konfirmasi tunggal, DESTRUCTIVE double-confirm. *Implikasi:* hook `ops-confirm-gate.js` mengklasifikasi dan menahan perintah hingga token konfirmasi diberikan. |
| 9 | **Server mirrors source** | Kode aplikasi hanya berubah lewat VCS/deploy; tidak ada edit liar di server (file non-kode seperti `.env`/nginx/systemd boleh diatur langsung). *Implikasi:* deploy harus idempoten; drift antara source dan server dicegah. |

## III. Arsitektur Agent

ECC-Ops tersusun atas tujuh lapisan yang saling melengkapi. Lapisan pengetahuan (Skills) dan kontrol (Hooks/Rules) bersifat statis-deklaratif, sedangkan lapisan eksekusi (Orchestrator + Subagents) bersifat dinamis. Negara/state disimpan di luar prompt (Server Profile + Memory + Audit store) agar persisten lintas sesi.

1. **Orchestrator / Brain** — persona agent utama (top-level). Ia mentriase setiap permintaan operator, memuat **Server Profile** host target, memilih skill pengetahuan yang relevan, melakukan routing ke **subagent spesialis**, menegakkan **safety gate** (tiering persetujuan), dan memastikan setiap perubahan tercatat di audit. Orchestrator BUKAN file subagent — ia adalah persona sistem level atas.
2. **Subagents spesialis** — pekerja fokus dengan toolset terbatas (mis. `deploy-operator`, `security-auditor`). Subagent diagnostik diberi tools read-only; hanya `server-provisioner` yang punya `Write`/`Edit`.
3. **Skills (knowledge base)** — pengetahuan operasional per-domain (`skills/<name>/SKILL.md`) yang dimuat sesuai konteks; berisi prosedur, snippet config, dan praktik terbaik per-stack.
4. **Commands** — entry point slash (`/deploy`, `/security-audit`, dst.) yang memetakan intent operator ke alur kerja + subagent yang sesuai.
5. **Safety & Approval system** — logika tiering READ/WRITE/DESTRUCTIVE yang menentukan apakah sebuah operasi boleh otomatis, perlu konfirmasi, atau perlu double-confirm + bukti backup.
6. **Hooks (enforcement harness-level)** — penegak di luar kuasa LLM (`scripts/hooks/*.js`): memblokir perintah katastrofik, menahan operasi sampai dikonfirmasi, auto-verifikasi service, melindungi `.env`, dan mencatat audit.
7. **State persisten (Server Profile + Memory)** — model pengetahuan per host (`~/.ecc-ops/profiles/<host>.json`, di-refresh oleh `ops-discovery`) plus **memori operator kuratif** (`~/.ecc-ops/memory/`, dikelola skill `ops-memory`); keduanya dibaca orchestrator di awal sesi. Profil = fakta auto-discovery yang bisa ditimpa; memori = instruksi/preferensi/pelajaran yang tak pernah ditimpa.

### Diagram Arsitektur

```
                          ┌──────────────────────────────┐
              READS/WRITES │      SERVER PROFILE STORE     │  ~/.ecc-ops/profiles/<host>.json
            ┌──────────────│   (per-host state, fleet)    │  ~/.ecc-ops/memory/{global,<host>}.jsonl
            │              │   + MEMORY + AUDIT STORES     │  ~/.ecc-ops/audit/<host>.jsonl
            │              └──────────────────────────────┘
            v                            ^
   ┌─────────────────┐                   │ who/what/when/why + rollback
   │    COMMANDS      │  intent           │
   │ /deploy /harden  │────────┐         │
   │ /backup /monitor │        v         │
   └─────────────────┘  ┌────────────────────────────┐         ┌──────────────────────┐
                        │      ORCHESTRATOR / BRAIN    │ load    │        SKILLS         │
   ┌─────────────────┐  │  triage · route · safety-gate│<───────>│   (knowledge base)    │
   │  SAFETY/APPROVAL │<>│   load profile · log audit   │ consult │ ops-deploy ops-ssl … │
   │ READ/WRITE/DESTR │  └────────────────────────────┘         └──────────────────────┘
   └─────────────────┘            │ delegate
            ^                      v
            │            ┌────────────────────────────────────────────────┐
            │            │                 SUBAGENTS (specialists)          │
            │            │ server-provisioner  deploy-operator  backup-op    │
            │            │ security-auditor  ops-troubleshooter  perf-tuner  │
            │            │ incident-responder       monitoring-sentinel      │
            │            └────────────────────────────────────────────────┘
            │                      │ Bash / Read / Write (per-tool tier)
            │                      v
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       HOOKS (harness-level enforcement)                   │
   │ ops-safety-check.js · ops-confirm-gate.js · ops-post-verify.js           │
   │ ops-env-protect.js · ops-audit-log.js                                     │
   └────────────────────────────────────────────────────────────────────────┘
                                   │ executes
                                   v
            ┌──────────────────────────────────────────────┐
            │   TARGET HOST(S)  — local shell  |  SSH/MCP    │
            │   single server  ·····  fleet of N hosts      │
            └──────────────────────────────────────────────┘
```

### Single Server vs. Fleet

- **Single server** — Server Profile tunggal di `~/.ecc-ops/profiles/<host>.json`; orchestrator memuatnya di awal sesi dan seluruh operasi tertuju pada satu host.
- **Fleet (banyak host)** — direktori `~/.ecc-ops/profiles/` berisi satu profil per host. Orchestrator memilih host target (atau grup, mis. `web-*`), memuat profil yang relevan, dan menjalankan operasi per-host secara berurutan (default) atau paralel terbatas untuk operasi read-only seperti `/health-check`. Setiap host punya audit trail terpisah. Operasi WRITE/DESTRUCTIVE tetap dikonfirmasi per-host kecuali operator secara eksplisit menyetujui batch.

### Model Eksekusi

- **Lokal (shell)** — agent berjalan pada host yang dikelolanya dan mengeksekusi via shell langsung. Cocok untuk agent yang di-deploy di server target.
- **Remote (SSH/MCP bridge)** — agent berjalan di node kontrol dan menjangkau host target lewat SSH (atau bridge MCP yang membungkus eksekusi remote). Server Profile + audit tetap tersimpan di sisi kontrol, memungkinkan satu node kontrol mengelola seluruh fleet secara terpusat dan aman.

### Persona Orchestrator (system prompt ringkas)

```text
You are ECC-Ops, an autonomous AI sysadmin and the chief of operations for the
servers under your care. You manage Linux hosts end-to-end: provisioning, web
serving, DNS/SSL, deployment, databases, security hardening, backups, monitoring,
and incident response — for a single server or an entire fleet.

OPERATING DOCTRINE
1. Stack-agnostic: detect before you act. Always load the Server Profile for the
   target host; if missing or stale, run discovery (ops-discovery) first.
2. Read-first: diagnose with read-only commands before proposing any change.
3. Classify every action by tier:
     READ        -> execute automatically (info, status, logs, health, audit).
     WRITE       -> show pre-state snapshot, plan, and impact; request a single
                    confirmation; execute; post-verify; record audit; print the
                    rollback command.
     DESTRUCTIVE -> require explicit double-confirmation AND proof a backup exists
                    before proceeding (DROP/TRUNCATE, rm -rf, disk format,
                    ufw disable, user deletion, restore over production).
4. Rollback-ready & idempotent: prepare a recovery point before every write; design
   operations so re-running is safe.
5. Defense-in-depth: secure SSH, runtime, web server, DB, filesystem, and kernel.
6. Server mirrors source: never hand-edit application code on the server — code
   changes flow only through VCS/deploy. Config files (.env, nginx, systemd) may be
   managed directly.
7. Auditable: every change is logged with who/what/when/why and its rollback command.
8. Remembered, not re-asked: at session start load operator memory (ops-memory) alongside
   the Server Profile; honor standing instructions and preferences. Memory is advisory —
   it never overrides live system facts, never bypasses the approval tiers, and never
   holds secrets.

WORKFLOW
- Triage the request, identify the target host(s), load their Server Profile and memory.
- Route specialized work to the right subagent (deploy-operator, security-auditor,
  ops-troubleshooter, backup-operator, performance-tuner, incident-responder,
  monitoring-sentinel, server-provisioner) and consult the relevant skills.
- Never bypass the safety gate. When uncertain or when stakes are high, stop and ask.
  You advise; the human decides on high-risk actions.
- After any change, refresh the Server Profile and confirm the system is healthy.

You are calm, precise, and conservative. Clarity over cleverness. Safety over speed.
```

### Kebijakan Model (Model Tiering)

ECC-Ops tidak menyamakan semua tugas: model dipilih per peran berdasarkan **kompleksitas penalaran × taruhan × frekuensi**, demi keseimbangan kualitas dan biaya. Orchestrator (persona utama) memakai **model sesi** yang dipilih operator; subagent disetel per definisi lewat frontmatter `model:`.

| Tier | Model | Subagent | Alasan |
|---|---|---|---|
| **Ringan** | `haiku` | `monitoring-sentinel` | read-only, frekuensi tinggi (health check / threshold), penalaran ringan — murah & cepat |
| **Standar** | `sonnet` | `server-provisioner`, `deploy-operator`, `security-auditor`, `backup-operator`, `performance-tuner`, `immunity-synthesizer` | operasi rutin & analisis terstruktur — default seimbang |
| **Berat** | `opus` | `ops-troubleshooter`, `incident-responder` | root-cause analysis & respons insiden — penalaran terdalam, taruhan tertinggi |

**Eskalasi dinamis (kebijakan orchestrator):**
- Insiden **P1/P2** → naikkan ke `opus` walau subagent default-nya lebih rendah.
- Triage read-only murni (mis. `/health-check`, `/logs`) → boleh turun ke `haiku`.
- Operasi WRITE yang sudah terkalibrasi `ops-trust` + lulus `ops-shadow` → boleh tetap di tier rendah (risiko sudah ditekan).

**Atribusi biaya:** model yang menjalankan tiap aksi dicatat di field audit `model` (Section XVII), sehingga biaya dapat dilacak per operasi/host. Default konservatif: bila ragu, **naik satu tier** — kualitas & keamanan di atas penghematan.

## IV. Server Profile — Model Pengetahuan & Status

**Server Profile** adalah catatan persisten per host yang menjadi memori jangka panjang agent. Ia memungkinkan ECC-Ops bersifat *stateful & context-aware* (Prinsip 6): begitu sebuah host pernah ditemukan, agent tidak perlu mendeteksi ulang dari nol pada sesi berikutnya. Profil disimpan di sisi kontrol pada `~/.ecc-ops/profiles/<host>.json` (satu file per host; kumpulan file = fleet).

**Kapan dibaca:** di awal setiap sesi/operasi, oleh orchestrator, untuk memahami konteks host (OS, stack, apps, postur keamanan) sebelum bertindak.

**Kapan diperbarui:** di-refresh oleh skill **`ops-discovery`** — saat host pertama kali dikenali, setelah operasi WRITE yang mengubah keadaan (deploy, install paket, ubah firewall, perbarui SSL), atau secara berkala untuk memvalidasi profil tidak basi (stale).

**Lifecycle:**

```
discovery (ops-discovery)  ─►  simpan ke profiles/<host>.json
        ▲                              │
        │                              ▼
   validasi ulang  ◄──  dipakai tiap sesi oleh Orchestrator  ──►  update setelah perubahan (WRITE)
   (deteksi drift)                                                  + catat changelog ref
```

- **discovery** — `ops-discovery` menjalankan probe read-only (OS, resource, port, service, versi runtime, cert) dan menyusun profil.
- **simpan** — profil ditulis sebagai JSON, dengan `last_discovery` timestamp.
- **dipakai tiap sesi** — orchestrator memuat profil untuk triase & routing tanpa deteksi ulang.
- **divalidasi ulang** — jika profil melewati ambang umur atau ada indikasi drift (mis. service tak sesuai), agent menjalankan discovery ulang dan mencatat selisihnya.

### Skema JSON Server Profile (contoh terisi)

```json
{
  "schema_version": "2.0",
  "host": {
    "name": "web-prod-01",
    "fqdn": "web-prod-01.example.com",
    "primary_ip": "203.0.113.10",
    "private_ip": "10.20.0.10",
    "provider": "Hetzner Cloud",
    "location": "fsn1",
    "access": { "method": "ssh", "ssh_user": "ecc-ops", "ssh_port": 2222 }
  },
  "os": {
    "distro": "Ubuntu",
    "version": "24.04 LTS",
    "kernel": "6.8.0-31-generic",
    "arch": "x86_64",
    "package_manager": "apt",
    "init": "systemd",
    "timezone": "UTC"
  },
  "resources": {
    "cpu_cores": 4,
    "ram_mb": 8192,
    "swap_mb": 4096,
    "disks": [
      { "mount": "/", "fs": "ext4", "size_gb": 160, "used_pct": 38 }
    ]
  },
  "stack": {
    "web_server": { "name": "nginx", "version": "1.26.0" },
    "runtimes": [
      { "name": "php", "version": "8.3", "fpm": true, "manager": "php-fpm" }
    ],
    "databases": [
      { "engine": "mysql", "version": "8.4", "bind": "127.0.0.1:3306", "service": "mysql" }
    ],
    "cache": [
      { "engine": "redis", "version": "7.2", "bind": "127.0.0.1:6379", "service": "redis-server" }
    ],
    "containers": { "engine": null, "compose": false }
  },
  "apps": [
    {
      "name": "shop",
      "framework": "laravel",
      "framework_version": "11",
      "domain": "shop.example.com",
      "path": "/var/www/shop",
      "current_release": "/var/www/shop/releases/20260612T0830Z",
      "repo": "git@github.com:example/shop.git",
      "branch": "main",
      "deploy_method": "git+symlink-zero-downtime",
      "service": "php8.3-fpm",
      "queue_worker": { "service": "shop-queue.service", "supervisor": "systemd" },
      "scheduler": "cron:* * * * * php artisan schedule:run"
    }
  ],
  "firewall": {
    "tool": "ufw",
    "default_incoming": "deny",
    "default_outgoing": "allow",
    "allowed": [
      { "port": 2222, "proto": "tcp", "comment": "ssh" },
      { "port": 80, "proto": "tcp", "comment": "http" },
      { "port": 443, "proto": "tcp", "comment": "https" }
    ],
    "fail2ban": { "enabled": true, "jails": ["sshd", "nginx-http-auth"] }
  },
  "ssl": [
    {
      "domain": "shop.example.com",
      "issuer": "Let's Encrypt",
      "type": "single",
      "expires_at": "2026-09-10T00:00:00Z",
      "auto_renew": true,
      "renew_method": "certbot.timer"
    }
  ],
  "backup": {
    "tool": "ecc-ops-backup",
    "targets": ["mysql:shop", "files:/var/www/shop/shared"],
    "schedule": "0 2 * * *",
    "encryption": "age",
    "destination": "s3://example-backups/web-prod-01",
    "retention_days": 30,
    "last_run": { "at": "2026-06-14T02:00:11Z", "status": "ok", "verified_restore": "2026-06-08" }
  },
  "monitoring": {
    "agent": "ecc-ops-monitor",
    "checks": ["cpu", "ram", "disk", "http:shop.example.com", "ssl-expiry", "service:php8.3-fpm"],
    "alerting": { "channel": "slack:#ops-alerts", "thresholds": { "disk_used_pct": 85, "ram_used_pct": 90 } }
  },
  "audit": {
    "last_summary": "2026-06-13T18:00:00Z",
    "open_findings": 2,
    "hardening_score": 86,
    "changelog_ref": "~/.ecc-ops/audit/web-prod-01.jsonl"
  },
  "freshness": {
    "os":        { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 720 },
    "resources": { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 720 },
    "stack":     { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 168 },
    "apps":     { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 168 },
    "firewall": { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 24  },
    "ssl":      { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 12  },
    "backup":   { "checked_at": "2026-06-14T02:00:11Z", "ttl_h": 24  },
    "disks":    { "checked_at": "2026-06-14T06:00:00Z", "ttl_h": 1   }
  },
  "last_discovery": "2026-06-14T06:00:00Z",
  "profile_health": "fresh"
}
```

### Cache & Invalidation Semantics

Server Profile pada dasarnya adalah **cache dari hasil discovery yang mahal** (Prinsip 6). Agar deterministik — bukan sekadar "fresh/stale" konseptual — tiap kategori field punya **TTL** sendiri, disetel menurut *volatilitas × risiko-basi*. Field yang jarang berubah ber-TTL panjang; field berisiko-tinggi (SSL, firewall, disk) di-recheck agresif. TTL disimpan di map `freshness` pada profil (lihat skema di atas).

| Kategori | TTL | Alasan |
|---|---|---|
| `os`, `resources` | **720 jam (30 hari)** | nyaris statis; berubah hanya saat resize/upgrade |
| `stack` (versi web/runtime/DB) | **168 jam (7 hari)** | berubah saat update/patch |
| `apps` (domain/path/repo/deploy) | **168 jam (7 hari)** | berubah saat deploy/perubahan app |
| `backup.last_run` | **24 jam** | backup harian — deteksi backup diam/gagal cepat |
| `firewall` (rules, fail2ban) | **24 jam** | postur keamanan; drift berbahaya |
| `ssl.expires_at` | **12 jam** | expiry kritis — cek agresif agar cert tak kedaluwarsa diam-diam |
| `disks[].used_pct` (utilisasi) | **1 jam** | volatil; disk bisa penuh cepat |
| `audit` summary | **on-read** | selalu dihitung dari audit trail (tak pernah basi) |

**Catatan pemetaan:** tiap key di map `freshness` dipetakan 1:1 ke objek Profile bernama sama (`os`/`resources`/`stack`/`apps`/`firewall`/`ssl`/`backup`/`disks`); kategori `audit` **sengaja tidak masuk** map — ia dihitung *on-read* dari audit trail (tak ber-TTL).

**Komputasi `profile_health`** (dievaluasi tiap awal sesi oleh hook `ops-context-load.js`):
- `fresh` — semua kategori dalam TTL.
- `stale` — ada kategori non-kritis lewat TTL → jadwalkan `ops-discovery` parsial saat sempat.
- `critical_stale` — kategori **berisiko-tinggi** (`ssl`, `firewall`, `disks`) lewat TTL → picu re-discovery kategori itu **sebelum** operasi terkait dijalankan.

**Tiga jalur invalidasi:**
1. **TTL (umur)** — kategori lewat `ttl_h` sejak `checked_at` → stale.
2. **Write-through** — setelah WRITE yang mengubah kategori (deploy→`apps`, certbot→`ssl`, ufw→`firewall`), kategori itu **langsung di-refresh** + `checked_at` diperbarui. Cache tak pernah menyajikan keadaan pra-perubahan.
3. **Drift** — bila probe ringan menemukan ketidaksesuaian (service/port tak cocok), kategori di-mark stale + selisihnya dicatat.

**Re-discovery penuh terjadwal:** mingguan (default), atau saat `last_discovery` > 168 jam — jaring pengaman terhadap drift yang lolos dari tiga jalur di atas.

### Memori Operator & Pengetahuan (Operator & Knowledge Memory)

Server Profile menjawab *"apa server ini"* — fakta yang bisa ditemukan ulang lewat probe (OS, port, versi, cert). Tetapi ada kelas pengetahuan yang **tidak pernah bisa ditemukan oleh discovery**: siapa operatornya dan bagaimana ia ingin dilayani, instruksi baku yang wajib dipatuhi (*standing orders*), preferensi gaya kerja, serta pelajaran yang dipetik dari insiden. ECC-Ops menyimpannya pada **lapisan memori kuratif** — setara dengan `memory_*` pada bridge MCP seperti ODIN, namun dikemas sebagai store sisi-kontrol + skill + command, bukan sebagai tool eksternal.

**Mengapa terpisah dari Server Profile?** Justru karena sifatnya berlawanan: Server Profile bersifat *auto-discovery & schema-strict* dan **ditimpa** oleh `ops-discovery` setiap refresh; memori bersifat *kuratif & free-form* dan **tidak boleh pernah ditimpa**. Menyatukannya akan membuat discovery menghapus pengetahuan yang justru paling mahal (instruksi & pelajaran). Karena itu memori hidup di store sendiri, sejajar dengan `profiles/` dan `audit/`.

**Tata letak store (sisi kontrol):**

```
~/.ecc-ops/memory/
├── global.jsonl            # scope "global": operator, instruction, preference, reference (berlaku lintas-fleet)
└── <host>.jsonl            # scope "host:<host>": lesson & quirk spesifik host
```

Format JSONL append-only (satu entri per baris), mengikuti pola audit store agar mudah di-`grep`/`jq` dan aman di-append. `forget` menulis *tombstone* (bukan menghapus di tempat); `digest` melakukan kompaksi.

**Skema entri:**

```json
{
  "id": "mem_2f9c1a",
  "scope": "global",
  "type": "instruction",
  "title": "deploy-no-hard-reset",
  "fact": "App X is not a framework app with a migrate/build tool — deploy only via git fetch + fast-forward and a service restart; never a deploy tool that runs `git reset --hard`.",
  "why": "A blind reset would discard untracked work-in-progress on the server.",
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

| Field | Makna |
|---|---|
| `id` | Identitas stabil entri (acuan `forget`/`links`). |
| `scope` | `global` (lintas-fleet) atau `host:<host>` (spesifik host). |
| `type` | `operator` · `instruction` · `preference` · `lesson` · `reference`. |
| `title` | Slug pendek; kunci dedup bersama `scope`. |
| `fact` | Pengetahuan durable, 1–2 kalimat. |
| `why` | Konteks/alasan — agar tidak dipatuhi membabi buta. |
| `tags` | Label untuk relevansi saat recall. |
| `confidence` | `high`/`medium`/`low` — bobot saat ranking recall. |
| `source` | `operator` · `inferred` · `incident:<ref>`. |
| `expires_at` | Kedaluwarsa opsional (mis. instruksi musiman); `null` = permanen. |
| `status` | `active` atau `forgotten` (tombstone). |
| `links` | `id` entri terkait. |

**Empat operasi (recall / write / forget / digest):**

| Operasi | Tier | Perilaku |
|---|---|---|
| **recall** | READ | Di awal sesi orchestrator memuat `global.jsonl` + file host target, menyaring `status=active` & belum kedaluwarsa, me-ranking (cocok-scope → irisan-tag → confidence), lalu menyuntik **digest ringkas** ke konteks — setara blok memori yang auto-inject pada ODIN. On-demand: `recall <query>`. |
| **write** | WRITE | Tangkap fakta durable saat operator menyatakan preferensi/perintah baku, atau setelah insiden menghasilkan pelajaran. **Dedup dulu**: bila ada entri aktif ber-`scope`+`title` sama → *update* (bukan duplikat). Tampilkan entri, minta satu konfirmasi, append, dan catat ke audit trail seperti perubahan lain. **Tak pernah** menyimpan secret/PII. |
| **forget** | WRITE | Tulis tombstone (`status: forgotten`, merujuk `id`) agar auditable; entri langsung berhenti di-recall. Untuk instruksi yang dicabut atau fakta yang terbukti salah. |
| **digest** | READ → WRITE saat kompaksi | Ringkas memori aktif jadi blok recall; saat kompaksi, buang entri forgotten/expired, gabungkan yang redundan, lalu tulis ulang file (operasi WRITE). |

**Integrasi dengan Orchestrator.** Memori dimuat di awal setiap sesi **bersama** Server Profile (perilaku persona — sama seperti pemuatan profil, bukan hook). Instruksi ber-`type: instruction` diperlakukan sebagai *standing orders*; preferensi membentuk gaya kerja; pelajaran menjadi konteks diagnosa. Tiga pagar menjaganya tetap aman:

1. **Memori bersifat advisory, bukan otoritatif.** Fakta sistem live (versi, port, service) selalu dari Server Profile/discovery — memori tidak pernah menggantikannya.
2. **Memori tidak mem-bypass tier.** Sebuah "pelajaran" boleh *menginformasikan* fix, tetapi aksi WRITE/DESTRUCTIVE tetap menempuh konfirmasinya.
3. **Tanpa secret.** Kredensial/token/hash/PII tidak pernah masuk memori (Rule `ops-safety`); setiap `write` melewati `ops-confirm-gate.js` dan dicatat `ops-audit-log.js`. File `600`, direktori `700`.

Dua artifact mewujudkan lapisan ini: skill **`ops-memory`** (pengetahuan & prosedur) dan command **`/memory`** (entry point manual).

#### Skill: ops-memory

````markdown
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
~/.ecc-ops/memory/
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
  -> confidence, and injects a compact digest into context. This is the ECC-Ops
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
````

#### Command: /memory

````markdown
---
description: Recall, add, update, forget, or digest the agent's durable operator memory (identity, standing instructions, preferences, lessons) — curated knowledge, separate from the Server Profile.
---

# /memory

Manage the durable knowledge the agent carries across sessions, stored on the control
side at `~/.ecc-ops/memory/` (Principle 6). This is curated operator knowledge, distinct
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
````

## V. Sistem Keamanan & Persetujuan

Inti keselamatan ECC-Ops adalah **tiering persetujuan** (Prinsip 8) yang ditegakkan dua lapis: oleh **persona orchestrator** (klasifikasi & alur) dan oleh **hooks harness-level** yang tidak dapat di-bypass oleh LLM. Setiap operasi diklasifikasikan ke salah satu dari tiga tier.

### Tiga Tier & Contoh Operasi

| Tier | Perilaku | Contoh Operasi |
|------|----------|----------------|
| **READ** | Otomatis, tanpa konfirmasi (read-only, tak mengubah state) | `systemctl status`, `nginx -t`, baca log, `ufw status`, `df -h`, `SELECT`, `/health-check`, `/profile`, `/security-audit` (diagnosa) |
| **WRITE** | Konfirmasi tunggal + tampilkan dampak + sediakan rollback | deploy aplikasi, `systemctl restart`, edit config Nginx/systemd, `apt install`, migrasi DB, tambah/ubah rule firewall, terbitkan/renew SSL |
| **DESTRUCTIVE** | Double-confirm + wajib pastikan backup tersedia | `DROP`/`TRUNCATE`, `rm -rf`, format/`mkfs` disk, `ufw disable`, hapus user, restore yang menimpa data produksi, `DELETE` tanpa `WHERE` |

### Alur Setiap Operasi WRITE

```
1. SNAPSHOT pre-state   → simpan config lama / commit hash / dump DB sebagai titik mundur
2. SHOW plan + impact   → tampilkan perintah persis, file terdampak, service terdampak, risiko
3. REQUEST confirmation → tunggu token konfirmasi operator (single untuk WRITE)
4. EXECUTE              → jalankan perintah (idempoten)
5. POST-VERIFY          → ops-post-verify.js cek service aktif, nginx -t lolos, app sehat
6. RECORD audit         → ops-audit-log.js catat who/what/when/why
7. SHOW rollback        → tampilkan perintah pembalik yang siap dipakai
```

Untuk **DESTRUCTIVE**, langkah 3 menjadi **double-confirm** dan ada gate tambahan sebelum langkah 4: agent harus membuktikan **backup terverifikasi tersedia**; bila tidak ada, operasi ditolak hingga backup dibuat.

### Mode Dry-Run

Setiap operasi WRITE/DESTRUCTIVE mendukung `--dry-run`: agent menjalankan langkah 1–2 (snapshot + tampilkan rencana & dampak) tanpa eksekusi nyata. Berguna untuk meninjau dampak deploy, perubahan firewall, atau migrasi DB sebelum benar-benar menjalankannya. Hasil dry-run juga dicatat (sebagai entri non-mutasi) untuk audit.

### Penegakan oleh Hooks

- **`ops-safety-check.js`** (PreToolUse Bash) — memblokir total perintah katastrofik berpola berbahaya (mis. `rm -rf /`, `mkfs` pada disk sistem, `ufw disable` tanpa alur, `:(){ :|:& };:`) sebelum sempat berjalan. Ini jaring pengaman terakhir, lebih ketat dari sekadar klasifikasi.
- **`ops-confirm-gate.js`** (PreToolUse Bash) — mengklasifikasi perintah ke WRITE/DESTRUCTIVE dan menahannya hingga token konfirmasi yang sesuai tier diberikan; READ diloloskan otomatis.
- **`ops-post-verify.js`** (PostToolUse Bash) — setelah `systemctl`/restart, otomatis memverifikasi status service agar perubahan yang merusak segera ketahuan.
- **`ops-env-protect.js`** & **`ops-audit-log.js`** mendukung postur aman: melindungi `.env` (chmod 640) dan mencatat audit setiap perubahan.

### Tabel: Operasi → Tier → Syarat

| Operasi | Tier | Syarat |
|---------|------|--------|
| Lihat status service / log / health | READ | — (otomatis) |
| Audit keamanan (diagnosa) | READ | read-only, tak mengubah state |
| `apt install <pkg>` | WRITE | konfirmasi; snapshot daftar paket; rollback = remove |
| Edit config Nginx | WRITE | konfirmasi; salin config lama; `nginx -t`; rollback = restore + reload |
| `systemctl restart <svc>` | WRITE | konfirmasi; post-verify status aktif |
| Deploy aplikasi | WRITE | konfirmasi; commit hash + symlink lama; rollback = repoint symlink |
| Migrasi DB | WRITE | konfirmasi; backup DB sebelum migrate; rollback = down/restore |
| Tambah/ubah rule firewall | WRITE | konfirmasi; snapshot ruleset; rollback = revert rule |
| Terbitkan/renew SSL | WRITE | konfirmasi; cadangkan cert lama |
| `DROP`/`TRUNCATE` tabel | DESTRUCTIVE | double-confirm + backup DB terverifikasi |
| `rm -rf <path>` | DESTRUCTIVE | double-confirm + backup file terkait |
| Restore menimpa data produksi | DESTRUCTIVE | double-confirm + verifikasi sumber backup |
| `ufw disable` | DESTRUCTIVE | double-confirm; ditolak oleh safety-check kecuali alur eksplisit |
| Hapus user / format disk | DESTRUCTIVE | double-confirm + backup; konfirmasi dampak |

## VI. Matriks Stack yang Didukung

ECC-Ops bersifat *stack-agnostic* (Prinsip 1): ia mendeteksi layer yang ada lalu beradaptasi. Tabel berikut merangkum opsi yang didukung per layer.

| Layer | Opsi yang Didukung |
|-------|--------------------|
| **OS** | Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian 12 (Bookworm), AlmaLinux 9, Rocky Linux 9, CentOS Stream 9 |
| **Web Server** | Nginx, Apache (httpd), Caddy |
| **Runtime** | PHP 8.3 / 8.4 (PHP-FPM), Node.js (LTS: 20/22), Python 3.11/3.12, Go 1.22+, Java (JDK 17/21 LTS) |
| **Framework** | Laravel, Symfony (PHP); Next.js, Express (Node); Django, FastAPI (Python); Spring Boot (Java); statis/SPA |
| **Database** | MySQL 8, MariaDB 10.11+, PostgreSQL 16 |
| **Cache / In-Memory** | Redis 7, Memcached |
| **Container** | Docker, Docker Compose, Podman |
| **Process Manager** | systemd (default), PM2 (Node), Supervisor, Gunicorn/uvicorn (Python), php-fpm pool |
| **SSL / TLS** | Let's Encrypt via Certbot (HTTP-01 & DNS-01 wildcard), TLS 1.2 / 1.3; renewal via `certbot.timer`; Caddy auto-HTTPS |

## VII. Domain — Provisioning & Server Core

Domain ini adalah fondasi dari seluruh siklus hidup operasi server: membawa sebuah server kosong (blank/bare server) dari kondisi baru di-boot menjadi host yang siap produksi, aman, dan terdokumentasi. Tujuannya bukan sekadar "menginstal paket", melainkan menegakkan baseline yang konsisten — user deploy non-root dengan SSH key, akses SSH yang sudah di-harden, waktu/locale yang benar, swap yang memadai, struktur direktori standar, serta pola systemd unit yang aman secara default. Sesuai Prinsip 1 (stack-agnostic), agent tidak pernah berasumsi: ia mendeteksi OS family, package manager, dan init system terlebih dahulu, lalu beradaptasi. Sesuai Prinsip 2 (read-first) dan Prinsip 8 (confirm-before-harm), seluruh tahap berbahaya — terutama SSH hardening yang berpotensi mengunci diri sendiri — selalu didahului diagnosa read-only, ditampilkan dampaknya, dan diverifikasi lewat sesi baru sebelum sesi lama ditutup. Hasil akhir provisioning langsung dipetakan ke Server Profile (Prinsip 6) sehingga agent mengingat konteks host pada sesi berikutnya tanpa deteksi ulang.

### Skill: ops-server-core

````markdown
---
name: ops-server-core
description: Provision a blank server into a secure, production-ready baseline — OS update, non-root deploy user, SSH hardening, timezone/locale, swap, essential packages, hardened systemd units, and standard directory layout, adapting to the detected OS family and init system.
version: 1.0
---

# ops-server-core

Baseline provisioning for a fresh host: bring a bare server to a secure, repeatable,
production-ready state without assuming any particular stack. Every step is idempotent
(Principle 4) and read-first (Principle 2): detect, plan, confirm, then write.

## When to Use

- First contact with a newly provisioned/bare server.
- Re-baselining an inconsistent host (drift in SSH config, missing swap, wrong timezone).
- Standardizing directory layout, deploy user, or systemd units across a fleet.
- Before any deploy, DB, or web server work — this skill establishes the foundation.

## 1. Stack & Platform Detection (read-first)

Never assume the platform. Detect before acting.

```bash
# --- OS family + version ---
. /etc/os-release 2>/dev/null
echo "ID=$ID ID_LIKE=${ID_LIKE:-} VERSION_ID=$VERSION_ID PRETTY=$PRETTY_NAME"
# ID: debian|ubuntu|rhel|centos|rocky|almalinux|fedora|amzn|opensuse-*|arch ...

# --- Architecture ---
uname -m            # x86_64 | aarch64 | armv7l ...

# --- Package manager ---
for pm in apt-get dnf yum zypper pacman apk; do
  command -v "$pm" >/dev/null 2>&1 && echo "pkg-manager: $pm"
done

# --- Init system ---
if [ -d /run/systemd/system ]; then echo "init: systemd"
elif command -v rc-service >/dev/null 2>&1; then echo "init: openrc"
else echo "init: $(ps -p 1 -o comm=)"; fi

# --- Active services (systemd) ---
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'

# --- Detect runtimes (do not assume) ---
for r in php node python3 go java ruby; do
  command -v "$r" >/dev/null 2>&1 && printf "%s: %s\n" "$r" "$($r --version 2>&1 | head -n1)"
done

# --- Detect web server ---
for w in nginx apache2 httpd caddy; do
  command -v "$w" >/dev/null 2>&1 && echo "webserver: $w"
done

# --- Detect database / cache ---
for d in mysqld mariadbd postgres redis-server; do
  pgrep -x "$d" >/dev/null 2>&1 && echo "db/cache running: $d"
done
```

Map `$ID` / `$ID_LIKE` to a family so later commands branch correctly:

| Detected `ID` / `ID_LIKE`        | Family   | Package manager | Web user      |
|----------------------------------|----------|-----------------|---------------|
| debian, ubuntu                   | debian   | apt-get         | www-data      |
| rhel, centos, rocky, almalinux   | rhel     | dnf (yum)       | nginx/apache  |
| fedora                           | rhel     | dnf             | nginx/apache  |
| amzn (Amazon Linux 2/2023)       | rhel     | dnf (yum)       | nginx/apache  |
| opensuse-*, sles                 | suse     | zypper          | nginx/wwwrun  |
| arch                             | arch     | pacman          | http          |

## 2. Provisioning Checklist

| Step | Action                                  | Tier        | Idempotent guard |
|------|-----------------------------------------|-------------|------------------|
| 1    | System update & upgrade                 | WRITE       | safe to repeat   |
| 2    | Create non-root deploy user + SSH key   | WRITE       | check `id deploy`|
| 3    | SSH hardening (sshd_config)             | WRITE       | backup + test    |
| 4    | Timezone & locale                       | WRITE       | check current    |
| 5    | Swap (if RAM < 4 GB) + swappiness       | WRITE       | check swapon     |
| 6    | Essential packages                      | WRITE       | pm is idempotent |
| 7    | Standard directory layout               | WRITE       | `mkdir -p`       |
| 8    | systemd unit template (per app, later)  | WRITE       | per-service      |

### 2.1 System Update (per OS family)

| Family | Refresh index            | Upgrade                          | Autoremove                |
|--------|--------------------------|----------------------------------|---------------------------|
| debian | `apt-get update`         | `apt-get -y dist-upgrade`        | `apt-get -y autoremove`   |
| rhel   | `dnf -y makecache`       | `dnf -y upgrade`                 | `dnf -y autoremove`       |
| suse   | `zypper refresh`         | `zypper -n update`               | `zypper -n rm --clean-deps`|
| arch   | `pacman -Sy`             | `pacman -Syu --noconfirm`        | `pacman -Rns $(pacman -Qtdq)` |

```bash
# Debian/Ubuntu — non-interactive, no prompt
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get -y dist-upgrade && apt-get -y autoremove
```

### 2.2 Non-root Deploy User + SSH Key

```bash
DEPLOY_USER="deploy"

# Idempotent: only create if missing
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

# Grant sudo via the correct group per family
if getent group sudo  >/dev/null; then usermod -aG sudo  "$DEPLOY_USER"; fi   # debian
if getent group wheel >/dev/null; then usermod -aG wheel "$DEPLOY_USER"; fi   # rhel/arch/suse

# Install authorized public key (NEVER generate private keys on the server)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
PUBKEY="ssh-ed25519 AAAA... operator@workstation"   # provided by operator
KEYFILE="/home/$DEPLOY_USER/.ssh/authorized_keys"
grep -qxF "$PUBKEY" "$KEYFILE" 2>/dev/null || echo "$PUBKEY" >> "$KEYFILE"
chmod 600 "$KEYFILE"; chown "$DEPLOY_USER:$DEPLOY_USER" "$KEYFILE"

# Optional passwordless sudo for automation (operator decision)
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
visudo -cf "/etc/sudoers.d/90-$DEPLOY_USER"   # validate before trusting
```

### 2.3 SSH Hardening (CRITICAL lock-out safety)

> CRITICAL: A bad sshd config can lock you out permanently. ALWAYS back up the
> original, validate with `sshd -t`, reload (do NOT restart the live session),
> then open a BRAND-NEW SSH session and confirm login succeeds BEFORE closing
> the existing session. Keep the old session open as a lifeline.

```bash
# 1) Backup with rollback point (Principle 3)
cp -a /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%F-%H%M%S)"

# 2) Apply hardening via a drop-in (idempotent, survives package upgrades)
cat > /etc/ssh/sshd_config.d/00-ecc-ops-hardening.conf <<'EOF'
# ECC-Ops SSH hardening — modern OpenSSH
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
MaxSessions 4
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
# Modern crypto only (TLS-grade KEX/ciphers/MACs)
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,sntrup761x25519-sha512@openssh.com
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
# Restrict who may log in
AllowUsers deploy
EOF

# 3) VALIDATE syntax BEFORE reloading — never reload an invalid config
sshd -t || { echo "sshd config INVALID — aborting"; exit 1; }

# 4) Reload (keeps current sessions alive), then TEST in a new session
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo ">>> NOW: from your workstation open a NEW session:"
echo ">>>   ssh -i ~/.ssh/id_ed25519 deploy@<host>"
echo ">>> Only after that succeeds, close the old session."
echo ">>> Rollback if locked risk: restore the .bak file and 'systemctl reload sshd'."
```

### 2.4 Timezone & Locale

```bash
# Idempotent: read current first
timedatectl show -p Timezone --value
timedatectl set-timezone UTC          # prefer UTC on servers

# Locale (Debian)
apt-get install -y locales
sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen
localectl set-locale LANG=en_US.UTF-8
# RHEL: dnf install -y glibc-langpack-en && localectl set-locale LANG=en_US.UTF-8
```

### 2.5 Swap (only if RAM < 4 GB) + swappiness

```bash
RAM_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
if [ "$RAM_MB" -lt 4096 ] && ! swapon --show | grep -q .; then
  SWAP_GB=2; [ "$RAM_MB" -ge 2048 ] && SWAP_GB=4
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB*1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Tune for a server (favor RAM, keep cache hot) — idempotent via drop-in
cat > /etc/sysctl.d/60-ecc-ops-swap.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null
```

### 2.6 Essential Packages (per OS family)

| Family | Install command base                                                       |
|--------|----------------------------------------------------------------------------|
| debian | `apt-get install -y ca-certificates curl wget gnupg git unzip vim ufw fail2ban htop rsync jq net-tools chrony logrotate` |
| rhel   | `dnf install -y ca-certificates curl wget gnupg2 git unzip vim firewalld fail2ban htop rsync jq chrony logrotate` |
| suse   | `zypper -n in ca-certificates curl wget gpg2 git unzip vim firewalld fail2ban htop rsync jq chrony logrotate` |
| arch   | `pacman -S --noconfirm ca-certificates curl wget gnupg git unzip vim ufw fail2ban htop rsync jq chrony logrotate` |

```bash
# Ensure time sync is on (chrony) — drift breaks TLS, logs, fail2ban
systemctl enable --now chronyd 2>/dev/null || systemctl enable --now chrony
```

## 3. Hardened systemd Unit Template

Use for app services (Node/Python/Go/Java/PHP workers). Hardened by default
(Principle 5: defense-in-depth). Adjust `ReadWritePaths` to the minimum needed.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=myapp application service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/var/www/myapp/current
ExecStart=/usr/local/bin/myapp-run
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

# --- Security hardening ---
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
# Only these paths are writable under ProtectSystem=strict:
ReadWritePaths=/var/www/myapp/shared/storage /var/log/myapp

# --- Resource limits ---
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 3.1 systemd Management Commands

```bash
systemctl daemon-reload                 # after creating/editing a unit
systemctl enable --now myapp            # enable on boot + start now
systemctl status myapp --no-pager       # READ: current state
systemctl restart myapp                 # WRITE: confirm + verify after
journalctl -u myapp -n 100 --no-pager   # READ: recent logs
systemctl show myapp -p ActiveState -p SubState   # machine-readable verify
systemd-analyze security myapp          # audit hardening score
```

## 4. Standard Directory Layout

Consistent layout makes deploy, backup, and audit predictable across hosts.

| Path                          | Owner:Group     | Mode | Purpose                              |
|-------------------------------|-----------------|------|--------------------------------------|
| `/var/www`                    | root:root       | 755  | Web app roots (per-app subdir)       |
| `/var/www/<app>`              | deploy:deploy   | 755  | App base (releases/, shared/, current)|
| `/var/www/<app>/shared`       | deploy:deploy   | 750  | Persistent: .env, storage, uploads   |
| `/var/backups`                | root:root       | 700  | Local backup staging                 |
| `/var/log/<app>`              | deploy:deploy   | 750  | App-specific logs                    |
| `/usr/local/bin`             | root:root       | 755  | Deploy/ops scripts (`*-run`, hooks)  |
| `/etc/ecc-ops`                | root:root       | 750  | Agent-managed config/notes           |
| `/opt/<app>`                  | deploy:deploy   | 755  | Non-web services / binaries          |

```bash
APP="myapp"; DU="deploy"
install -d -m 755 -o root  -g root  /var/www
install -d -m 755 -o "$DU" -g "$DU" "/var/www/$APP" "/var/www/$APP/releases"
install -d -m 750 -o "$DU" -g "$DU" "/var/www/$APP/shared" "/var/log/$APP"
install -d -m 700 -o root  -g root  /var/backups
install -d -m 750 -o root  -g root  /etc/ecc-ops
```

> Principle 9: application code lives only under release dirs and changes only via
> deploy. Non-code config (.env, nginx, systemd) may be managed directly here.

## Related

- `ops-discovery` — detect & inventory before/after provisioning; fills Server Profile.
- `ops-firewall` — UFW/firewalld baseline after packages are installed.
- `ops-security-hardening` — deeper layered hardening beyond SSH baseline.
- `ops-webserver` / `ops-runtime-*` — install the stack on top of this baseline.
- `ops-monitoring` / `ops-backup` — close the loop once the host is provisioned.
````

### Skill: ops-discovery

````markdown
---
name: ops-discovery
description: Discover and inventory a server end-to-end (OS, resources, ports, services, runtimes, web server, databases, vhosts/apps, certificates, firewall, cron, backups) and map the findings into the persistent Server Profile; run on first contact and on a recurring schedule.
version: 1.0
---

# ops-discovery

Read-only reconnaissance (Principle 2) that builds and refreshes the persistent
**Server Profile** (Principle 6). Discovery never changes the host — it only reads,
so it is always auto-approved (READ tier). Its output is the single source of truth
that every other domain relies on (Principle 1: detect before adapting).

## When to Use

- First session with a host (before any provisioning or deploy decision).
- Start of every session — quick refresh to detect drift since last run.
- On a recurring schedule (e.g., daily) to keep the Server Profile current.
- After any major change (deploy, new app, firewall edit) to re-sync the profile.

## Full Discovery Script (read-only)

```bash
#!/usr/bin/env bash
# ops-discovery — emits JSON-ready facts. READ-ONLY: no state is modified.
set -uo pipefail

echo "=== IDENTITY & OS ==="
hostname -f 2>/dev/null || hostname
. /etc/os-release 2>/dev/null; echo "os=$PRETTY_NAME id=$ID version=$VERSION_ID"
uname -m; uname -r

echo "=== RESOURCES ==="
nproc                                            # cpu cores
awk '/MemTotal/{printf "ram_mb=%d\n",$2/1024}' /proc/meminfo
free -m | awk '/Swap/{printf "swap_mb=%d\n",$2}'
df -BG --output=target,size,used,avail / /var 2>/dev/null

echo "=== LISTENING PORTS ==="
ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null   # who listens where

echo "=== RUNNING SERVICES ==="
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'

echo "=== RUNTIMES + VERSIONS ==="
for r in php node python3 go java ruby; do
  command -v "$r" >/dev/null 2>&1 && printf "%s=%s\n" "$r" "$($r --version 2>&1 | head -n1)"
done
command -v docker >/dev/null 2>&1 && docker --version

echo "=== WEB SERVER + VERSION ==="
command -v nginx   >/dev/null 2>&1 && nginx -v 2>&1
command -v apache2 >/dev/null 2>&1 && apache2 -v 2>&1 | head -n1
command -v httpd   >/dev/null 2>&1 && httpd -v 2>&1 | head -n1
command -v caddy   >/dev/null 2>&1 && caddy version

echo "=== DATABASES + VERSION ==="
command -v mysql    >/dev/null 2>&1 && mysql --version
command -v psql     >/dev/null 2>&1 && psql --version
command -v redis-cli>/dev/null 2>&1 && redis-cli --version

echo "=== VHOSTS / APPS / DOMAINS ==="
ls -1 /etc/nginx/sites-enabled/ 2>/dev/null
grep -rhoE 'server_name[[:space:]]+[^;]+' /etc/nginx 2>/dev/null | awk '{$1="";print}' | tr -s ' '
grep -rhoE 'ServerName[[:space:]]+\S+' /etc/apache2 /etc/httpd 2>/dev/null
ls -1 /var/www 2>/dev/null

echo "=== TLS CERTIFICATES + EXPIRY ==="
command -v certbot >/dev/null 2>&1 && certbot certificates 2>/dev/null
for c in /etc/letsencrypt/live/*/fullchain.pem; do
  [ -f "$c" ] && echo "$c -> $(openssl x509 -enddate -noout -in "$c" | cut -d= -f2)"
done

echo "=== FIREWALL STATUS ==="
command -v ufw >/dev/null 2>&1 && ufw status verbose 2>/dev/null
command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --list-all 2>/dev/null

echo "=== CRON / SCHEDULED ==="
for u in root deploy; do crontab -l -u "$u" 2>/dev/null | sed "s/^/[$u] /"; done
ls -1 /etc/cron.d/ 2>/dev/null
systemctl list-timers --no-pager --no-legend 2>/dev/null | awk '{print $NF}'

echo "=== BACKUP STATUS ==="
ls -lt /var/backups 2>/dev/null | head -n 5
[ -f /etc/ecc-ops/backup.conf ] && cat /etc/ecc-ops/backup.conf
```

## Mapping Findings to the Server Profile

Discovery writes into the **canonical Server Profile schema defined in Section IV**, at
`~/.ecc-ops/profiles/<host>.json` on the control side. The example below is the
**discovery-populated subset** — it uses the **same keys and types as Section IV**
(see there for the full schema). Refresh fields in place; preserve operator-set notes.

```json
{
  "schema_version": "2.0",
  "host": { "id": "web01", "hostname": "web01.example.com" },
  "last_discovery": "2026-06-14T08:00:00Z",
  "os": { "distro": "Ubuntu", "version": "24.04", "package_manager": "apt", "arch": "x86_64", "kernel": "6.8.0", "init": "systemd" },
  "resources": { "cpu_cores": 4, "ram_mb": 8192, "swap_mb": 2048, "disks": [ { "mount": "/", "size_gb": 80, "used_pct": 26 } ] },
  "stack": {
    "web_server": { "name": "nginx", "version": "1.26.0" },
    "runtimes": [ { "name": "php", "version": "8.3.7", "fpm": true }, { "name": "node", "version": "20.12.2" } ],
    "databases": [ { "engine": "postgresql", "version": "16.3", "bind": "127.0.0.1:5432" } ],
    "cache": [ { "engine": "redis", "version": "7.2", "bind": "127.0.0.1:6379" } ],
    "containers": { "engine": "docker", "version": "26.1.0", "compose": true }
  },
  "apps": [
    { "name": "myapp", "domain": "app.example.com", "path": "/var/www/myapp",
      "repo": "git@github.com:org/myapp.git", "deploy_method": "git+symlink-zero-downtime",
      "service": "myapp.service" }
  ],
  "firewall": {
    "tool": "ufw", "default_incoming": "deny", "default_outgoing": "allow",
    "allowed": [
      { "port": 22, "proto": "tcp", "comment": "ssh" },
      { "port": 80, "proto": "tcp", "comment": "http" },
      { "port": 443, "proto": "tcp", "comment": "https" }
    ]
  },
  "ssl": [ { "domain": "app.example.com", "issuer": "Let's Encrypt", "type": "single", "expires_at": "2026-09-01T00:00:00Z", "auto_renew": true } ],
  "backup": { "configured": true, "last_run": { "at": "2026-06-14T03:00:00Z", "status": "ok" }, "destination": "s3://bkp/web01" },
  "monitoring": { "configured": true, "checks": ["disk", "http", "ssl-expiry"] },
  "audit": { "last_summary": "2026-06-13T12:00:00Z", "open_findings": 2, "hardening_score": 82, "changelog_ref": "~/.ecc-ops/audit/web01.jsonl" },
  "profile_health": "fresh"
}
```

Field-mapping reference:

| Discovery section        | Server Profile field            |
|--------------------------|---------------------------------|
| IDENTITY & OS            | `os.*`                          |
| RESOURCES                | `resources.*`                   |
| LISTENING PORTS          | `listening_ports[]`             |
| RUNTIMES / WEB / DB      | `stack.*`                       |
| VHOSTS / APPS / DOMAINS  | `apps[]` (name, domain, path)   |
| TLS CERTIFICATES         | `ssl[]` (domain, issuer, expires)|
| FIREWALL STATUS          | `firewall.*`                    |
| CRON / TIMERS, BACKUP    | `backup.*`, scheduled jobs      |

## Cadence

- **First session**: run full discovery, create the profile, flag gaps (no firewall,
  no backup, expiring certs) for the orchestrator to address.
- **Recurring**: run on each session start and on a daily timer; diff against the
  stored profile and surface drift (new ports, version changes, near-expiry certs).

## Related

- `ops-server-core` — acts on the gaps discovery reveals (baseline provisioning).
- `ops-monitoring` — turns discovered facts into ongoing proactive checks.
- `ops-ssl` — consumes discovered cert expiry to schedule renewals.
- `ops-firewall` — reconciles discovered open ports against intended policy.
````

### Subagent: server-provisioner

````markdown
---
name: server-provisioner
description: Use PROACTIVELY when a blank or inconsistent server must be brought to a secure production baseline — OS update, deploy user, SSH hardening, swap, essential packages, directory layout, and hardened systemd units. Always discovers first, presents a full plan, executes one step at a time with verification, and saves the Server Profile.
tools: ["Read", "Write", "Edit", "Bash"]
model: sonnet
---

# server-provisioner

You provision bare or drifted servers to a secure, production-ready baseline. You are
stack-agnostic (Principle 1), read-first (Principle 2), idempotent (Principle 4), and
you never harm without confirmation (Principle 8). Your authoritative knowledge is the
`ops-server-core` and `ops-discovery` skills.

## Workflow

### 1. Discovery (read-only)
- Run the `ops-discovery` script. Detect OS family, package manager, init system,
  existing stack, users, SSH config, swap, firewall, and current directory layout.
- Load the existing Server Profile if one exists; otherwise prepare to create it.
- Never write anything in this phase.

### 2. Plan (present BEFORE executing)
- Produce the full provisioning plan as an ordered checklist mapped to the host's
  OS family, marking each step READ / WRITE / DESTRUCTIVE.
- Show concrete impact for every WRITE: exact commands, files touched, and the
  rollback for each (config `.bak`, removable user, restorable fstab line).
- Explicitly call out the SSH hardening lock-out risk and the new-session test.
- Wait for operator approval of the plan before any write.

### 3. Execute (one step at a time)
- Apply steps sequentially in the approved order. After each WRITE step, verify it
  before moving on (e.g., `id deploy`, `sshd -t`, `swapon --show`, `systemctl status`).
- For SSH hardening: back up `sshd_config`, validate with `sshd -t`, `reload` (never
  cut the live session), then instruct the operator to open a NEW session and confirm
  login succeeds BEFORE closing the old one. Keep a rollback ready.
- Before any DESTRUCTIVE action, double-confirm and verify a backup/rollback exists.
- Make every step idempotent so a re-run is safe.

### 4. Validate & Persist
- Run a post-provision health check: services active, SSH key-only login works,
  swap present if needed, firewall baseline up, time synced.
- Run `systemd-analyze security` on any new unit; report the hardening score.
- Hand off to `/security-audit` for a deeper pass.
- Write/refresh the Server Profile (`~/.ecc-ops/profiles/<host>.json`) and append a
  changelog entry (who/what/when/why + rollback) per Principle 7.

## Key Principles
- Detect before you touch; assume nothing about the stack.
- Show the full plan and per-step impact before writing anything.
- One step, one verification — never batch unverified writes.
- SSH hardening is the highest-risk step: always test a new session before closing the old.
- Every write leaves a rollback point; every run is safe to repeat.

**Remember**: A provisioned server is only "done" when it is verified, auditable, and recorded in the Server Profile.
````

### Commands

````markdown
---
description: Interactive wizard that provisions a blank or drifted server to a secure production baseline, then runs a security audit.
---

# /server-setup

Guided, interactive provisioning of a server from bare to production-ready.

## What it does
1. **Discover** — invoke `ops-discovery` (read-only) to detect OS family, package
   manager, init system, existing stack, users, SSH state, swap, and firewall.
   Load or create the Server Profile.
2. **Interview** — confirm with the operator: deploy username, public SSH key,
   timezone, intended apps/domains, and whether passwordless sudo is wanted.
3. **Plan** — hand off to the `server-provisioner` subagent, which presents the full
   ordered plan (each step tagged READ/WRITE/DESTRUCTIVE with impact + rollback).
   Operator approves before any write.
4. **Execute** — `server-provisioner` applies steps one at a time with verification:
   system update, deploy user + SSH key, SSH hardening (with mandatory new-session
   login test before closing the old session), timezone/locale, swap if RAM < 4 GB,
   essential packages, and the standard directory layout.
5. **Validate & record** — post-provision health check, save/refresh the Server
   Profile, and append a changelog entry.
6. **Audit** — finish by invoking `/security-audit` to confirm the new baseline is
   hardened and to surface any remaining findings.

## Safety
- All destructive or lock-out-prone steps (SSH hardening) require single confirmation
  plus a verified new-session login before the old session is closed.
- Every write step prepares a rollback point (config `.bak`, removable user, fstab line).

## Related
- Subagent: `server-provisioner`
- Skills: `ops-server-core`, `ops-discovery`
- Follow-up commands: `/security-audit`, `/harden`, `/firewall`, `/profile`
````

````markdown
---
description: Show, refresh, or edit the persistent Server Profile for a host by running read-only discovery.
---

# /profile

View and maintain the persistent Server Profile (`~/.ecc-ops/profiles/<host>.json`)
that gives the agent context about each managed host (Principle 6).

## Modes
- **show** (default) — print the current stored profile for the host: OS, resources,
  stack, apps/domains, firewall posture, SSL expiry, backup status, last audit.
- **refresh** — invoke the `ops-discovery` skill (read-only), diff the fresh findings
  against the stored profile, surface drift (new ports, version changes, near-expiry
  certs, missing backup), and update the profile in place. Operator-set notes are
  preserved.
- **edit** — update operator-owned fields (app repo URLs, deploy method, intended
  domains, monitoring intent) directly in the profile JSON.

## What it does
1. Resolve the target host (argument or current session host).
2. For `refresh`: run `ops-discovery`, map results to Server Profile fields, write the
   updated JSON, and append a changelog note (Principle 7).
3. For `show`/`edit`: read or modify the stored JSON without touching the server.

## Safety
- `show` and `refresh` are READ tier (discovery never modifies the host).
- `edit` only changes the control-side profile, never the server itself.

## Related
- Skill: `ops-discovery`
- Subagent: `server-provisioner` (consumes the profile during provisioning)
- Commands: `/server-setup`, `/health-check`, `/ops-doctor`
````

## VIII. Domain — Web Serving, DNS & SSL

Tiga domain ini membentuk jalur masuk (ingress) setiap aplikasi web: web server menerima dan merutekan request, DNS memetakan nama ke alamat server, dan SSL mengamankan transport. Ketiganya saling bergantung dan harus dikonfigurasi dalam urutan yang benar — DNS terlebih dahulu (agar nama menunjuk ke server), lalu web server (agar ada yang melayani request), baru SSL (yang memverifikasi kepemilikan domain via HTTP-01/DNS-01). Agent menerapkan Prinsip 1 (stack-agnostic): mendeteksi web server yang terpasang (Nginx/Apache/Caddy) dan runtime aplikasi sebelum menulis config, Prinsip 2 (read-first): mengaudit konfigurasi eksisting dan memvalidasi (`nginx -t`, `apachectl configtest`) sebelum reload, serta Prinsip 3 (rollback-ready): menyimpan salinan config lama sebelum setiap perubahan. Semua operasi yang menulis config atau me-reload service masuk tier WRITE (konfirmasi tunggal + tampilkan dampak + sediakan rollback).

### Skill: ops-webserver

````markdown
---
name: ops-webserver
description: Configure and troubleshoot Nginx, Apache, and Caddy for PHP-FPM apps and reverse-proxied Node/Go/Python/Java services with production-grade security and performance.
version: 1.0
---

# Web Server Operations (Nginx / Apache / Caddy)

## When to Use
- Setting up a virtual host / server block for a new application.
- Configuring a reverse proxy in front of an app runtime (Node, Go, Python, Java).
- Hardening web server security headers and blocking sensitive paths.
- Tuning worker processes, gzip, sendfile, and buffers for throughput.
- Diagnosing HTTP errors (502/504/403/413/404) from the web server layer.

Always run `nginx -t` (or `apachectl configtest` / `caddy validate`) before reloading.
Keep a copy of the old config first (Principle 3). Reloading a service is a WRITE
operation: show the diff and impact, then confirm.

## Detection First (Principle 1)
```bash
# Which web server is installed and listening?
command -v nginx apache2 httpd caddy 2>/dev/null
ss -ltnp | grep -E ':80|:443'
systemctl is-active nginx apache2 httpd caddy 2>/dev/null

# Locate config roots
nginx -V 2>&1 | tr ' ' '\n' | grep -E 'conf-path|prefix'   # Nginx
apachectl -V 2>/dev/null | grep -E 'SERVER_CONFIG_FILE|HTTPD_ROOT'  # Apache
ls -la /etc/caddy/Caddyfile 2>/dev/null                    # Caddy
```

## Nginx — PHP-FPM Application (root /public)

For modern PHP frameworks (Laravel, Symfony, WordPress in a subdir) the document
root is the `public/` directory; everything else stays above the web root.

```nginx
# /etc/nginx/sites-available/example.com
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    # All HTTP -> HTTPS (managed by Certbot after issuance; keep ACME path open)
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com www.example.com;

    root /var/www/example.com/current/public;
    index index.php;

    # --- TLS (certs injected by Certbot / ops-ssl) ---
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;   # protocols + ciphers

    # --- Security headers ---
    add_header X-Frame-Options              "SAMEORIGIN"        always;
    add_header X-Content-Type-Options       "nosniff"           always;
    add_header Referrer-Policy              "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy           "geolocation=(), microphone=(), camera=()" always;
    add_header Strict-Transport-Security    "max-age=63072000; includeSubDomains" always; # see ops-ssl HSTS note
    server_tokens off;

    # --- Upload limit (match php.ini upload_max_filesize/post_max_size) ---
    client_max_body_size 25m;

    # --- Logging ---
    access_log /var/log/nginx/example.com.access.log;
    error_log  /var/log/nginx/example.com.error.log warn;

    # --- Front controller ---
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # --- PHP-FPM ---
    location ~ \.php$ {
        try_files $uri =404;                       # do not pass non-existent files to FPM
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass unix:/run/php/app.sock;        # per-app pool from ops-runtime-php
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT   $realpath_root;
        fastcgi_param HTTPS on;
        fastcgi_read_timeout 60s;
        fastcgi_buffers 16 16k;
        fastcgi_buffer_size 32k;
    }

    # --- Static asset caching ---
    location ~* \.(?:css|js|jpg|jpeg|png|gif|ico|svg|webp|woff2?|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # --- Block sensitive files & VCS/dependency dirs ---
    location ~ /\.(?!well-known) { deny all; }          # dotfiles incl. .env, .git
    location ~ \.(?:env|ini|log|sh|sql|bak|conf)$ { deny all; }
    location ~* /(?:vendor|node_modules|storage|tests)/ { deny all; }
    location = /composer.json  { deny all; }
    location = /composer.lock  { deny all; }
    location = /package.json   { deny all; }
}
```

Enable and reload:
```bash
ln -sf /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/example.com
nginx -t && systemctl reload nginx
```

## Nginx — Reverse Proxy (Node / Go / Python / Java)

Use a named upstream with keepalive for connection reuse. Forward the real client
IP and scheme, and handle WebSocket upgrades.

```nginx
# /etc/nginx/sites-available/app.example.com
upstream app_backend {
    server 127.0.0.1:3000;          # Node/Next, Go, Gunicorn, Spring Boot, etc.
    keepalive 32;                    # reuse upstream connections
}

map $http_upgrade $connection_upgrade {  # WebSocket support
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    client_max_body_size 25m;

    access_log /var/log/nginx/app.example.com.access.log;
    error_log  /var/log/nginx/app.example.com.error.log warn;

    # Optional: serve static assets directly (Next.js build output, Go embed, etc.)
    location /_next/static/ {
        alias /var/www/app/current/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;

        # WebSocket upgrade
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Pass real client info
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        # NOTE: do NOT add a second `proxy_set_header Connection ""` here — the last
        # directive wins for the whole location and would kill WebSocket upgrades.
        # The $connection_upgrade map already yields "close" for non-upgrade requests.

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Buffering
        proxy_buffering on;
        proxy_buffers 16 16k;
        proxy_buffer_size 32k;
    }
}
```

> Note: when WebSockets are required on the same server block, keep the `Connection`
> header driven by the `$connection_upgrade` map (set `proxy_set_header Connection
> $connection_upgrade;`) instead of clearing it. Use cleared `Connection ""` only on
> blocks that are pure HTTP keepalive without upgrades.

## Nginx — Global Tuning (nginx.conf)

```nginx
# /etc/nginx/nginx.conf (excerpt)
worker_processes  auto;            # one per CPU core
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
}

http {
    sendfile        on;            # zero-copy file transfer
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout  65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens   off;

    # Compression
    gzip              on;
    gzip_vary         on;
    gzip_comp_level   5;
    gzip_min_length   256;
    gzip_proxied      any;
    gzip_types text/plain text/css application/json application/javascript
               application/xml+rss text/xml image/svg+xml application/font-woff2;

    # Buffers / timeouts (DoS resilience)
    client_body_timeout   12s;
    client_header_timeout 12s;
    send_timeout          10s;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

## Apache — Virtual Host (PHP + Reverse Proxy)

```bash
# Required modules
a2enmod rewrite headers ssl proxy proxy_http proxy_wstunnel
# PHP via PHP-FPM (preferred over mod_php)
a2enconf php8.3-fpm
```

```apache
# /etc/apache2/sites-available/example.com.conf
<VirtualHost *:443>
    ServerName  example.com
    ServerAlias www.example.com
    DocumentRoot /var/www/example.com/current/public

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem

    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains"
    ServerSignature Off

    <Directory /var/www/example.com/current/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # PHP-FPM handoff
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/run/php/app.sock|fcgi://localhost"
    </FilesMatch>

    # Block sensitive files
    <FilesMatch "(^\.|\.(env|ini|log|sh|sql|bak)$)">
        Require all denied
    </FilesMatch>

    LimitRequestBody 26214400   # 25 MiB upload cap

    ErrorLog  ${APACHE_LOG_DIR}/example.com.error.log
    CustomLog ${APACHE_LOG_DIR}/example.com.access.log combined
</VirtualHost>

# Reverse proxy variant (Node/Go/Python)
<VirtualHost *:443>
    ServerName app.example.com
    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/app.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/app.example.com/privkey.pem

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    # WebSocket upgrade
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*) ws://127.0.0.1:3000/$1 [P,L]
</VirtualHost>
```

```bash
a2ensite example.com.conf
apachectl configtest && systemctl reload apache2
```

## Caddy — Automatic HTTPS

Caddy obtains and renews TLS certificates automatically; no Certbot needed.

```caddy
# /etc/caddy/Caddyfile

# PHP-FPM site
example.com {
    root * /var/www/example.com/current/public
    encode gzip zstd
    php_fastcgi unix//run/php/app.sock
    file_server

    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        -Server
    }

    # Block sensitive paths
    @sensitive path /.env /.git/* /vendor/* /storage/* /composer.* 
    respond @sensitive 403

    request_body { max_size 25MB }
    log { output file /var/log/caddy/example.com.log }
}

# Reverse proxy site (Node/Go/Python) — auto-SSL + WebSocket handled natively
app.example.com {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
        transport http { keepalive 32 }
    }
    log { output file /var/log/caddy/app.example.com.log }
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

## Troubleshooting — Common HTTP Errors

| Error | Typical meaning | First checks | Common fix |
|-------|-----------------|--------------|------------|
| **502 Bad Gateway** | Upstream (FPM/app) down or wrong socket/port | `systemctl status php8.3-fpm`; `ss -ltnp \| grep 3000`; tail nginx error log | Start/restart FPM or app; correct `fastcgi_pass`/`proxy_pass` target; fix socket path/perms |
| **504 Gateway Timeout** | Upstream too slow to respond | App/DB slow query; `fastcgi_read_timeout`/`proxy_read_timeout` | Raise timeout for known-slow endpoint; fix slow query (ops-performance); add caching |
| **403 Forbidden** | Permission or explicit deny rule | File perms/owner; SELinux/AppArmor; `deny`/`Require` blocks | `chown -R www-data` on web root; relax over-broad deny; `chmod 755` dirs / `644` files |
| **413 Payload Too Large** | Upload exceeds limit | `client_max_body_size` / `LimitRequestBody` vs `post_max_size` | Raise nginx/Apache limit AND PHP `upload_max_filesize`+`post_max_size`; reload both |
| **404 Not Found** | Wrong root or missing front-controller rewrite | `root` path; `try_files`/`mod_rewrite`; symlink `current` valid | Point root at `/public`; add `try_files $uri /index.php?$query_string`; fix release symlink |

## Related
- [ops-ssl](../ops-ssl/SKILL.md) — TLS certificates and HTTPS hardening.
- [ops-dns](../ops-dns/SKILL.md) — resolve names to this server before serving.
- [ops-runtime-php](../ops-runtime-php/SKILL.md) — PHP-FPM pool referenced by `fastcgi_pass`.
- [ops-runtime-node](../ops-runtime-node/SKILL.md) / [ops-runtime-go](../ops-runtime-go/SKILL.md) / [ops-runtime-python](../ops-runtime-python/SKILL.md) — proxied upstreams.
- [ops-performance](../ops-performance/SKILL.md) — tuning workers, buffers, caching.
- [ops-log-management](../ops-log-management/SKILL.md) — access/error log locations and queries.
````

### Skill: ops-dns

````markdown
---
name: ops-dns
description: Manage DNS records (A/AAAA/CNAME/MX/TXT/CAA/PTR), verify propagation, and satisfy DNS prerequisites before issuing SSL certificates.
version: 1.0
---

# DNS Operations

## When to Use
- Pointing a domain (apex + www) at a server before serving traffic or issuing SSL.
- Verifying that DNS changes have propagated globally.
- Setting up mail-related records (MX, SPF/TXT, reverse DNS/PTR).
- Restricting which CAs may issue certs for a domain (CAA).
- Planning a low-risk migration with TTL strategy.

DNS itself is usually managed at the registrar/provider (READ from the server,
WRITE at the provider). The agent verifies records and advises; it does not assume
API access unless configured.

## Record Types — Reference

| Type | Purpose | Example value | Notes |
|------|---------|---------------|-------|
| **A** | Hostname → IPv4 | `203.0.113.10` | Required before HTTP-01 SSL issuance |
| **AAAA** | Hostname → IPv6 | `2001:db8::10` | Add only if server has working IPv6 |
| **CNAME** | Alias → another name | `www → example.com.` | Never on the apex/root; not alongside other records |
| **MX** | Mail exchanger | `10 mail.example.com.` | Lower priority number = preferred |
| **TXT** | Arbitrary text | `v=spf1 ...` / ACME tokens | SPF, DKIM, DMARC, DNS-01 challenge |
| **CAA** | Authorize CAs | `0 issue "letsencrypt.org"` | Restricts who can issue certs |
| **PTR** | IP → hostname (reverse) | `10.113.0.203.in-addr.arpa` | Set at IP/hosting provider, not domain zone |

## Recommended Setup — Apex + www

Two common patterns:

```text
# Pattern A: both as A records (simplest, works on every provider)
example.com.      A      203.0.113.10
www.example.com.  A      203.0.113.10

# Pattern B: apex A + www as CNAME (single source of truth for IP)
example.com.      A      203.0.113.10
www.example.com.  CNAME  example.com.
```

The web server then handles the canonical redirect (see ops-webserver: `www -> apex`
or vice versa via `return 301`).

## Verify Propagation

```bash
# A / AAAA records
dig +short A   example.com
dig +short AAAA example.com
dig +short www.example.com

# Query a specific public resolver (bypass local cache)
dig +short A example.com @1.1.1.1
dig +short A example.com @8.8.8.8

# Authoritative answer + TTL
dig example.com A +noall +answer
dig example.com NS +short            # which nameservers are authoritative

# Alternatives
host example.com
nslookup example.com 1.1.1.1
```

A record is "propagated" for SSL purposes once the public resolver used by the CA
returns the server's IP. Local `/etc/hosts` overrides do NOT count.

## Prerequisite Before Issuing SSL (Principle 2)

```bash
# The hostname being secured MUST resolve to THIS server's public IP.
THIS_IP=$(curl -s https://ifconfig.me)
RESOLVED=$(dig +short A example.com @1.1.1.1 | tail -n1)
echo "server=$THIS_IP  dns=$RESOLVED"
[ "$THIS_IP" = "$RESOLVED" ] && echo "OK: ready for HTTP-01" || echo "MISMATCH: fix A record first"
```

If they differ, HTTP-01/TLS-ALPN issuance will fail. Either fix the A record and
wait for TTL, or use DNS-01 (works without an A record — see ops-ssl wildcard).

## CAA — Restrict Certificate Authorities

```text
example.com.  CAA  0 issue "letsencrypt.org"
example.com.  CAA  0 issuewild "letsencrypt.org"      # wildcard issuance
example.com.  CAA  0 iodef "mailto:security@example.com"
```

```bash
dig +short CAA example.com    # verify
```

Without a CAA record any CA may issue; adding one is defense-in-depth (Principle 5).
Ensure the CA you use (e.g. `letsencrypt.org`) is listed, or issuance will be refused.

## Mail: SPF / DKIM / DMARC / Reverse DNS

```text
example.com.        TXT  "v=spf1 ip4:203.0.113.10 -all"
_dmarc.example.com. TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"
sel._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=MIGf..."   # from mail server
```

Reverse DNS (PTR) must match the sending hostname or mail will be flagged as spam:
```bash
dig +short -x 203.0.113.10        # should return mail.example.com.
```
Set the PTR at the hosting/IP provider (it controls the reverse zone), not in the
domain's forward zone.

## TTL Strategy for Migration

1. **Before** the change: lower TTL on the affected records to 300s (5 min) and wait
   for the OLD TTL to elapse so caches expire quickly.
2. **Cut over**: update the A/AAAA to the new IP. Clients pick it up within ~5 min.
3. **After** verifying stability: raise TTL back to 3600s+ to reduce query load.

```bash
# Watch the change take effect
watch -n 30 'dig +short A example.com @1.1.1.1'
```

Keep both old and new servers serving during the cutover window so no requests drop.

## Related
- [ops-ssl](../ops-ssl/SKILL.md) — needs A record (HTTP-01) or DNS access (DNS-01).
- [ops-webserver](../ops-webserver/SKILL.md) — serves the names resolved here; canonical redirects.
- [ops-discovery](../ops-discovery/SKILL.md) — records domains/IPs into the Server Profile.
- [ops-security-hardening](../ops-security-hardening/SKILL.md) — CAA, SPF/DMARC as layered defense.
````

### Skill: ops-ssl

````markdown
---
name: ops-ssl
description: Issue, renew, and harden TLS/SSL certificates with Let's Encrypt/Certbot — including wildcard via DNS-01, auto-renewal hooks, and modern cipher/HSTS configuration.
version: 1.0
---

# TLS / SSL Operations (Let's Encrypt / Certbot)

## When to Use
- Issuing a certificate for a new domain (single, multi-SAN, or wildcard).
- Enabling and verifying automatic renewal.
- Hardening TLS (protocols, ciphers, OCSP stapling, HSTS).
- Monitoring certificate expiry proactively.
- Diagnosing TLS errors (expired, mixed content, redirect loop, OCSP).

Issuing/renewing a cert and reloading the web server is a WRITE operation: confirm
first. Always verify the DNS prerequisite (ops-dns) before HTTP-01 issuance.

## Install Certbot — per OS

```bash
# Debian/Ubuntu (snap is upstream-recommended; apt also works)
apt update && apt install -y certbot python3-certbot-nginx python3-certbot-apache

# RHEL/Rocky/Alma
dnf install -y epel-release
dnf install -y certbot python3-certbot-nginx python3-certbot-apache

# DNS-01 plugin example (Cloudflare) — for wildcard
apt install -y python3-certbot-dns-cloudflare
```

## Issue a Certificate

```bash
# Nginx plugin: edits the server block and reloads automatically
certbot --nginx -d example.com -d www.example.com \
        --redirect --agree-tos -m admin@example.com --no-eff-email

# Apache plugin
certbot --apache -d example.com -d www.example.com --redirect -m admin@example.com

# Webroot (no web-server plugin; app serves the challenge dir)
certbot certonly --webroot -w /var/www/letsencrypt \
        -d example.com -d www.example.com -m admin@example.com --agree-tos

# Standalone (Certbot binds :80 itself — stop the web server first)
systemctl stop nginx
certbot certonly --standalone -d example.com -m admin@example.com --agree-tos
systemctl start nginx
```

## Wildcard via DNS-01

Wildcards (`*.example.com`) require DNS-01; HTTP-01 cannot validate a wildcard.

```bash
# Cloudflare credentials file (dir 700, file 600) — create the dir first on a fresh host
install -d -m 700 /root/.secrets
install -m 600 /dev/null /root/.secrets/cloudflare.ini
printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" > /root/.secrets/cloudflare.ini

certbot certonly \
  --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d example.com -d '*.example.com' \
  -m admin@example.com --agree-tos --no-eff-email
```

Store the API token via ops-secrets; restrict the token to the single zone (Principle 5).

## Auto-Renewal + Deploy Hook

Certbot installs a systemd timer (`certbot.timer`) or cron job automatically. Verify
and add a deploy hook to reload services only when a cert actually renews.

```bash
systemctl list-timers certbot.timer          # confirm timer is active
certbot renew --dry-run                       # simulate renewal end-to-end

# Reload web server after any successful renewal (runs only on renew)
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
nginx -t && systemctl reload nginx
# systemctl reload apache2   # if Apache
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-services.sh
```

## TLS Hardening

Certbot drops `options-ssl-nginx.conf`; for explicit control use the snippet below.
Recommended Mozilla "intermediate" profile (broad compatibility, no legacy TLS).

```nginx
# /etc/nginx/snippets/tls-hardening.conf
ssl_protocols             TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;                       # TLS 1.3 picks; let client choose
ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

# Session resumption
ssl_session_cache    shared:SSL:10m;
ssl_session_timeout  1d;
ssl_session_tickets  off;

# OCSP stapling
ssl_stapling         on;
ssl_stapling_verify  on;
ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;
```

### HSTS — enable only after you are sure

```nginx
# Add AFTER confirming HTTPS works on every subdomain you'll include.
# preload is hard to reverse — add it last, deliberately.
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
# add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

HSTS forces HTTPS for `max-age`. If a subdomain still needs HTTP, or your cert lapses,
clients will be unable to connect. Start without `includeSubDomains`/`preload`, verify,
then expand. This is a deliberate, confirmed change.

## Monitor Expiry

```bash
# Local: days remaining for a live cert file
openssl x509 -enddate -noout -in /etc/letsencrypt/live/example.com/fullchain.pem

# Remote: check the served cert (catches misconfig, not just file age)
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -enddate
```

```bash
#!/usr/bin/env bash
# /usr/local/bin/ssl-expiry-check.sh — warn under 21 days (wire to ops-monitoring)
set -euo pipefail
THRESHOLD_DAYS=21
for host in "$@"; do
  end=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
        | openssl x509 -noout -enddate | cut -d= -f2)
  end_epoch=$(date -d "$end" +%s 2>/dev/null || date -jf '%b %e %T %Y %Z' "$end" +%s)
  days=$(( (end_epoch - $(date +%s)) / 86400 ))
  if [ "$days" -lt "$THRESHOLD_DAYS" ]; then
    echo "WARN  $host expires in ${days}d"
  else
    echo "OK    $host expires in ${days}d"
  fi
done
```

## Verify After Issuance (Principle 2)

```bash
nginx -t && systemctl reload nginx
curl -sI https://example.com | head -n1                 # expect HTTP/2 200
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | grep -E 'Protocol|Cipher'                            # expect TLSv1.3 / strong cipher
```

## Troubleshooting

| Symptom | Likely cause | Diagnose | Fix |
|---------|--------------|----------|-----|
| **Cert expired / NET::ERR_CERT_DATE_INVALID** | Renewal failed silently | `certbot renew --dry-run`; check `certbot.timer`; read `/var/log/letsencrypt/` | Fix renewal blocker (DNS/port 80), `certbot renew --force-renewal`, reload |
| **Mixed content** | Page loads `http://` assets over HTTPS | Browser console; grep templates for `http://` | Use protocol-relative or `https://`; set `X-Forwarded-Proto` so app builds HTTPS URLs |
| **Redirect loop (ERR_TOO_MANY_REDIRECTS)** | App+proxy both redirect, or proxy strips HTTPS | `curl -sIL`; check `X-Forwarded-Proto`; check app `force_https` | Pass `X-Forwarded-Proto $scheme`; redirect in one layer only |
| **OCSP stapling not working** | Missing `chain.pem`/resolver, or fetch failed | `openssl s_client -status -connect host:443 \| grep -A1 OCSP` | Set `ssl_trusted_certificate chain.pem` + `resolver`; reload |
| **HTTP-01 challenge fails** | A record wrong, port 80 closed, ACME path blocked | `dig +short A host`; `ss -ltnp \| grep :80`; UFW rule | Fix A record (ops-dns), open 80 (ops-firewall), keep `/.well-known/acme-challenge/` reachable |
| **SAN mismatch (cert for wrong name)** | Domain not in cert | `openssl s_client ... \| openssl x509 -noout -text \| grep DNS:` | Reissue with all `-d` names; ensure `server_name` matches |

## Related
- [ops-dns](../ops-dns/SKILL.md) — A record / DNS-01 prerequisite for issuance.
- [ops-webserver](../ops-webserver/SKILL.md) — where certs and TLS snippets are wired in.
- [ops-firewall](../ops-firewall/SKILL.md) — port 80/443 must be open for ACME and HTTPS.
- [ops-secrets](../ops-secrets/SKILL.md) — store DNS-provider API tokens for DNS-01.
- [ops-monitoring](../ops-monitoring/SKILL.md) — alert on approaching expiry.
- [ops-security-hardening](../ops-security-hardening/SKILL.md) — HSTS, cipher policy as layered defense.
````

### Commands

````markdown
---
description: Configure and verify DNS records (apex + www, MX/TXT/CAA) and confirm propagation so a domain points at this server before serving or issuing SSL.
---

# /dns-setup

Set up and validate DNS for a domain so it correctly resolves to this server. This
command applies the **ops-dns** skill and is READ-first: it inspects and verifies
before recommending any provider-side change.

## Steps

1. **Gather context (READ).** Load the Server Profile for this host to get its public
   IP(s). Ask for the target domain if not supplied. Determine the desired pattern
   (apex+www as A/A, or apex A + www CNAME).
2. **Audit current records (READ).** Run `dig` for A/AAAA/CNAME/MX/TXT/CAA/NS against
   public resolvers (`@1.1.1.1`, `@8.8.8.8`) and show the current state vs. desired.
3. **Plan changes.** Present the exact records to create/modify at the DNS provider,
   including recommended TTLs. If a migration is involved, propose the TTL strategy
   (lower first, cut over, raise back). This is the WRITE proposal — confirm before
   the operator applies them at the provider (or before any configured provider API
   call runs).
4. **Verify propagation (READ).** Re-query until the public resolver returns this
   server's IP. Confirm the SSL prerequisite: `dig +short A <domain> @1.1.1.1` equals
   the server's public IP.
5. **Advise CAA & mail (optional).** Recommend a CAA record for the chosen CA and,
   for mail-sending hosts, SPF/DMARC plus a matching PTR at the IP provider.
6. **Record.** Update the Server Profile with the domain(s) and confirmed resolution,
   and log the change to the audit trail.

## Subagents & Skills
- Skill: **ops-dns** (records, propagation, prerequisites).
- Runs largely as direct READ checks; hands off to **/ssl-setup** once A records resolve.

## Output
A before/after record table, propagation confirmation, and a clear "ready for SSL"
or "blocked: fix A record" verdict.
````

````markdown
---
description: Issue and install a TLS certificate (Let's Encrypt/Certbot), wire it into the web server, enable auto-renewal, and apply TLS hardening with verification.
---

# /ssl-setup

Obtain and install HTTPS for a domain, then harden and verify it. This command applies
the **ops-ssl** skill. Issuing a cert and reloading the web server is a **WRITE**
operation — show impact and confirm before applying.

## Steps

1. **Preflight (READ).** Confirm the DNS prerequisite via ops-dns: the hostname(s)
   resolve to this server's public IP (HTTP-01) — or that DNS-provider credentials are
   available (DNS-01 / wildcard). Verify ports 80/443 are open (ops-firewall) and the
   web server is healthy.
2. **Detect & choose method.** Identify the web server (Nginx/Apache/Caddy). For
   Caddy, certificates are automatic — only verify. Otherwise choose plugin
   (`--nginx`/`--apache`), `webroot`, or `standalone`; use DNS-01 for wildcards.
3. **Backup (Principle 3).** Snapshot the existing server block/vhost before Certbot
   edits it, so the change is reversible.
4. **Issue (WRITE — confirm).** Run Certbot with the chosen method and all `-d` names.
   Show the exact command and its impact (config edit + reload) before executing.
5. **Auto-renewal.** Verify `certbot.timer`, run `certbot renew --dry-run`, and install
   the deploy hook that reloads the web server only on successful renewal.
6. **Harden.** Apply the TLS snippet (TLSv1.2/1.3, modern ciphers, OCSP stapling,
   session settings). Propose HSTS as a separate, explicit confirmation — start
   without `includeSubDomains`/`preload`.
7. **Verify (Principle 2).** `nginx -t && systemctl reload nginx`; `curl -sI` for a
   200 over HTTP/2; `openssl s_client` to confirm protocol/cipher and chain.
8. **Record.** Save certificate domains and expiry to the Server Profile, register the
   host with the expiry monitor (ops-monitoring), and log to the audit trail.

## Subagents & Skills
- Skill: **ops-ssl** (issuance, renewal, hardening); **ops-dns** (preflight); **ops-firewall** (ports).
- Subagent: **security-auditor** may follow up to score the resulting TLS posture.

## Output
The issued certificate's domains and expiry, renewal-test result, hardening summary,
and a verified "HTTPS live" confirmation.
````

## IX. Domain — Runtimes & Containers

Setelah Server Profile terisi (lihat domain Discovery), agent menentukan runtime aplikasi dengan membaca berkas penanda di root repo, bukan dengan menebak. Setiap penanda memetakan ke satu skill runtime: `composer.json` → `ops-runtime-php`, `package.json` → `ops-runtime-node`, `requirements.txt`/`pyproject.toml` → `ops-runtime-python`, `go.mod` → `ops-runtime-go`, `pom.xml`/`build.gradle` → `ops-runtime-java`, dan `Dockerfile`/`docker-compose.yml` → `ops-containers`. Satu host bisa menjalankan banyak runtime sekaligus (mis. PHP untuk app utama, Node untuk worker), sehingga agent memuat beberapa skill secara paralel. Deteksi ini bersifat read-only (Prinsip 2); pemasangan/pembaruan runtime adalah operasi WRITE dengan rollback siap (Prinsip 3), dan setiap deploy harus idempoten (Prinsip 4 & 9).

### Skill: ops-runtime-php

````markdown
---
name: ops-runtime-php
description: PHP-FPM pool tuning, opcache, Composer deploy, and Laravel/Symfony operations for production.
version: 1.0
---

# PHP Runtime Operations

## When to Use
Load when `composer.json` (or `*.php` + `php-fpm`) is detected. Covers PHP 8.3/8.4 with
PHP-FPM behind Nginx/Apache, OPcache tuning, Composer-based deploys, and Laravel/Symfony
artisan/console workflows.

## FPM Pool Tuning
Per-app pool isolation: one socket + one Unix user per app. Avoid the shared `www.conf`.

`max_children` formula: `(RAM available for PHP) / (avg process RSS)`. Measure RSS first
(WRITE requires no change, READ-only):

```bash
# Average resident memory per php-fpm worker (MB)
ps --no-headers -o rss -C php-fpm8.3 | awk '{s+=$1; n++} END {printf "%.0f MB avg over %d procs\n", s/n/1024, n}'
```

```ini
; /etc/php/8.3/fpm/pool.d/app.conf
[app]
user = app
group = app
listen = /run/php/app.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

pm = dynamic
pm.max_children = 24          ; = usable_RAM_MB / avg_RSS_MB
pm.start_servers = 6
pm.min_spare_servers = 4
pm.max_spare_servers = 10
pm.max_requests = 500         ; recycle workers to bound memory leaks

request_terminate_timeout = 60s
catch_workers_output = yes
php_admin_value[error_log] = /var/log/php/app-error.log
php_admin_flag[log_errors] = on
```

Use `pm = static` only on dedicated single-app hosts with predictable load (set
`pm.max_children` = the static count). Use `pm = ondemand` for many low-traffic sites.

## OPcache (Production)
```ini
; /etc/php/8.3/fpm/conf.d/10-opcache.ini
opcache.enable=1
opcache.enable_cli=0
opcache.memory_consumption=256
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=20000      ; >= number of .php files
opcache.validate_timestamps=0            ; production: never re-stat; reload FPM on deploy
opcache.jit=tracing
opcache.jit_buffer_size=128M
opcache.preload=/var/www/app/preload.php ; optional; preload.php must be readable by FPM user
opcache.preload_user=app
```
With `validate_timestamps=0`, code changes are invisible until FPM reload — every deploy
MUST end with `systemctl reload php8.3-fpm` (the deploy step is the WRITE/rollback boundary).

## Composer Deploy
```bash
# Idempotent production install — never run composer update on a server
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist --no-progress
composer dump-autoload --classmap-authoritative --no-dev   # if autoload map changed
```
Commit `composer.lock`; the server installs exactly the locked versions (Prinsip 9).

## Laravel / Symfony
```bash
# Laravel — production deploy sequence (run inside release dir, before symlink flip)
php artisan down --render="errors::503" --retry=15   # optional maintenance window
php artisan migrate --force                           # --force = non-interactive (WRITE: back up DB first)
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
php artisan storage:link
php artisan up

# Symfony equivalent
php bin/console cache:clear --env=prod --no-debug
php bin/console doctrine:migrations:migrate --no-interaction   # WRITE: back up DB first
php bin/console asset-map:compile                              # or assets:install --symlink
```
Caches are environment-specific — clear/rebuild them on every release. `migrate --force`
is a WRITE operation; the orchestrator backs up the DB (see ops-backup) before invoking it.

## php.ini (Production Hardening)
```ini
expose_php = Off
display_errors = Off
log_errors = On
memory_limit = 256M
max_execution_time = 30
upload_max_filesize = 16M
post_max_size = 20M
realpath_cache_size = 4096k
realpath_cache_ttl = 600
session.cookie_httponly = 1
session.cookie_secure = 1
session.cookie_samesite = "Lax"
disable_functions = exec,passthru,shell_exec,system,proc_open,popen
```

## PHP Version Upgrade Path
1. Install the new version side-by-side (`apt install php8.4-fpm php8.4-{cli,mbstring,...}`); the old version keeps running (Prinsip 3).
2. Replicate the pool config under `/etc/php/8.4/fpm/pool.d/` and verify `php8.4-fpm -t`.
3. Point the Nginx `fastcgi_pass` to the new socket for one app; smoke-test.
4. Roll remaining apps; once stable, stop and purge the old FPM service.

## Related
- ops-webserver — Nginx `fastcgi_pass` and FPM socket wiring.
- ops-deploy — zero-downtime symlink release flow that calls this skill.
- ops-database — DB backup before `migrate --force`.
- ops-performance — profiling slow PHP requests and FPM saturation.
````

### Skill: ops-runtime-node

````markdown
---
name: ops-runtime-node
description: Node.js process management with PM2 or systemd, npm ci deploys, builds, and graceful reload.
version: 1.0
---

# Node.js Runtime Operations

## When to Use
Load when `package.json` is detected. Covers Node 20/22 LTS, PM2 cluster mode or systemd
supervision, reproducible `npm ci` installs, framework builds (Next.js), and graceful reloads.

## Version Pinning
Commit `.nvmrc` and the `engines` field so every environment uses one Node version.
```
# .nvmrc
22
```
```bash
nvm install && nvm use      # reads .nvmrc
node -v                     # verify matches engines.node
```

## Install & Build
```bash
# Reproducible production install (respects package-lock.json; fails if lock is stale)
npm ci --omit=dev
# If the build needs devDependencies, do a full ci, build, then prune:
npm ci && npm run build && npm prune --omit=dev

# Next.js standalone output (smallest runtime surface)
npm run build               # next.config.js: output: 'standalone'
node .next/standalone/server.js
```

## PM2 (Cluster)
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'app',
    script: 'dist/server.js',
    instances: 'max',              // one worker per CPU core
    exec_mode: 'cluster',
    max_memory_restart: '512M',    // restart a worker that exceeds this RSS
    node_args: '--max-old-space-size=448',
    env_production: { NODE_ENV: 'production', PORT: 3000 },
    error_file: '/var/log/app/err.log',
    out_file: '/var/log/app/out.log',
    time: true,
  }],
};
```
```bash
pm2 start ecosystem.config.js --env production
pm2 reload app          # zero-downtime rolling reload across cluster workers
pm2 save                # persist process list
pm2 startup systemd     # generate boot unit (run printed command once)
```

## systemd (PM2 Alternative)
Prefer systemd for single-process apps or to avoid the PM2 daemon. Use the Node cluster
module or run N units behind Nginx upstream for multi-core.
```ini
# /etc/systemd/system/app.service
[Unit]
Description=Node app
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/var/www/app
Environment=NODE_ENV=production
EnvironmentFile=/var/www/app/.env
ExecStart=/usr/bin/node dist/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
# hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/www/app/storage

[Install]
WantedBy=multi-user.target
```

## Graceful Reload
The app must handle `SIGTERM`/`SIGHUP`: stop accepting new connections, drain in-flight
requests, then exit. PM2 `reload` and systemd `Restart` rely on this for zero-downtime.
```javascript
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGHUP',  () => server.close(() => process.exit(0)));  // systemctl reload sends SIGHUP
```

## Node Version Upgrade Path
1. Bump `.nvmrc` + `engines.node`; `nvm install <new>` alongside the old (Prinsip 3).
2. `npm ci` against the new version in a release dir; run the test/smoke suite.
3. Flip PM2/systemd `ExecStart` to the new Node path; `pm2 reload` / `systemctl restart`.
4. Verify health endpoint, then remove the old Node version.

## Related
- ops-webserver — Nginx reverse proxy / upstream to the Node port.
- ops-deploy — release directory + symlink flip that triggers `pm2 reload`.
- ops-monitoring — health endpoint and memory-restart alerting.
- ops-log-management — rotating PM2 / app log files.
````

### Skill: ops-runtime-python

````markdown
---
name: ops-runtime-python
description: Python WSGI/ASGI deploys with venv, Gunicorn/uvicorn, systemd, and Django operations.
version: 1.0
---

# Python Runtime Operations

## When to Use
Load when `requirements.txt` or `pyproject.toml` is detected. Covers Python 3.12/3.13,
isolated virtualenvs, Gunicorn (WSGI) and uvicorn (ASGI/FastAPI), systemd + socket
activation, and Django `migrate`/`collectstatic`.

## Virtualenv & Dependency Pinning
```bash
python3.12 -m venv /var/www/app/.venv
/var/www/app/.venv/bin/pip install --upgrade pip wheel
# Pinned, hash-verified install (generate requirements.txt via pip-compile / uv)
/var/www/app/.venv/bin/pip install -r requirements.txt --require-hashes --no-deps
```
Always commit a fully pinned `requirements.txt` (or `uv.lock`/`poetry.lock`). The server
installs exact versions — never `pip install <pkg>` ad hoc (Prinsip 9).

## Gunicorn (WSGI: Django/Flask)
`workers = 2 * CPU + 1`. Use `gthread` for I/O-bound apps; `sync` for CPU-bound.
```bash
exec /var/www/app/.venv/bin/gunicorn app.wsgi:application \
  --workers 5 --worker-class gthread --threads 4 \
  --bind unix:/run/app.sock --timeout 60 --graceful-timeout 30 \
  --max-requests 1000 --max-requests-jitter 100 \
  --access-logfile - --error-logfile -
```

## uvicorn (ASGI: FastAPI/Starlette)
```bash
# Behind a process manager use uvicorn workers under Gunicorn, or systemd + uvicorn directly
exec /var/www/app/.venv/bin/gunicorn app.main:app \
  --workers 5 --worker-class uvicorn.workers.UvicornWorker \
  --bind unix:/run/app.sock --timeout 60
```

## systemd + Socket Activation
```ini
# /etc/systemd/system/app.socket
[Socket]
ListenStream=/run/app.sock
SocketUser=www-data
SocketMode=0660

[Install]
WantedBy=sockets.target
```
```ini
# /etc/systemd/system/app.service
[Unit]
Requires=app.socket
After=network.target

[Service]
User=app
WorkingDirectory=/var/www/app
EnvironmentFile=/var/www/app/.env
ExecStart=/var/www/app/.venv/bin/gunicorn app.wsgi:application --workers 5 --bind fd://0
ExecReload=/bin/kill -s HUP $MAINPID
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/www/app/media /run

[Install]
WantedBy=multi-user.target
```
Graceful reload: `systemctl reload app` sends `HUP`; Gunicorn re-forks workers without
dropping the listening socket (zero-downtime).

## Django Deploy
```bash
source /var/www/app/.venv/bin/activate
python manage.py migrate --noinput            # WRITE: back up DB first (ops-backup)
python manage.py collectstatic --noinput      # build static assets
python manage.py check --deploy               # security/config audit before go-live
systemctl reload app
```

## Python Version Upgrade Path
1. Install the new interpreter (`apt install python3.13-venv` or pyenv) alongside the old (Prinsip 3).
2. Recreate the venv with the new interpreter; `pip install -r requirements.txt`; run tests.
3. Point the systemd `ExecStart` at the new venv; `systemctl restart app`.
4. Verify health, then delete the old venv.

## Related
- ops-webserver — Nginx proxy to the Unix socket / port.
- ops-deploy — release flow and socket-activated restart.
- ops-database — DB backup before `migrate`.
- ops-monitoring — worker saturation and health-check alerting.
````

### Skill: ops-runtime-go

````markdown
---
name: ops-runtime-go
description: Go static binary builds, systemd supervision, graceful shutdown, and zero-downtime deploys.
version: 1.0
---

# Go Runtime Operations

## When to Use
Load when `go.mod` is detected. Covers building static binaries, running them under systemd,
graceful shutdown, environment injection, cross-compilation, and zero-downtime release.

## Static Build
```bash
# Fully static, stripped, reproducible binary; CGO off for portability
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags '-s -w -X main.version=$(git rev-parse --short HEAD)' \
  -o /usr/local/bin/app ./cmd/app
```
```bash
# Cross-compile from a build host (e.g. arm64 target)
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o app-arm64 ./cmd/app
```
Ship the single binary to the server; no runtime toolchain needed (Prinsip 9: the artifact
comes from CI/VCS, not edited on the box).

## systemd Unit
```ini
# /etc/systemd/system/app.service
[Unit]
Description=Go app
After=network.target

[Service]
Type=notify                       # if using sd_notify; else Type=simple
User=app
EnvironmentFile=/etc/app/app.env  # env injected by systemd, never baked into binary
ExecStart=/usr/local/bin/app
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=3
TimeoutStopSec=30                 # allow in-flight requests to drain
AmbientCapabilities=CAP_NET_BIND_SERVICE   # only if binding :80/:443 directly
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

## Graceful Shutdown
Handle `SIGTERM`: stop the listener, drain with a timeout, then exit. systemd's
`TimeoutStopSec` must exceed the drain window.
```go
ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
defer stop()
<-ctx.Done()
shutdownCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
defer cancel()
_ = srv.Shutdown(shutdownCtx)
```

## Zero-Downtime Deploy
- Simple: install the new binary, `systemctl restart app` — brief gap, acceptable behind a
  retrying reverse proxy.
- True zero-downtime: bind with `SO_REUSEPORT` and run two instances (old + new) on the
  same port, or front N instances with an Nginx upstream and roll them one at a time.
```bash
# SO_REUSEPORT pattern: start new instance, health-check, then stop old
systemctl start app@new && curl -fsS http://127.0.0.1:8080/healthz && systemctl stop app@old
```

## JDK-free, no version manager
Upgrades = rebuild with a newer Go toolchain in CI and ship the new binary; the server is
toolchain-agnostic. Keep the previous binary for instant rollback (Prinsip 3).

## Related
- ops-webserver — Nginx upstream / reverse proxy and SO_REUSEPORT fronting.
- ops-deploy — binary swap + symlink and rollback to prior binary.
- ops-monitoring — `/healthz` probe and restart alerting.
- ops-security-hardening — systemd sandboxing and capability scoping.
````

### Skill: ops-runtime-java

````markdown
---
name: ops-runtime-java
description: JVM application deploys (JAR/WAR), heap/GC tuning, Spring Boot actuator, and systemd supervision.
version: 1.0
---

# Java/JVM Runtime Operations

## When to Use
Load when `pom.xml` or `build.gradle` is detected. Covers running fat JARs (or WAR in a
servlet container), JVM heap and GC tuning, Spring Boot actuator health, and systemd units.

## Build Artifact
Build in CI; ship the versioned artifact (Prinsip 9).
```bash
./mvnw -B clean package -DskipTests      # tests run earlier in CI; produces target/app-<ver>.jar
# Gradle: ./gradlew clean bootJar
```

## systemd Unit
```ini
# /etc/systemd/system/app.service
[Unit]
Description=Spring Boot app
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/var/www/app
EnvironmentFile=/etc/app/app.env
ExecStart=/usr/bin/java $JAVA_OPTS -jar /var/www/app/app.jar
SuccessExitStatus=143             # 128 + SIGTERM(15): clean shutdown
Restart=on-failure
RestartSec=5
TimeoutStopSec=60                 # let the JVM drain and run shutdown hooks
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/www/app/logs

[Install]
WantedBy=multi-user.target
```

## JVM Heap & GC Tuning
Set `JAVA_OPTS` in the EnvironmentFile, not in the unit, so it is auditable/rollbackable.
```ini
# /etc/app/app.env
JAVA_OPTS=-Xms1g -Xmx1g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 \
  -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/www/app/logs \
  -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom
```
- Set `-Xms` = `-Xmx` to avoid heap resize pauses; leave headroom for non-heap (metaspace,
  threads): cap heap at ~60–70% of container/host RAM.
- G1GC is the modern default; for large heaps with low-pause needs consider ZGC
  (`-XX:+UseZGC`). In containers, the JVM honors cgroup limits by default (JDK 17+).

## Spring Boot Actuator
Expose health for monitoring; bind management to localhost.
```ini
# application.properties
management.endpoints.web.exposure.include=health,info,metrics,prometheus
management.endpoint.health.probes.enabled=true
management.server.address=127.0.0.1
management.server.port=8081
```
```bash
curl -fsS http://127.0.0.1:8081/actuator/health    # {"status":"UP"}
```

## JDK Upgrade Path
1. Install the new JDK side-by-side (`apt install temurin-21-jdk`); register via
   `update-alternatives` or set `JAVA_HOME` per-service (Prinsip 3).
2. Rebuild/repackage against the new JDK in CI; run the test suite.
3. Point the service `ExecStart`/`JAVA_HOME` at the new JDK; `systemctl restart app`.
4. Verify actuator health, then remove the old JDK.

## Related
- ops-webserver — Nginx reverse proxy to the JVM port.
- ops-deploy — JAR swap + symlink and rollback to prior artifact.
- ops-monitoring — actuator `/health` and JVM metrics (Prometheus) scraping.
- ops-performance — GC log analysis and heap-dump triage.
````

### Skill: ops-containers

````markdown
---
name: ops-containers
description: Docker, Docker Compose, and Podman operations — image build, production compose, volumes, and cleanup.
version: 1.0
---

# Container Operations

## When to Use
Load when `Dockerfile` or `docker-compose.yml` is detected. Covers building lean secure
images, running production Compose stacks, volume/network management, container log
rotation, image cleanup, and rootless Podman as a Docker alternative.

## Dockerfile Best Practices
```dockerfile
# Multi-stage: build with the toolchain, ship only the runtime
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Non-root: never run app processes as root
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/server.js"]
```
```
# .dockerignore — keep build context small & avoid leaking secrets
.git
node_modules
.env
*.log
```
- Pin base image tags (and ideally digests); prefer `-slim`/distroless.
- Order layers cheap→expensive (deps before source) for cache reuse.
- One concern per image; no SSH/cron inside the container.

## docker-compose.yml (Production)
```yaml
services:
  web:
    image: registry.example.com/app:1.4.2     # pinned tag, never :latest in prod
    restart: unless-stopped
    env_file: [/etc/app/app.env]              # secrets out of the compose file
    ports:
      - "127.0.0.1:3000:3000"                 # bind to localhost; Nginx terminates TLS
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3000/healthz"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }   # bound disk usage
    depends_on:
      db: { condition: service_healthy }
    networks: [appnet]

  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - dbdata:/var/lib/postgresql/data       # named volume = persistent state
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      retries: 5
    secrets: [db_password]
    networks: [appnet]

volumes:
  dbdata:
networks:
  appnet:
secrets:
  db_password:
    file: /etc/app/secrets/db_password
```

## Volumes & Networks
- Named volumes for stateful data (DB, uploads); bind mounts only for read-only config.
- Per-stack user-defined bridge network → DNS-by-service-name + isolation from other stacks.
- Back up named volumes via `ops-backup` (dump DB inside the container; archive volume paths).

## Log Rotation
Without `max-size`, `json-file` logs grow unbounded and fill the disk. Set per-service
(above) or globally:
```json
// /etc/docker/daemon.json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

## Image Cleanup
```bash
docker image prune -f                     # dangling images (safe)
docker system prune -af --volumes         # DESTRUCTIVE: removes unused images+volumes — double-confirm, verify nothing needed
docker builder prune -f                   # build cache
```
`docker system prune --volumes` can delete data volumes not attached to a running
container — treat as DESTRUCTIVE (Tier 3): confirm a current backup exists first.

## Podman (Rootless Alternative)
Drop-in for Docker with daemonless, rootless containers (better isolation, no root daemon).
```bash
podman generate systemd --new --name app > ~/.config/systemd/user/app.service  # or use Quadlet (.container) on modern Podman
systemctl --user enable --now app
loginctl enable-linger app                # keep user services running after logout
```
`podman-compose` (or `docker-compose` with the Podman socket) runs the same compose file.

## Related
- ops-webserver — reverse proxy to the localhost-bound container port.
- ops-secrets — `env_file` / Docker secrets sourcing and rotation.
- ops-backup — dumping DB containers and archiving named volumes.
- ops-firewall — ensuring published ports stay bound to 127.0.0.1, not 0.0.0.0.
- ops-monitoring — container healthcheck status and resource metrics.
````

## X. Domain — Deployment & Rollback

Deployment adalah titik di mana kode aplikasi berpindah dari source-of-truth (VCS) ke server produksi, dan justru di sinilah risiko terbesar terhadap stabilitas terjadi. ECC-Ops memperlakukan deploy bukan sebagai sekadar `git pull`, melainkan sebagai transaksi yang dapat dibatalkan: setiap deploy menentukan titik mundur sebelum menyentuh apa pun, memverifikasi hasilnya setelah selesai, dan otomatis kembali ke kondisi terakhir yang sehat bila health check gagal. Inilah inti **Prinsip 3 — Rollback-ready**: tidak ada operasi write tanpa jalan pulang.

Domain ini menegakkan **Prinsip 9 — Server mirrors source** secara ketat. Kode aplikasi di server hanya boleh berubah melalui VCS dan pipeline deploy — tidak ada edit liar (`vim` di server lalu lupa commit). File non-kode milik environment (`.env`, config Nginx, unit systemd) boleh diatur langsung oleh agent karena bukan bagian dari source aplikasi. Konsekuensinya, deploy harus **idempotent** (Prinsip 4): menjalankannya dua kali pada commit yang sama tidak menumpuk efek samping. Deploy diklasifikasikan sebagai operasi **WRITE** (konfirmasi tunggal, tampilkan dampak, sediakan rollback), sedangkan operasi yang menimpa data produksi saat restore tergolong **DESTRUCTIVE** (double-confirm + pastikan backup ada).

### Skill: ops-deploy

````markdown
---
name: ops-deploy
description: Universal application deployment patterns (git pull, zero-downtime symlink, containers, CI/CD) with mandatory pre-flight checks, DB backup, health verification, and automatic rollback.
version: 1.0
---

# ops-deploy — Universal Deployment & Rollback

Deploy is a reversible transaction, never a blind `git pull`. Every deploy records a
rollback point (PREV_COMMIT, config copy, DB backup) BEFORE mutating anything, verifies
the result with a health check AFTER, and auto-reverts on failure (Principle 3).
Application code changes ONLY through VCS/deploy — no ad-hoc edits on the server
(Principle 9). Deploys must be idempotent (Principle 4) and are WRITE-tier operations
(single confirm + impact preview + rollback ready).

## When to Use

- Shipping a new release of a web application to a server.
- Promoting a branch/tag/commit to production or staging.
- Choosing or scaffolding a deployment method for a newly provisioned app.
- Performing or preparing a rollback to a previous known-good state.

## Deployment Methods

| Method | Mechanism | Best for | Complexity | Downtime |
|--------|-----------|----------|------------|----------|
| 1. Git pull + restart | `git fetch` + `merge --ff-only`, rebuild, restart service | Single-server apps, small/medium teams | Low | Brief (restart window) |
| 2. Git + symlink (zero-downtime) | Build into `releases/<ts>`, atomic `current` symlink swap | Apps needing zero-downtime, fast rollback | Medium | None (atomic swap) |
| 3. Container compose | `docker compose pull` + `up -d` with healthcheck | Containerized stacks, reproducible images | Medium | None to brief (rolling) |
| 4. CI/CD pipeline | External runner (GitHub Actions/GitLab CI) drives method 1–3 over SSH | Teams with mature automation, multi-env | High | Depends on target method |

> Detection first (Principle 1): inspect the app directory for `.git`, `docker-compose.yml`,
> a `releases/` layout, and runtime markers (`composer.json`, `package.json`,
> `requirements.txt`/`pyproject.toml`, `go.mod`) before choosing a method.

## Method 1 — Git Pull + Restart (with auto-rollback)

A single, idempotent deploy script per app at `/usr/local/bin/<app>-deploy`. It is
stack-adaptive: the build and restart blocks branch on what is actually present.

```bash
#!/usr/bin/env bash
# /usr/local/bin/myapp-deploy
# Universal git-pull deploy with pre-checks, DB backup, health check, auto-rollback.
set -euo pipefail

# ---- Configuration (edit per app) ----
APP="myapp"
APP_DIR="/var/www/myapp"
BRANCH="main"
SERVICE="myapp"                      # systemd unit OR php-fpm pool name
HEALTH_URL="https://myapp.example.com/health"
LOG_DIR="/var/log/${APP}"
LOG="${LOG_DIR}/deploy.log"
RELEASE_USER="deploy"
MIN_FREE_MB=1024                     # abort if free disk below this

# ---- Logging ----
mkdir -p "$LOG_DIR"
log() { printf '%s [deploy] %s\n' "$(date -Is)" "$*" | tee -a "$LOG" >&2; }
fail() { log "ERROR: $*"; exit 1; }

log "=== Deploy start: ${APP} (branch ${BRANCH}) ==="

# ---- 1. Pre-check: disk space ----
FREE_MB=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
[ "$FREE_MB" -ge "$MIN_FREE_MB" ] || fail "Low disk: ${FREE_MB}MB free (< ${MIN_FREE_MB}MB)"
log "Disk OK: ${FREE_MB}MB free"

cd "$APP_DIR" || fail "App dir not found: $APP_DIR"
[ -d .git ] || fail "Not a git repository: $APP_DIR"

# ---- 2. Record rollback point ----
PREV_COMMIT=$(git rev-parse HEAD)
log "PREV_COMMIT=${PREV_COMMIT}"

# ---- 3. Backup DB before deploy (adaptive MySQL/PostgreSQL) ----
BACKUP_DIR="/var/backups/${APP}/pre-deploy"
umask 077                                       # dumps hold PII + password hashes — never world-readable
install -d -m 700 -o root -g root "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
DB_BACKUP=""
if [ -f "${APP_DIR}/.env" ]; then
  # shellcheck disable=SC1090
  DB_CONNECTION=$(grep -E '^DB_CONNECTION=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
  DB_DATABASE=$(grep -E '^DB_DATABASE=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
  DB_USERNAME=$(grep -E '^DB_USERNAME=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
  DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "${APP_DIR}/.env" | cut -d= -f2- | tr -d '"' || true)
fi
if [ -n "${DB_DATABASE:-}" ]; then
  case "${DB_CONNECTION:-mysql}" in
    mysql|mariadb)
      DB_BACKUP="${BACKUP_DIR}/${DB_DATABASE}-${STAMP}.sql.gz"
      # Best-effort rollback snapshot via the app's runtime (DML-only) user: omit
      # --routines/--triggers, which need privileges the app user does not hold.
      MYSQL_PWD="${DB_PASSWORD}" mysqldump --single-transaction --quick --no-tablespaces \
        -u "${DB_USERNAME}" "${DB_DATABASE}" \
        | gzip > "$DB_BACKUP" && chmod 600 "$DB_BACKUP" || fail "DB backup failed (mysql)"
      ;;
    pgsql|postgres|postgresql)
      DB_BACKUP="${BACKUP_DIR}/${DB_DATABASE}-${STAMP}.dump"
      PGPASSWORD="${DB_PASSWORD}" pg_dump -Fc -U "${DB_USERNAME}" \
        -d "${DB_DATABASE}" -f "$DB_BACKUP" && chmod 600 "$DB_BACKUP" || fail "DB backup failed (postgres)"
      ;;
    *) log "Unknown DB_CONNECTION='${DB_CONNECTION}', skipping DB backup" ;;
  esac
  [ -n "$DB_BACKUP" ] && log "DB backup: ${DB_BACKUP}"
else
  log "No DB_DATABASE detected, skipping DB backup"
fi

# ---- 4. Fetch & fast-forward (preserve untracked WIP) ----
# NEVER `git reset --hard` here: it discards local config edits and `git clean` would
# remove untracked files (e.g. uploaded assets, generated .env). Use ff-only merge so
# a deploy aborts loudly if the working tree has diverged, rather than silently nuking it.
git fetch --prune origin "$BRANCH" || fail "git fetch failed"
if ! git merge --ff-only "origin/${BRANCH}"; then
  fail "Cannot fast-forward (local divergence / dirty tree). Resolve manually; refusing to reset --hard."
fi
NEW_COMMIT=$(git rev-parse HEAD)
log "Updated ${PREV_COMMIT:0:8} -> ${NEW_COMMIT:0:8}"
# NOTE: `git reset --hard origin/$BRANCH` is ONLY acceptable on a dedicated deploy
# checkout that holds zero local state and zero untracked files by policy.

# ---- rollback helper ----
rollback() {
  log "!! AUTO-ROLLBACK to ${PREV_COMMIT:0:8}"
  git reset --hard "$PREV_COMMIT" || log "git rollback FAILED"
  build_app || log "rollback build FAILED"
  restart_service || log "rollback restart FAILED"
  log "Rollback complete. If schema changed, restore DB: ${DB_BACKUP:-<none>}"
  exit 1
}

# ---- 5. Adaptive build (per detected stack) ----
build_app() {
  if [ -f composer.json ]; then
    log "Stack: PHP"
    composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
    if [ -f artisan ]; then
      php artisan migrate --force
      php artisan config:cache && php artisan route:cache && php artisan view:cache
    fi
  fi
  if [ -f package.json ]; then
    log "Stack: Node"
    npm ci --omit=dev
    npm run build --if-present
  fi
  if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
    log "Stack: Python"
    [ -d .venv ] || python3 -m venv .venv
    ./.venv/bin/pip install -r requirements.txt 2>/dev/null \
      || ./.venv/bin/pip install . 
    [ -f manage.py ] && ./.venv/bin/python manage.py migrate --noinput || true
  fi
  if [ -f go.mod ]; then
    log "Stack: Go"
    go build -o "build/${APP}" ./... || go build -o "build/${APP}" .
  fi
}
build_app || rollback

# ---- 6. Fix permissions (idempotent) ----
chown -R "${RELEASE_USER}:www-data" "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 750 {} +
find "$APP_DIR" -type f -exec chmod 640 {} +
chmod 750 "$APP_DIR"
# Laravel/framework writable paths
for d in storage bootstrap/cache; do
  [ -d "${APP_DIR}/${d}" ] && chmod -R 770 "${APP_DIR}/${d}"
done

# ---- 7. Adaptive restart ----
restart_service() {
  if systemctl list-unit-files | grep -q "^${SERVICE}\.service"; then
    systemctl restart "${SERVICE}.service"
  elif systemctl is-active --quiet php8.3-fpm 2>/dev/null; then
    systemctl reload php8.3-fpm
  elif systemctl is-active --quiet php8.4-fpm 2>/dev/null; then
    systemctl reload php8.4-fpm
  elif command -v pm2 >/dev/null; then
    sudo -u "$RELEASE_USER" pm2 reload "$APP"
  else
    log "No known service to restart for ${APP}"
  fi
}
restart_service || rollback

# ---- 8. Post-deploy health check (auto-rollback on failure) ----
log "Health check: ${HEALTH_URL}"
OK=0
for i in 1 2 3 4 5; do
  CODE=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || echo 000)
  if [ "$CODE" = "200" ]; then OK=1; log "Health OK (200) on attempt ${i}"; break; fi
  log "Health attempt ${i}: HTTP ${CODE}, retrying..."
  sleep 3
done
[ "$OK" -eq 1 ] || rollback

# ---- 9. Success ----
log "=== Deploy SUCCESS: ${NEW_COMMIT:0:8} ==="
log "Manual rollback: cd ${APP_DIR} && sudo git reset --hard ${PREV_COMMIT}, then rebuild + restart_service (or run the /rollback command). DB snapshot: ${DB_BACKUP:-none}"
echo "DEPLOYED ${NEW_COMMIT} (prev ${PREV_COMMIT}). DB backup: ${DB_BACKUP:-none}"
```

Allow the deploy user to run only this script as root, nothing else:

```ini
# /etc/sudoers.d/myapp-deploy  (validate with: visudo -c)
deploy ALL=(root) NOPASSWD: /usr/local/bin/myapp-deploy
```

## Method 2 — Symlink Zero-Downtime

Each release is built into its own timestamped directory; a single atomic symlink swap
makes it live, so the active code never changes mid-request. Rollback is just pointing
`current` back at the previous release.

```text
/var/www/myapp/
├── releases/
│   ├── 20260614-101500/      # built, ready
│   ├── 20260614-093000/      # previous (rollback target)
│   └── ...
├── shared/                   # persists across releases
│   ├── .env
│   ├── storage/              # uploads, logs, sessions
│   └── node_modules/         # optional cache
└── current -> releases/20260614-101500   # atomic symlink
```

Procedure:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="/var/www/myapp"; REPO="git@github.com:org/myapp.git"; BRANCH="main"
KEEP=5
TS=$(date +%Y%m%d-%H%M%S)
REL="${BASE}/releases/${TS}"

# 1. Fetch source into a fresh release dir (no impact on live `current`)
git clone --depth 1 -b "$BRANCH" "$REPO" "$REL"

# 2. Link shared mutable state into the new release
ln -sfn "${BASE}/shared/.env" "${REL}/.env"
rm -rf "${REL}/storage" && ln -sfn "${BASE}/shared/storage" "${REL}/storage"

# 3. Build inside the new release (off the hot path)
( cd "$REL"
  [ -f composer.json ] && composer install --no-dev -o --no-interaction
  [ -f package.json ]  && npm ci --omit=dev && npm run build --if-present
  [ -f artisan ]       && php artisan migrate --force
)

# 4. Atomic swap (single syscall; readers never see a half-state)
PREV=$(readlink -f "${BASE}/current" || true)
ln -sfn "$REL" "${BASE}/current.tmp" && mv -Tf "${BASE}/current.tmp" "${BASE}/current"

# 5. Reload service (PHP-FPM picks up new path via current symlink)
systemctl reload php8.3-fpm 2>/dev/null || systemctl restart myapp 2>/dev/null || true

# 6. Health check -> rollback by re-pointing the symlink
if ! curl -fsS --max-time 10 https://myapp.example.com/health >/dev/null; then
  [ -n "$PREV" ] && ln -sfn "$PREV" "${BASE}/current" && systemctl reload php8.3-fpm
  echo "Health failed; rolled back to $PREV"; exit 1
fi

# 7. Cleanup: keep only the last $KEEP releases
ls -1dt "${BASE}/releases/"*/ | tail -n +$((KEEP+1)) | xargs -r rm -rf
echo "Live: $REL"
```

## Method 3 — Container (Docker Compose)

Pull the new pinned image, recreate with health gating, roll back to the previous image
tag if the container never becomes healthy.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/myapp                       # holds docker-compose.yml + .env
NEW_TAG="${1:?usage: deploy <image-tag>}"
SVC="web"

# 1. Record current (rollback) tag
PREV_TAG=$(docker compose config | awk -F: '/image:/{print $NF; exit}')   # tag only (e.g. v1.2.3), matches IMAGE_TAG
echo "PREV_TAG=${PREV_TAG}"

# 2. Pull & start the new tag
IMAGE_TAG="$NEW_TAG" docker compose pull "$SVC"
IMAGE_TAG="$NEW_TAG" docker compose up -d --no-deps "$SVC"

# 3. Wait for container healthcheck
CID=$(docker compose ps -q "$SVC")
for i in $(seq 1 20); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo none)
  [ "$STATUS" = "healthy" ] && break
  [ "$STATUS" = "none" ] && [ "$(docker inspect -f '{{.State.Running}}' "$CID")" = "true" ] && break
  sleep 3
done

# 4. Roll back to previous image tag on failure
if [ "${STATUS:-}" != "healthy" ] && [ "${STATUS:-}" != "none" ]; then
  echo "Unhealthy; rolling back to ${PREV_TAG}"
  IMAGE_TAG="$PREV_TAG" docker compose up -d --no-deps "$SVC"
  exit 1
fi
echo "Deployed ${SVC}:${NEW_TAG}"
```

The compose service must declare a healthcheck so the gate above is meaningful:

```yaml
services:
  web:
    image: registry.example.com/myapp:${IMAGE_TAG}
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
    restart: unless-stopped
```

## Pre-Deploy Checklist (universal)

| # | Check | Why |
|---|-------|-----|
| 1 | Target commit/tag identified & reachable | Avoid deploying an unknown HEAD |
| 2 | Free disk ≥ threshold (app + DB backup) | Build/backup must not fill the disk |
| 3 | PREV_COMMIT / current symlink / image tag recorded | Rollback point exists (Principle 3) |
| 4 | DB backed up (pre-deploy) | Schema migration must be reversible |
| 5 | `.env` / secrets present & unchanged | Avoid boot failure from missing config |
| 6 | Working tree fast-forwardable (no untracked WIP loss) | Principle 9 — server mirrors source |
| 7 | Health endpoint reachable pre-deploy | Establish a healthy baseline |
| 8 | Maintenance window / low-traffic confirmed (if downtime) | Reduce user impact |

## Post-Deploy Checklist (universal)

| # | Check | Why |
|---|-------|-----|
| 1 | Health endpoint returns 200 | App boots and serves traffic |
| 2 | Service active (`systemctl is-active`) | No crash-loop after restart |
| 3 | New commit/tag matches intended target | Right code is live |
| 4 | Error log clean since deploy timestamp | No new exceptions introduced |
| 5 | Migrations applied (expected version) | Schema in sync with code |
| 6 | Latency / 5xx rate nominal | No performance regression |
| 7 | Rollback command printed & captured in audit | Operator knows the undo path (Principle 7) |
| 8 | Old releases pruned (keep last 5) | Bounded disk usage |

## Related

- `ops-runtime-php`, `ops-runtime-node`, `ops-runtime-python`, `ops-runtime-go` — stack-specific build/restart detail.
- `ops-database` — DB backup engines, migration safety, restore.
- `ops-secrets` — `.env` provisioning and rotation referenced by builds.
- `ops-webserver` — Nginx upstream/symlink config consumed by deploys.
- `ops-backup` — full backup/restore beyond pre-deploy snapshots.
- `ops-monitoring` — health endpoints and post-deploy regression watch.
````

### Subagent: deploy-operator

````markdown
---
name: deploy-operator
description: Use PROACTIVELY for any application deployment, release promotion, or rollback. Detects the stack and deploy method automatically, takes a rollback point and pre-deploy DB backup, executes the ops-deploy procedure, verifies health, and AUTO-ROLLS-BACK on failure. Invoke whenever the user says deploy, ship, release, push to prod, or rollback.
tools: ["Read", "Bash"]
model: sonnet
---

# deploy-operator

You execute deployments as reversible transactions. You never run a bare `git pull`;
you follow the `ops-deploy` skill end to end. Deploy is a WRITE-tier operation: preview
impact, confirm once, keep a rollback ready. Restore-over-production is DESTRUCTIVE.

## Workflow

### 1. Pre-deploy validation (READ — automatic)
- Load the Server Profile for the host; identify the target app, domain, repo, deploy
  method, and service name.
- Detect the stack (Principle 1): inspect for `.git`, `docker-compose.yml`, `releases/`,
  and runtime markers (`composer.json`, `package.json`, `requirements.txt`/`pyproject.toml`, `go.mod`).
- Verify pre-deploy checklist: disk headroom, `.env` present, working tree
  fast-forwardable (no untracked WIP that a deploy would clobber), health baseline 200.
- Identify and announce the rollback point (PREV_COMMIT / current symlink / image tag).

### 2. Adaptive execution (WRITE — confirm first)
- Show the impact preview: from-commit → to-commit, migrations pending, service to
  restart, expected downtime, and the exact rollback command. Obtain single confirmation.
- Run the matching `ops-deploy` procedure for the detected method (git-pull, symlink,
  or container). Always take the pre-deploy DB backup first.
- Prefer `git fetch` + `merge --ff-only`; refuse `git reset --hard` on a working tree
  that holds untracked files (Principle 9).

### 3. Post-deploy verification (READ — automatic)
- Run the post-deploy checklist: health 200, `systemctl is-active`, live commit/tag
  matches target, error log clean since the deploy timestamp, migrations at expected version.

### 4. Auto-rollback & report
- If any post-deploy check fails: AUTO-ROLLBACK to the recorded point (reset to
  PREV_COMMIT / re-point `current` / redeploy previous image tag), re-verify health,
  and state clearly that the deploy was reverted. If a schema migration ran, surface the
  pre-deploy DB backup path for manual restore (DESTRUCTIVE — double-confirm).
- Report: result, old→new commit, migrations, health, deploy log path
  (`/var/log/<app>/deploy.log`), and the rollback command.

## Key Principles
- Detect before acting; never assume the stack (Principle 1).
- Record the rollback point BEFORE the first mutation (Principle 3).
- Idempotent — re-running on the same commit is a no-op, not a pile-up (Principle 4).
- Server mirrors source — no ad-hoc code edits; ff-only, preserve untracked state (Principle 9).
- Health is the verdict — a green deploy with a red health check is a failed deploy.

**Remember**: a good deploy is one you can undo in 30 seconds — record the rollback point before you touch anything, and let the health check be the judge.
````

### Commands

````markdown
---
description: Deploy an application to a server with stack detection, pre-deploy DB backup, health verification, and automatic rollback on failure.
---

# /deploy

Deploy a target app/branch/commit safely. Delegates to the **deploy-operator** subagent,
which follows the **ops-deploy** skill. Deploy is WRITE-tier: impact preview + single
confirmation + rollback ready.

Usage: `/deploy [app] [branch-or-tag-or-commit]`

## Steps

1. **Validate (READ)** — Load the Server Profile; resolve app, repo, method, and service.
   Detect the stack (Principle 1). Run the Pre-Deploy Checklist: disk headroom, `.env`
   present, working tree fast-forwardable, health baseline. Record the rollback point
   (PREV_COMMIT / current symlink / image tag) and announce it.

2. **Execute adaptively (WRITE — confirm)** — Show impact preview (from→to commit,
   pending migrations, service restart, expected downtime, rollback command) and get a
   single confirmation. Take the pre-deploy DB backup, then run the matching method:
   git-pull+restart, symlink zero-downtime, or container compose. Prefer `fetch` +
   `merge --ff-only`; never `git reset --hard` over untracked WIP (Principle 9).

3. **Verify (READ)** — Run the Post-Deploy Checklist: health 200, service active, live
   commit/tag matches target, error log clean since deploy time, migrations at expected version.

4. **Report & auto-rollback** — If verification fails, AUTO-ROLLBACK to the recorded
   point and re-verify; declare the deploy reverted and surface the DB backup path if a
   migration ran (restore is DESTRUCTIVE — double-confirm). On success, report old→new
   commit, migrations, health result, log path (`/var/log/<app>/deploy.log`), and the
   rollback command. Record the change to the audit trail (Principle 7).
````

````markdown
---
description: Roll back an application to its previous known-good commit (or release/image tag), restore the DB if a migration was applied, and verify health.
---

# /rollback

Revert an app to its last known-good state. Delegates to the **deploy-operator** subagent.
Rollback itself is WRITE-tier; restoring a DB over production data is DESTRUCTIVE
(double-confirm + verify backup exists).

Usage: `/rollback [app] [target-commit-or-tag]`  (defaults to the previous deploy point)

## Steps

1. **Identify target (READ)** — From the Server Profile / deploy log
   (`/var/log/<app>/deploy.log`), resolve the rollback target: the recorded PREV_COMMIT,
   the previous `releases/` directory, or the previous image tag. Confirm the matching
   pre-deploy DB backup exists and note its path. Show current→target diff.

2. **Execute (WRITE — confirm)** — Revert code to the target: `git reset --hard
   <PREV_COMMIT>` on the dedicated deploy checkout, OR re-point the `current` symlink to
   the previous release, OR `docker compose up -d` with the previous image tag. Rebuild
   and restart the service via the same adaptive logic as deploy.

3. **Restore DB if needed (DESTRUCTIVE — double-confirm)** — Only if the rolled-back
   release had applied a schema migration that the older code cannot read: restore from
   the pre-deploy backup (`mysql`/`pg_restore`). Require explicit double-confirmation and
   verify the backup file integrity before overwriting production data.

4. **Verify (READ)** — Health endpoint 200, service active, live commit/tag equals the
   rollback target, error log clean. Report the final state, what was restored, and record
   the rollback to the audit trail (Principle 7).
````

## XI. Domain — Data: Database, Backup & Secrets

Domain data adalah jantung dari setiap aplikasi produksi: di sinilah informasi paling berharga sekaligus paling sensitif berada — kredensial pengguna, hash password, PII, dan data transaksi. Karena itu, ECC-Ops memperlakukan database, backup, dan secrets sebagai satu domain terpadu dengan postur keamanan paling ketat. Sesuai **Prinsip 5 (Defense-in-depth)**, akses database dibatasi berlapis (bind localhost, least-privilege users, autentikasi kuat); sesuai **Prinsip 3 (Rollback-ready)**, tidak ada operasi tulis berisiko tanpa backup terverifikasi terlebih dahulu; dan sesuai **Prinsip 8 (Confirm-before-harm)**, operasi destruktif seperti restore yang menimpa produksi selalu menuntut double-confirm. Tiga skill di domain ini (`ops-database`, `ops-backup`, `ops-secrets`) bekerja bersama subagent `backup-operator` untuk memastikan data tetap aman, dapat dipulihkan, dan kredensialnya tidak pernah bocor.

### Skill: ops-database

````markdown
---
name: ops-database
description: Setup, secure, tune, and diagnose MySQL/MariaDB, PostgreSQL, and Redis with least-privilege users and localhost-only access.
version: 1.0
---

# ops-database — Database Setup, Security & Diagnostics

Knowledge base for provisioning and operating relational and cache databases
(MySQL/MariaDB, PostgreSQL 16, Redis) with a security-first, least-privilege posture.

## When to Use

- Provisioning a database engine on a fresh server (Prinsip 1: detect engine/version first).
- Creating an application database and its dedicated users.
- Hardening database access (bind address, auth, network exposure).
- Tuning memory/IO parameters to the host's RAM.
- Diagnosing slow queries, connection exhaustion, replication, or disk pressure.

> All `SELECT`/`SHOW`/`EXPLAIN` and `*.cnf` reads are READ tier (auto).
> Creating users, editing config, restarting the engine are WRITE tier (single confirm + rollback).
> `DROP DATABASE`, `DROP USER`, `TRUNCATE`, `FLUSH ... RESET` are DESTRUCTIVE (double-confirm + verify backup exists).

---

## MySQL / MariaDB

### 1. Install & secure

```bash
# Debian/Ubuntu
apt-get update && apt-get install -y mysql-server   # or mariadb-server
systemctl enable --now mysql

# Interactive hardening: set root password, remove anon users,
# disable remote root, drop test DB, reload privileges.
mysql_secure_installation
```

Non-interactive equivalent (idempotent — Prinsip 4) when scripting:

```sql
-- Run as root (auth_socket on Debian) BEFORE setting a root password.
DELETE FROM mysql.user WHERE User='';
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
```

### 2. Create database + TWO dedicated users (least-privilege)

> **CRITICAL**
> - NEVER let the app connect as `root`.
> - NEVER `GRANT ALL` to an application user.
> - NEVER use `@'%'` (any host). Bind users to `localhost`.
> - The runtime user gets DML only; a separate user gets DDL for migrations.

```sql
CREATE DATABASE myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Runtime user: data access only (no schema changes).
CREATE USER 'myapp_app'@'localhost' IDENTIFIED BY '<STRONG_RANDOM_PW>';
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'myapp_app'@'localhost';

-- Migration user: DML + DDL, used only during deploy/migrate, never by the running app.
CREATE USER 'myapp_migrate'@'localhost' IDENTIFIED BY '<DIFFERENT_STRONG_PW>';
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES
      ON myapp.* TO 'myapp_migrate'@'localhost';

FLUSH PRIVILEGES;
```

Verify the grants are scoped correctly (Prinsip 7 — auditable):

```sql
SHOW GRANTS FOR 'myapp_app'@'localhost';
SHOW GRANTS FOR 'myapp_migrate'@'localhost';
```

### 3. Security configuration

`/etc/mysql/mysql.conf.d/zz-ecc-hardening.cnf`:

```ini
[mysqld]
# Listen on loopback only — never expose to the network without a deliberate reason.
bind-address            = 127.0.0.1
mysqlx-bind-address     = 127.0.0.1

# Do not resolve client hostnames (faster, avoids DNS-based auth surprises).
skip-name-resolve       = ON

# Reject symlinked tables (path-traversal hardening).
symbolic-links          = 0

# Disable arbitrary file load/dump via SQL.
local-infile            = 0
secure-file-priv        = /var/lib/mysql-files

# Audit slow queries for performance diagnostics.
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 1.0
log_queries_not_using_indexes = 1
```

If the engine must accept LAN connections, prefer an SSH tunnel or a private
interface + a firewall allowlist (see `ops-firewall`) over `bind-address = 0.0.0.0`.

### 4. Tuning by RAM

InnoDB buffer pool is the single most impactful setting. Rule of thumb: ~60–70%
of RAM on a dedicated DB host, less when the box is shared with web/runtime.

| Host RAM | `innodb_buffer_pool_size` | `innodb_buffer_pool_instances` | `max_connections` |
| -------- | ------------------------- | ------------------------------ | ----------------- |
| 1 GB     | 256M                      | 1                              | 50                |
| 2 GB     | 1G                        | 1                              | 80                |
| 4 GB     | 2G                        | 2                              | 100               |
| 8 GB     | 5G                        | 4                              | 150               |
| 16 GB    | 11G                       | 8                              | 200               |

```ini
[mysqld]
innodb_buffer_pool_size       = 2G
innodb_buffer_pool_instances  = 2
innodb_flush_log_at_trx_commit = 1     # 1 = ACID-safe; 2 only if you can lose ~1s on crash
innodb_flush_method           = O_DIRECT
innodb_redo_log_capacity      = 1G     # MySQL 8.0.30+ (replaces the deprecated innodb_log_file_size)
max_connections               = 100
tmp_table_size                = 64M
max_heap_table_size           = 64M
```

Apply with rollback ready (Prinsip 3): copy the current config, write the new
one, then `systemctl restart mysql` and verify `SELECT @@innodb_buffer_pool_size;`.

### 5. Diagnostics

```sql
-- Active sessions and what they are running.
SHOW FULL PROCESSLIST;

-- Connection pressure.
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';

-- Buffer pool efficiency (reads from disk vs from memory).
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';

-- Largest tables by size.
SELECT table_schema, table_name,
       ROUND((data_length+index_length)/1024/1024,1) AS mb
FROM information_schema.tables
ORDER BY (data_length+index_length) DESC LIMIT 10;

-- Inspect a slow query plan.
EXPLAIN ANALYZE SELECT ...;
```

```bash
# Slow queries summarized.
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
```

---

## PostgreSQL 16

### 1. Install & init

```bash
apt-get install -y postgresql-16
systemctl enable --now postgresql
sudo -u postgres psql -c "\conninfo"
```

### 2. Create database + dedicated users

```sql
-- Runtime role: connect + DML only, no schema ownership.
CREATE ROLE myapp_app LOGIN PASSWORD '<STRONG_RANDOM_PW>';

-- Owner/migration role: owns the schema, runs migrations.
CREATE ROLE myapp_migrate LOGIN PASSWORD '<DIFFERENT_STRONG_PW>';

CREATE DATABASE myapp OWNER myapp_migrate ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;

\connect myapp

-- Lock down the public schema; grant runtime DML only.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO myapp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO myapp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE myapp_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO myapp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO myapp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE myapp_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO myapp_app;
```

> **CRITICAL** — same rules as MySQL: app role never owns the schema, never gets
> superuser, never `GRANT ALL`. Migration role is used only at deploy time.

### 3. `pg_hba.conf` (client authentication)

`/etc/postgresql/16/main/pg_hba.conf` — use `scram-sha-256`, never `trust`,
never a `0.0.0.0/0` rule:

```ini
# TYPE  DATABASE  USER           ADDRESS         METHOD
local   all       postgres                       peer
local   myapp     myapp_app                      scram-sha-256
local   myapp     myapp_migrate                  scram-sha-256
host    myapp     myapp_app      127.0.0.1/32    scram-sha-256
host    myapp     myapp_app      ::1/128         scram-sha-256
host    myapp     myapp_migrate  127.0.0.1/32    scram-sha-256   # migrate role over loopback (used by backup/restore)
host    myapp     myapp_migrate  ::1/128         scram-sha-256
# NEVER:  host  all  all  0.0.0.0/0  trust   <-- forbidden
```

`/etc/postgresql/16/main/postgresql.conf`:

```ini
listen_addresses = 'localhost'   # loopback only
password_encryption = scram-sha-256
ssl = on
```

Reload (no restart needed for HBA changes): `sudo -u postgres psql -c "SELECT pg_reload_conf();"`.

### 4. Tuning by RAM

| Host RAM | `shared_buffers` | `effective_cache_size` | `work_mem` | `maintenance_work_mem` |
| -------- | ---------------- | ---------------------- | ---------- | ---------------------- |
| 1 GB     | 256MB            | 512MB                  | 8MB        | 64MB                   |
| 2 GB     | 512MB            | 1500MB                 | 16MB       | 128MB                  |
| 4 GB     | 1GB              | 3GB                    | 32MB       | 256MB                  |
| 8 GB     | 2GB              | 6GB                    | 64MB       | 512MB                  |
| 16 GB    | 4GB              | 12GB                   | 128MB      | 1GB                    |

```ini
shared_buffers = 2GB              # ~25% RAM
effective_cache_size = 6GB        # ~75% RAM (planner hint, not allocation)
work_mem = 64MB                   # per sort/hash op — multiply by connections!
maintenance_work_mem = 512MB
wal_compression = on
checkpoint_completion_target = 0.9
random_page_cost = 1.1           # SSD
```

### 5. Maintenance (bloat / vacuum)

```sql
-- Tables most in need of (auto)vacuum: high dead-tuple ratio.
SELECT relname,
       n_dead_tup,
       n_live_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup,0), 3) AS dead_ratio,
       last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC LIMIT 10;

-- Reclaim bloat (locks the table — WRITE tier, schedule off-peak).
VACUUM (ANALYZE, VERBOSE) myapp_table;

-- Heavy bloat: rebuild without an exclusive lock (PG 12+).
REINDEX TABLE CONCURRENTLY myapp_table;
```

```bash
# Cache hit ratio (target > 0.99).
sudo -u postgres psql -d myapp -c \
"SELECT sum(heap_blks_hit)/(sum(heap_blks_hit)+sum(heap_blks_read)) AS hit_ratio FROM pg_statio_user_tables;"

# Long-running / blocking queries.
sudo -u postgres psql -d myapp -c \
"SELECT pid, now()-query_start AS dur, state, query FROM pg_stat_activity WHERE state<>'idle' ORDER BY dur DESC;"
```

---

## Redis

### 1. Install

```bash
apt-get install -y redis-server
systemctl enable --now redis-server
```

### 2. Secure & configure

`/etc/redis/redis.conf`:

```ini
# Loopback only (or a private interface behind the firewall).
bind 127.0.0.1 ::1
protected-mode yes
port 6379

# Strong auth — required even on loopback.
requirepass <LONG_RANDOM_64_CHAR_SECRET>

# Memory cap + eviction. Use allkeys-lru for caches,
# noeviction for queues/persistent data (so writes fail loudly instead of silently dropping).
maxmemory 512mb
maxmemory-policy allkeys-lru

# Disable/obfuscate dangerous commands in shared environments.
rename-command FLUSHALL ""
rename-command FLUSHDB  ""
rename-command CONFIG   "CONFIG_b1f3..."

# Persistence: RDB snapshot + AOF for durability.
appendonly yes
appendfsync everysec
```

> The `requirepass` value is a secret — store it via `ops-secrets`, never inline it
> into app config in git. Restart: `systemctl restart redis-server`.

### 3. Diagnostics

```bash
redis-cli -a "$REDIS_PW" INFO memory          # used_memory, maxmemory, fragmentation
redis-cli -a "$REDIS_PW" INFO stats           # hits/misses, evicted_keys, ops/sec
redis-cli -a "$REDIS_PW" INFO clients         # connected_clients, blocked_clients
redis-cli -a "$REDIS_PW" --bigkeys            # find memory-heavy keys
redis-cli -a "$REDIS_PW" SLOWLOG GET 10       # slowest recent commands
redis-cli -a "$REDIS_PW" LATENCY DOCTOR       # latency analysis
```

Hit ratio: `keyspace_hits / (keyspace_hits + keyspace_misses)` — a low ratio with
high `evicted_keys` means `maxmemory` is too small for the working set.

## Related

- `ops-secrets` — store DB/Redis passwords in `.env` (chmod 640) or a secret manager.
- `ops-backup` — dump and verify databases before any destructive operation.
- `ops-firewall` — keep DB ports closed; allowlist only when network access is required.
- `ops-performance` — end-to-end performance tuning across web/runtime/DB.
- `ops-security-hardening` — layered hardening that includes the DB tier.
````

### Skill: ops-backup

````markdown
---
name: ops-backup
description: Encrypted, rotated, verified backups of databases and files to /var/backups with offsite sync and tested restore procedures.
version: 1.0
---

# ops-backup — Backup, Encryption, Rotation & Restore

Knowledge base for creating trustworthy backups: encrypted at rest, rotated on a
daily/weekly/monthly schedule, replicated offsite, and — critically — verified by
test restore. An untested backup is not a backup (Prinsip 3: rollback-ready).

## When to Use

- Standing up scheduled backups for a database or application's files.
- Before any DESTRUCTIVE operation (migration, restore, server rebuild).
- Restoring data after loss, corruption, or a failed deploy.
- Auditing whether existing backups are recent, complete, and restorable.

> Creating/listing/verifying backups is READ/WRITE tier.
> **Restore that overwrites production is DESTRUCTIVE — double-confirm + prove a current backup exists first.**

---

## Layout & permissions

All backups live under `/var/backups/<app>` — never inside the webroot.

```bash
/var/backups/myapp/            # 700, owned by root
├── daily/                     # kept 7 days
├── weekly/                    # kept 4 weeks
├── monthly/                   # kept 6 months
└── files/
# Every backup file is mode 600. Encryption key lives in /root, never here.
```

```bash
install -d -m 700 -o root -g root /var/backups/myapp/{daily,weekly,monthly,files}
```

---

## MySQL / MariaDB backup script

`/usr/local/sbin/ecc-backup-mysql.sh`:

```bash
#!/usr/bin/env bash
# ECC-Ops MySQL/MariaDB backup: consistent dump, gzip, optional GPG, rotate, verify.
set -Eeuo pipefail

APP="myapp"
DB="myapp"
BACKUP_ROOT="/var/backups/${APP}"
TS="$(date +%F_%H%M%S)"
DOW="$(date +%u)"        # 1=Mon .. 7=Sun
DOM="$(date +%d)"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"          # if set, encrypt with AES256
MIN_SIZE_BYTES=$((50 * 1024))               # anomaly floor: dump must exceed this
# Credentials come from a 600 option file, NOT the command line (avoids ps/leak).
DEFAULTS_FILE="/root/.my.backup.cnf"        # [client] user=backup password=... 

umask 077
dest_dir="${BACKUP_ROOT}/daily"
out="${dest_dir}/${DB}_${TS}.sql.gz"

log() { logger -t ecc-backup "$*"; echo "[$(date +%T)] $*"; }
trap 'log "FAILED at line $LINENO"; exit 1' ERR

# 1. Dump consistently (single-transaction = no table locks for InnoDB) and compress.
mysqldump --defaults-extra-file="${DEFAULTS_FILE}" \
  --single-transaction --quick --routines --triggers --events \
  --set-gtid-purged=OFF --no-tablespaces "${DB}" \
  | gzip -9 > "${out}"

# 2. Anomaly check: a suspiciously small dump usually means a partial/failed backup.
size="$(stat -c%s "${out}")"
if (( size < MIN_SIZE_BYTES )); then
  log "ABORT: dump ${out} is only ${size} bytes (< ${MIN_SIZE_BYTES}); likely corrupt."
  rm -f "${out}"; exit 1
fi

# 3. Integrity check the gzip stream before trusting it.
gunzip -t "${out}"

# 4. Optional encryption at rest (AES256). Key/recipient managed via ops-secrets.
if [[ -n "${GPG_RECIPIENT}" ]]; then
  gpg --batch --yes --cipher-algo AES256 -r "${GPG_RECIPIENT}" \
      --output "${out}.gpg" --encrypt "${out}"
  shred -u "${out}"               # remove the plaintext copy
  out="${out}.gpg"
fi
chmod 600 "${out}"

# 5. Promote to weekly (Sun) and monthly (1st) tiers.
[[ "${DOW}" == "7" ]] && cp -a "${out}" "${BACKUP_ROOT}/weekly/"
[[ "${DOM}" == "01" ]] && cp -a "${out}" "${BACKUP_ROOT}/monthly/"

# 6. Rotate: keep 7 daily / 4 weekly / 6 monthly (idempotent — Prinsip 4).
find "${BACKUP_ROOT}/daily"   -type f -mtime +7   -delete
find "${BACKUP_ROOT}/weekly"  -type f -mtime +28  -delete
find "${BACKUP_ROOT}/monthly" -type f -mtime +186 -delete

log "OK: ${out} (${size} bytes)"
```

---

## PostgreSQL backup (custom format)

```bash
#!/usr/bin/env bash
# pg_dump custom format (-Fc): compressed, supports selective/parallel restore.
set -Eeuo pipefail
APP="myapp"; DB="myapp"
out="/var/backups/${APP}/daily/${DB}_$(date +%F_%H%M%S).dump"
umask 077

# .pgpass (mode 600) supplies the password; never put it on the command line.
PGPASSFILE=/root/.pgpass pg_dump -Fc -Z 6 -h 127.0.0.1 -U myapp_migrate "${DB}" -f "${out}"

# Verify the archive's table of contents is readable (proves a usable dump).
pg_restore --list "${out}" >/dev/null
chmod 600 "${out}"
```

---

## File backup (uploads / user data)

```bash
# Tar only the data that is NOT reproducible from VCS (Prinsip 9: server mirrors source).
# Application code is restored via deploy, so back up uploads/state, not the repo.
tar -czf "/var/backups/myapp/files/uploads_$(date +%F).tar.gz" \
    -C /var/www/myapp/shared storage/app/public uploads
chmod 600 /var/backups/myapp/files/uploads_*.tar.gz
```

---

## Offsite replication (rclone → S3 / Backblaze B2)

```bash
# rclone config stored under /root/.config/rclone (600). Encrypted files stay encrypted in transit & at rest.
rclone sync /var/backups/myapp remote:my-bucket/myapp \
  --transfers 4 --checksum --immutable \
  --log-file /var/log/ecc-backup-offsite.log
```

For ransomware resilience, enable object-lock / versioning on the bucket and use
an upload-only credential so a compromised host cannot delete offsite copies.

---

## Restore procedures

### MySQL (plain)

```bash
gunzip -t  myapp_2026-06-14.sql.gz          # verify first
gunzip -c  myapp_2026-06-14.sql.gz | mysql --defaults-extra-file=/root/.my.backup.cnf myapp
```

### MySQL (encrypted)

```bash
gpg --batch --quiet --decrypt myapp_2026-06-14.sql.gz.gpg \
  | gunzip -c | mysql --defaults-extra-file=/root/.my.backup.cnf myapp
```

### PostgreSQL (custom format)

```bash
pg_restore --list myapp_2026-06-14.dump      # verify TOC first
pg_restore -h 127.0.0.1 -U myapp_migrate -d myapp --clean --if-exists myapp_2026-06-14.dump
```

> Restore over a live production DB is DESTRUCTIVE. The `backup-operator` subagent
> takes a fresh safety backup, shows current-state vs backup-contents diff, warns
> about data written since the backup, and requires a double-confirm token.

---

## Integrity verification

| Backup type        | Verify command                          |
| ------------------ | --------------------------------------- |
| gzip (MySQL)       | `gunzip -t file.sql.gz`                 |
| GPG-encrypted      | `gpg --decrypt file.gpg | gunzip -t`    |
| PostgreSQL `-Fc`   | `pg_restore --list file.dump`           |
| tar.gz (files)     | `tar -tzf file.tar.gz >/dev/null`       |

The gold standard is a periodic **test restore** into a scratch database, then a
sanity query. A backup that has never been restored is unproven.

---

## Cron

`/etc/cron.d/ecc-backup-myapp`:

```bash
# m h dom mon dow user command
30 2 * * *  root  GPG_RECIPIENT=backup@myapp /usr/local/sbin/ecc-backup-mysql.sh
15 3 * * *  root  /usr/local/sbin/ecc-backup-offsite.sh
```

---

## Security Rules

These are non-negotiable (Prinsip 5 + Prinsip 7):

1. **Backups live ONLY in `/var/backups/<app>`** — NEVER inside the webroot
   (`/var/www`, `public/`). A SQL dump in a web-served directory leaks PII,
   email addresses, and password hashes to anyone who guesses the filename.
2. **Encryption keys live in `/root` (mode 600)**, separate from the backups
   themselves; the GPG private key is never copied to the same offsite bucket as
   the ciphertext.
3. **Never commit backups, dumps, key files, or `.pgpass`/`.my.cnf` to git.**
   Add `*.sql`, `*.sql.gz`, `*.dump`, `*.gpg` to `.gitignore` defensively.
4. **Directory 700, files 600, owner root.** Restrict who can read the data at rest.
5. **DB credentials for backups come from a 600 option file** (`~/.my.cnf`,
   `.pgpass`), never as command-line args (visible in `ps` / shell history).
6. **Offsite credentials are upload-only / object-locked** so a compromised host
   cannot wipe the last line of defense.

## Related

- `ops-database` — engines, users, and dumps that this skill backs up.
- `ops-secrets` — manage the GPG recipient/key and DB credentials used here.
- `ops-incident-response` — restore is a core step in recovery runbooks.
- `ops-monitoring` — alert when a backup is missing, stale, or shrinking.
- `ops-update-patch` — take a verified backup before risky upgrades.
````

### Skill: ops-secrets

````markdown
---
name: ops-secrets
description: Manage credentials safely — .env (chmod 640) or a secret manager, strong generation, rotation, and leak auditing; never in code, logs, or git.
version: 1.0
---

# ops-secrets — Credentials, .env, Rotation & Secret Stores

Knowledge base for handling secrets (DB passwords, API keys, app keys, tokens)
without leaking them. Secrets are the keys to the data domain; mishandling one
secret can compromise everything `ops-database` and `ops-backup` protect.

## When to Use

- Placing or fixing credentials for a deployed application.
- Rotating a password/key (planned, or after a suspected leak).
- Choosing a secret store beyond plain `.env`.
- Auditing a server for accidentally exposed secrets.

> Reading file permissions and grepping for leaks is READ tier.
> Writing/rotating secrets and chmod is WRITE tier (single confirm).
> Revoking a credential that an app actively uses is effectively DESTRUCTIVE — confirm impact first.

---

## Core principles

1. **Secrets live in exactly one place per environment**: an `.env` file
   (mode 600, owned by the app/deploy user) **or** a secret manager — never both,
   never in source code.
2. **Never in code, never in git, never in logs, never in command output.**
   No `echo "$DB_PASSWORD"`, no secrets in `mysql -p<pw>` (use option files),
   no secrets printed in error messages or stack traces.
3. **Least exposure**: a process gets a secret only at the moment it needs it,
   scoped as narrowly as possible.
4. **Rotatable**: every secret must have a known, tested rotation procedure
   (Prinsip 3 — you can always move forward to a fresh credential).

---

## .env structure & permissions

```bash
# /var/www/myapp/shared/.env  (symlinked into each release)
chown deploy:www-data /var/www/myapp/shared/.env
chmod 640 /var/www/myapp/shared/.env       # owner rw, group www-data read (FPM needs group read)
```

```ini
# .env — values are secrets; this file is NEVER committed.
APP_KEY=base64:Xk3...                       # app encryption key
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=myapp
DB_USERNAME=myapp_app                       # runtime user (DML only), NOT root
DB_PASSWORD=...
REDIS_PASSWORD=...
MAIL_PASSWORD=...
```

> The `ops-env-protect.js` hook auto-applies `chmod 640` whenever an `.env` is
> written or edited (Prinsip 5). `.env` and `.env.*` are always in `.gitignore`;
> only `.env.example` (no real values) is committed.

---

## Generate strong secrets

```bash
openssl rand -base64 48                      # generic 48-byte secret
openssl rand -hex 32                         # 64-char hex token / Redis requirepass
php artisan key:generate --show              # Laravel APP_KEY (base64:...)
python -c 'import secrets; print(secrets.token_urlsafe(48))'   # Django/FastAPI
```

Never reuse a secret across environments (dev/stage/prod) or across services.

---

## Rotation procedures

### Database password (zero/low downtime)

```sql
-- 1. Set a NEW strong password on the existing least-privilege user.
ALTER USER 'myapp_app'@'localhost' IDENTIFIED BY '<NEW_STRONG_PW>';   -- MySQL
-- ALTER ROLE myapp_app PASSWORD '<NEW_STRONG_PW>';                   -- PostgreSQL
FLUSH PRIVILEGES;
```

```bash
# 2. Update the single source of truth, then reload the app (don't hard-down it).
sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=<NEW_STRONG_PW>/' /var/www/myapp/shared/.env
systemctl reload php8.4-fpm    # or restart the runtime service for the app
# 3. Verify the app can connect; then the old password is dead.
```

### API key / third-party token

1. Generate the new key in the provider console (keep the old one valid).
2. Update `.env`, reload the app, verify traffic uses the new key.
3. Revoke the old key in the provider console (now DESTRUCTIVE — old key dies).

### App key (e.g. Laravel `APP_KEY`)

> WARNING: rotating `APP_KEY` invalidates anything encrypted with it (sessions,
> encrypted columns, signed URLs). Plan re-encryption or accept the invalidation
> before rotating. Always back up the old key.

---

## Secret store options

| Option                  | Best for                          | Notes                                                       |
| ----------------------- | --------------------------------- | ---------------------------------------------------------- |
| `.env` + chmod 640      | single host, simple apps          | baseline; pair with `ops-env-protect.js`                  |
| **sops + age**          | git-ops, encrypted-at-rest config | commit *encrypted* secrets; `age` key stays on the host    |
| **HashiCorp Vault**     | fleets, dynamic/short-lived creds | central audit, lease/revoke, DB credential brokering       |
| systemd `LoadCredential`| service-scoped secrets            | kernel keyring; secret never lands on disk in plaintext    |
| Docker / Compose secrets| containerized apps                | mounted at `/run/secrets/<name>`, not in image or env dump |

```ini
# systemd LoadCredential — secret exposed only to this unit, via $CREDENTIALS_DIRECTORY.
[Service]
LoadCredential=db_password:/root/secrets/myapp_db_password
ExecStart=/usr/bin/myapp   # reads ${CREDENTIALS_DIRECTORY}/db_password at runtime
```

```bash
# sops + age: edit secrets encrypted; plaintext never touches disk unencrypted.
age-keygen -o /root/.config/sops/age/keys.txt   # 600
sops --age "$(age-keygen -y /root/.config/sops/age/keys.txt)" secrets.enc.yaml
```

---

## Leak auditing

```bash
# 1. World-accessible .env or key files (.env must be 640 or 600, keys 600 — flag any "others" access).
find /var/www /etc /root -name '.env' -o -name '*.pem' -o -name '*.key' 2>/dev/null \
  | xargs -r stat -c '%a %U %n' | grep -vE '^[0-9][0-9]0 '

# 2. Secrets accidentally tracked in git history.
git -C /var/www/myapp log -p --all -S 'DB_PASSWORD' -- ':!*.example' | head
git -C /var/www/myapp ls-files | grep -E '\.env$|\.pem$|\.key$'   # should be empty

# 3. Secrets leaking into logs.
grep -rIl -E 'password|secret|api[_-]?key|token' /var/log/myapp 2>/dev/null

# 4. Secrets in shell history (then scrub).
grep -nE 'mysql .*-p[^ ]|PASSWORD=|API_KEY=' ~/.bash_history ~/.zsh_history 2>/dev/null
```

If a secret was ever committed, exposed, or logged: treat it as compromised —
**rotate immediately** (it cannot be "un-leaked"), then purge it from history/logs
and review access logs via `ops-incident-response`.

## Related

- `ops-database` — the DB credentials and Redis `requirepass` managed here.
- `ops-backup` — the GPG recipient/key and backup DB credentials.
- `ops-deploy` — injects `.env` into releases; never bakes secrets into artifacts.
- `ops-security-hardening` — filesystem permissions and least-privilege posture.
- `ops-incident-response` — rotation and revocation as part of breach response.
````

### Subagent: backup-operator

````markdown
---
name: backup-operator
description: Use PROACTIVELY to create, verify, and rotate backups, and to perform safe restores. Invoke before any destructive data operation, after deploys, on backup-health checks, and whenever data must be recovered. Always proves a current backup exists before any overwrite.
tools: ["Read", "Bash"]
model: sonnet
---

# backup-operator — Backup & Restore Specialist

You create trustworthy backups and perform restores without ever silently
destroying data. You operate read-first and treat every overwrite as dangerous.

## Responsibilities

1. **Create backups** — run the appropriate `ops-backup` script for the detected
   engine/files; place output under `/var/backups/<app>` (700 dir, 600 files);
   apply GPG encryption when a recipient is configured.
2. **Verify integrity** — never report success on an unverified artifact:
   - gzip: `gunzip -t`
   - PostgreSQL custom: `pg_restore --list`
   - tar: `tar -tzf`
   - encrypted: decrypt-and-test stream
   Flag size anomalies (a shrinking dump is a red flag).
3. **Test restore** — periodically restore into a scratch database and run a
   sanity query to prove the backup is actually usable.
4. **Safe restore (DESTRUCTIVE)** — when restoring over an existing/production DB:
   - Take a **fresh safety backup of the current state first** (mandatory).
   - Show **current state vs backup contents**: DB size, table row counts,
     backup timestamp, and the latest data present now.
   - **Warn explicitly** which data will be lost — i.e. everything written
     since the backup's timestamp.
   - Require a **DOUBLE-CONFIRM** token before executing the overwrite.
5. **Monitor backup health** — report the age, size trend, completeness, and
   offsite-sync status of the latest backups; alert on stale or missing runs.

## Operating rules

- READ tier: listing backups, checking ages/sizes, verifying integrity — automatic.
- WRITE tier: creating a backup, syncing offsite — single confirm.
- DESTRUCTIVE tier: any restore that overwrites existing data — double-confirm,
  and refuse to proceed if no current safety backup exists.
- Never write a backup into the webroot. Never print secret values. Never put DB
  passwords on the command line (use 600 option files).
- Be idempotent: re-running rotation/creation must not corrupt existing backups.

## Key Principles

- Prinsip 2: read and verify before you write or overwrite.
- Prinsip 3: a restore is only safe when a fresh, verified backup already exists.
- Prinsip 4: rotation and creation are idempotent and repeatable.
- Prinsip 7: record what was backed up/restored, when, from which artifact.
- Prinsip 8: overwriting production data is double-confirm, never automatic.

**Remember**: an untested backup is not a backup.
````

### Commands

````markdown
---
description: Create a verified, encrypted, rotated backup of an app's databases and files.
---

# /backup

Trigger the `backup-operator` subagent to produce a trustworthy backup.

## Steps

1. **Resolve target** — read the Server Profile for `<app>`: which engine
   (MySQL/PostgreSQL/Redis), which file paths (uploads/state), backup config, and
   GPG recipient. If unknown, run discovery first (`ops-discovery`).
2. **Pre-flight (READ)** — confirm `/var/backups/<app>` exists with mode 700,
   check free disk, show when the last backup ran.
3. **Create (WRITE)** — run the engine-appropriate `ops-backup` script:
   - MySQL: `mysqldump --single-transaction | gzip [ | gpg AES256 ]`
   - PostgreSQL: `pg_dump -Fc`
   - Files: `tar -czf` of uploads/state only (code comes from deploy — Prinsip 9)
4. **Verify integrity** — `gunzip -t` / `pg_restore --list` / `tar -tzf`; abort and
   report if the artifact is corrupt or anomalously small.
5. **Rotate** — enforce daily(7)/weekly(4)/monthly(6) retention idempotently.
6. **Offsite (optional, WRITE)** — `rclone sync` to S3/B2 with `--immutable`.
7. **Record (Prinsip 7)** — log artifact path, size, checksum, and timestamp;
   update the Server Profile's "last backup" field.

Output: artifact path, size, verification result, offsite status.
````

````markdown
---
description: Restore an app's database/files from a backup with diff preview and double-confirmation.
---

# /restore

Trigger the `backup-operator` subagent to restore data safely. Restore that
overwrites existing data is DESTRUCTIVE (Tier 3).

## Steps

1. **List backups (READ)** — enumerate `/var/backups/<app>/{daily,weekly,monthly}`
   and offsite, showing for each: filename, timestamp, size, encrypted?, verified?.
2. **Select & verify** — user picks an artifact; verify it BEFORE touching prod:
   `gunzip -t` / `pg_restore --list` / decrypt-test. Refuse a corrupt artifact.
3. **Safety backup first (mandatory)** — take a fresh, verified backup of the
   CURRENT state. If this fails, abort the restore (Prinsip 3).
4. **Show the diff** — present current-state vs backup-contents:

   | Metric            | Current (live)      | Backup (selected)   |
   | ----------------- | ------------------- | ------------------- |
   | Timestamp         | now                 | 2026-06-14 02:30    |
   | DB size           | 4.2 GB              | 3.9 GB              |
   | Rows (key tables) | users 18,402        | users 17,990        |
   | Last record       | 2026-06-14 09:11    | 2026-06-14 02:29    |

   **Explicitly warn**: all data written since the backup timestamp (here, ~6.5h)
   will be LOST.
5. **DOUBLE-CONFIRM (DESTRUCTIVE)** — require the operator to type the confirmation
   token (e.g. the app name + "RESTORE"). Anything else aborts.
6. **Execute** — decrypt if needed, then `mysql < dump` / `pg_restore --clean
   --if-exists`. For files, extract the tar into the shared path.
7. **Post-verify (Prinsip 7)** — run sanity queries (row counts, app health check),
   confirm the app reconnects, and record the restore in the audit trail with the
   source artifact and the safety-backup path for rollback.
````

## XII. Domain — Security & Hardening

Keamanan pada ECC-Ops bukanlah satu sakelar tunggal, melainkan penerapan **Prinsip 5 (Defense-in-depth)** secara menyeluruh: setiap lapisan — SSH, runtime aplikasi, web server, database, filesystem, dan kernel — dikeraskan secara independen sehingga kegagalan satu kontrol tidak langsung membuka jalan ke seluruh sistem. Domain ini menyatukan tiga skill pengetahuan (firewall, hardening berlapis, deteksi intrusi) dengan dua subagent spesialis (audit read-only dan respons insiden) serta empat command entry point. Filosofinya konsisten dengan **Prinsip 2 (Read-first)**: audit selalu mendahului perubahan, dan setiap fix diterapkan melalui tier persetujuan **WRITE/DESTRUCTIVE** dengan rollback plan, bukan secara membabi buta.

### Skill: ops-firewall

````markdown
---
name: ops-firewall
description: Configure and audit host firewalls (UFW, firewalld) with default-deny posture, port exposure control, and SSH tunneling for private services.
version: 1.0
---

# ops-firewall

Network-layer access control: the outermost ring of defense-in-depth. The rule
is simple — deny everything inbound by default, then explicitly allow only what
a documented service needs. Every other port stays invisible to the internet.

## When to Use
- Provisioning a new server (initial firewall posture before exposing services).
- Auditing which ports are actually listening vs. which are allowed.
- Exposing a new app port (80/443) or restricting admin ports.
- Investigating why a service is/isn't reachable.
- Incident response: emergency lockdown of inbound traffic.

> Tier: enabling/altering firewall rules is **WRITE** (show impact + rollback).
> `ufw disable` / flushing all rules is **DESTRUCTIVE** (double-confirm; never
> run over SSH without a fallback session or scheduled re-enable).

## Golden Rule: SSH Before Enable
Always allow the SSH port **before** enabling the firewall, or you lock yourself
out. Verify the active SSH port first (it may not be 22):

```bash
ss -tlnp | grep -i ssh
grep -E '^Port ' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
```

## UFW (Debian/Ubuntu)

### Baseline configuration
```bash
# 1. Set safe defaults: drop inbound, permit outbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 2. Allow SSH FIRST (adjust port if non-standard), with rate-limiting
sudo ufw limit 22/tcp comment 'SSH rate-limited (brute-force protection)'

# 3. Allow web traffic with descriptive comments
sudo ufw allow 80/tcp  comment 'HTTP (redirect to HTTPS)'
sudo ufw allow 443/tcp comment 'HTTPS'

# 4. Enable logging (records blocked/allowed per policy)
sudo ufw logging on        # default 'low'; use 'medium' when hunting

# 5. Enable the firewall (UFW will warn it may disrupt SSH — SSH is allowed above)
sudo ufw --force enable

# 6. Verify
sudo ufw status verbose
sudo ufw status numbered    # numbered = needed for targeted deletes
```

`limit` on SSH denies a source IP that makes 6+ connections within 30 seconds —
a cheap brute-force speed bump that complements fail2ban (see
`ops-intrusion-detection`).

### Restricting admin ports to a known source
Prefer source-scoped rules over public exposure for anything sensitive:
```bash
sudo ufw allow from 203.0.113.10 to any port 22 proto tcp comment 'SSH from office'
sudo ufw delete limit 22/tcp     # remove the broad limit rule once the scoped rule is in place
```

### Rollback
```bash
sudo cp -a /etc/ufw /etc/ufw.bak.$(date +%F-%H%M)   # before changes
sudo ufw status numbered                            # note rule numbers
sudo ufw delete <N>                                 # undo a specific rule
# Full revert if needed (DESTRUCTIVE — ensure an open SSH session exists):
sudo ufw reset
```

## Ports That MUST NOT Be Public
Databases, caches, and search/admin services must **never** listen on a public
interface or be allowed through the firewall. Bind them to `127.0.0.1` (or a
private VLAN) and reach them via SSH tunnel.

| Port  | Service                | Risk if exposed                          |
|-------|------------------------|------------------------------------------|
| 3306  | MySQL / MariaDB        | Full DB takeover, credential brute-force |
| 5432  | PostgreSQL             | Full DB takeover, data exfiltration      |
| 6379  | Redis                  | Unauth RCE (CONFIG/SLAVEOF), data theft  |
| 27017 | MongoDB                | Mass ransom of unauth instances          |
| 9200  | Elasticsearch          | Open index dump, RCE via scripting       |
| 11211 | Memcached              | Data leak + UDP amplification DDoS       |

Confirm they are bound locally, not exposed:
```bash
ss -tlnp | grep -E ':(3306|5432|6379|27017|9200|11211)\b'
# GOOD -> 127.0.0.1:3306   BAD -> 0.0.0.0:3306 or *:3306
```

### Solution: SSH tunnel (do not open the port)
Access a private DB/cache from your workstation by forwarding over SSH:
```bash
# Local 5433 -> remote PostgreSQL on 127.0.0.1:5432, via the server's SSH
ssh -N -L 5433:127.0.0.1:5432 deploy@server.example.com
#   then connect to localhost:5433 with your client

# MySQL example
ssh -N -L 3307:127.0.0.1:3306 deploy@server.example.com

# Redis example
ssh -N -L 6380:127.0.0.1:6379 deploy@server.example.com
```
The remote port is never reachable from the internet; the encrypted SSH session
is the only path in. No firewall `allow` rule is added.

## firewalld (CentOS / AlmaLinux / Rocky / RHEL)

```bash
# Inspect current state
sudo firewall-cmd --state
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --list-all

# Persist services into the active zone (e.g., public)
sudo firewall-cmd --permanent --zone=public --add-service=ssh
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https

# Rate-limit SSH via a rich rule (4 conns/min per source)
sudo firewall-cmd --permanent --zone=public --add-rich-rule=\
'rule service name="ssh" limit value="4/m" accept'

# Scope SSH to a trusted source instead of the whole world
sudo firewall-cmd --permanent --zone=public --add-rich-rule=\
'rule family="ipv4" source address="203.0.113.10" service name="ssh" accept'

# Apply and verify
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

Logging denied packets:
```bash
sudo firewall-cmd --set-log-denied=unicast
sudo firewall-cmd --get-log-denied
```

## Port Audit: Listening vs. Allowed
The two views must agree. Anything **listening** that is not deliberately
**allowed** (and not bound to localhost) is an exposure to investigate.

```bash
# What is actually listening, with owning process
sudo ss -tlnp

# UFW: cross-check against firewall policy
sudo ufw status verbose

# firewalld: cross-check
sudo firewall-cmd --list-all

# Quick reconciliation: list public-facing listeners (not 127.0.0.1 / ::1)
sudo ss -tlnp | grep -vE '127\.0\.0\.1|\[::1\]'
```

Audit decision matrix:

| Listening on        | In allow rules? | Verdict                                  |
|---------------------|-----------------|------------------------------------------|
| 0.0.0.0 / public IP | Yes (intended)  | OK — documented public service           |
| 0.0.0.0 / public IP | No              | EXPOSED — bind to localhost or add deny  |
| 127.0.0.1 / ::1     | n/a             | OK — local only, not reachable           |
| DB/cache port       | Any             | FAIL — must be localhost + SSH tunnel    |

## Related
- `ops-security-hardening` — host hardening once the firewall is in place.
- `ops-intrusion-detection` — fail2ban consumes firewall to ban abusive IPs.
- `ops-database` — bind DB/cache to localhost (prevents public exposure).
- `ops-server-core` — SSH configuration referenced by the SSH allow rule.
````

### Skill: ops-security-hardening

````markdown
---
name: ops-security-hardening
description: Apply layered host hardening across SSH, PHP, Nginx, database, filesystem, and kernel/network, plus automatic security updates.
version: 1.0
---

# ops-security-hardening

Defense-in-depth (Principle 5) made concrete. No single control is trusted; each
layer is hardened so a breach of one does not cascade. Audit each layer
read-first, then apply fixes under the WRITE tier with a rollback copy of every
config touched.

## When to Use
- After provisioning, before a server is exposed to traffic.
- Periodic hardening review (quarterly, or after any incident).
- When `/security-audit` flags a layer below baseline.
- Before passing a compliance/security gate.

## Layer 1 — SSH
SSH is the primary remote-access door; harden it first. Edit in a drop-in file
(`/etc/ssh/sshd_config.d/99-hardening.conf`) so package upgrades don't clobber it.

| Setting                        | Secure value        | Why                                    |
|--------------------------------|---------------------|----------------------------------------|
| `PermitRootLogin`              | `no`                | Force named users + sudo (audit trail) |
| `PasswordAuthentication`       | `no`                | Keys only — defeats brute force        |
| `PubkeyAuthentication`         | `yes`               | Key-based auth                         |
| `KbdInteractiveAuthentication` | `no`                | Close the PAM password path            |
| `PermitEmptyPasswords`         | `no`                | Never allow blank passwords            |
| `MaxAuthTries`                 | `3`                 | Limit guesses per connection           |
| `LoginGraceTime`               | `20`                | Drop idle pre-auth sessions fast       |
| `X11Forwarding`                | `no`                | Reduce attack surface                  |
| `AllowAgentForwarding`         | `no`                | Prevent agent hijack on shared hosts   |
| `ClientAliveInterval`          | `300`               | Reap dead/idle sessions                |
| `ClientAliveCountMax`          | `2`                 | Disconnect after ~10 min idle          |
| `AllowUsers`                   | `deploy admin`      | Allowlist who may log in               |
| `Protocol`                     | `2`                 | SSHv2 only (implicit on modern OpenSSH)|

Modern crypto (OpenSSH 9.x):
```ini
# /etc/ssh/sshd_config.d/99-hardening.conf
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,sntrup761x25519-sha512@openssh.com
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
HostKeyAlgorithms ssh-ed25519,rsa-sha2-512,rsa-sha2-256
```
Validate before reloading — a bad config can lock you out:
```bash
sudo sshd -t && sudo systemctl reload ssh   # 'sshd' on RHEL-family
# Keep your current session open; test login in a NEW terminal before closing.
```

## Layer 2 — PHP Hardening
Apply in `/etc/php/8.3/fpm/conf.d/99-hardening.ini` (path varies by version).

```ini
; Hide PHP version from headers
expose_php = Off

; Disable high-risk functions (tune to app needs; test after applying)
disable_functions = exec,passthru,shell_exec,system,proc_open,popen,curl_multi_exec,parse_ini_file,show_source,pcntl_exec,dl

; Confine filesystem access to app + temp only
open_basedir = /var/www/app:/var/lib/php/sessions:/tmp

; Block remote file inclusion / SSRF-via-include
allow_url_fopen = Off
allow_url_include = Off

; Error handling — log, never display to users in production
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log

; Secure session cookies
session.cookie_httponly = 1
session.cookie_secure   = 1
session.cookie_samesite = Lax
session.use_strict_mode = 1

; Limits to blunt abuse
file_uploads = On
upload_max_filesize = 16M
max_execution_time = 30
```
```bash
sudo systemctl reload php8.3-fpm
php -i | grep -E 'expose_php|allow_url_fopen|open_basedir'   # verify
```

## Layer 3 — Nginx Hardening
```nginx
# /etc/nginx/conf.d/hardening.conf  (http context)

# Hide version banner
server_tokens off;

# Security headers (apply site-wide)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" always;
```
```nginx
# Inside each server { } — block common exploit/probe paths
location ~ /\.(?!well-known).* { deny all; access_log off; log_not_found off; }   # dotfiles: .env .git etc.
location ~* \.(env|ini|log|sh|sql|bak|swp|conf)$ { deny all; }                    # sensitive extensions
location ~* /(wp-login\.php|xmlrpc\.php) { deny all; }                            # WordPress probes (if not WP)
location ~* /(phpmyadmin|pma|adminer|\.git|\.svn) { deny all; }                   # admin tool probes
location = /readme.html { deny all; }
```
```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://example.com | grep -iE 'strict-transport|content-security|x-frame|server'
```

## Layer 4 — Database Hardening (summary)
Bind to `127.0.0.1`, drop anonymous/test users, enforce least-privilege grants,
require TLS for any non-local link. Full procedures live in `ops-database`.
```bash
ss -tlnp | grep -E ':(3306|5432)'   # MUST show 127.0.0.1, never 0.0.0.0
```

## Layer 5 — Filesystem Permissions
Least privilege per path. The web/runtime user owns app files; the user should
**not** be able to write its own code (Principle 9: server mirrors source).

| Path                         | Owner:Group        | Mode  | Notes                          |
|------------------------------|--------------------|-------|--------------------------------|
| `/var/www/app` (code)        | `deploy:www-data`  | `755` | Dirs 755, files 644            |
| App writable (storage/cache) | `www-data:www-data`| `775` | Only these dirs are writable   |
| `.env` / secrets             | `deploy:www-data`  | `640` | Never world-readable           |
| `/etc/ssl/private/*`         | `root:root`        | `600` | Private keys, root-only        |
| `~/.ssh/authorized_keys`     | `<user>:<user>`    | `600` | `~/.ssh` dir `700`             |
| `/etc/nginx`, `/etc/php`     | `root:root`        | `644` | Config dirs `755`              |

**CRITICAL: never `chmod 777`.** World-writable means any local process — or a
compromised app — can overwrite the file. Use correct ownership + group perms
instead.

Hunt dangerous permissions:
```bash
# World-writable files (excluding sticky-bit dirs like /tmp)
sudo find / -xdev -type f -perm -0002 ! -path '/proc/*' 2>/dev/null

# World-writable directories without the sticky bit
sudo find / -xdev -type d -perm -0002 ! -perm -1000 2>/dev/null

# Unexpected SUID/SGID binaries — baseline and watch for new entries
sudo find / -xdev \( -perm -4000 -o -perm -2000 \) -type f 2>/dev/null
```

## Layer 6 — Kernel / Network (sysctl)
```ini
# /etc/sysctl.d/99-hardening.conf

# SYN flood mitigation
net.ipv4.tcp_syncookies = 1

# Anti-spoofing: reverse path filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects (prevent MITM route injection)
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Drop source-routed packets
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Log martian (spoofed) packets
net.ipv4.conf.all.log_martians = 1

# ASLR — randomize memory layout
kernel.randomize_va_space = 2

# Symlink/hardlink protections (defeat /tmp races)
fs.protected_symlinks = 1
fs.protected_hardlinks = 1

# Restrict kernel pointer/dmesg leakage
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
```
```bash
sudo sysctl --system          # apply
sudo sysctl net.ipv4.tcp_syncookies kernel.randomize_va_space   # verify
```

## Layer 7 — Automatic Security Updates
Debian/Ubuntu:
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# Restrict to security pocket in /etc/apt/apt.conf.d/50unattended-upgrades:
#   "${distro_id}:${distro_codename}-security";
sudo unattended-upgrade --dry-run -d    # test
```
RHEL-family:
```bash
sudo dnf install -y dnf-automatic
sudo sed -i 's/^apply_updates = no/apply_updates = yes/' /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
```
> See `ops-update-patch` for staged updates of packages that warrant a reboot
> or a rollback plan.

## Quick Audit Script
Read-only snapshot of the hardening posture (run before applying any fix):
```bash
#!/usr/bin/env bash
# ops-hardening-audit.sh — READ ONLY
set -u
line(){ printf '\n=== %s ===\n' "$1"; }

line "SSH"
sudo sshd -T 2>/dev/null | grep -Ei 'permitrootlogin|passwordauthentication|maxauthtries|permitemptypasswords'

line "PHP"
php -i 2>/dev/null | grep -Ei 'expose_php|allow_url_fopen|open_basedir' || echo 'php cli not found'

line "Nginx"
nginx -V 2>&1 | head -1; grep -R 'server_tokens' /etc/nginx 2>/dev/null

line "DB/cache exposure (should be 127.0.0.1 only)"
sudo ss -tlnp | grep -E ':(3306|5432|6379|27017)' || echo 'none listening'

line "World-writable files (top 20)"
sudo find / -xdev -type f -perm -0002 ! -path '/proc/*' 2>/dev/null | head -20

line "sysctl"
sysctl net.ipv4.tcp_syncookies kernel.randomize_va_space fs.protected_symlinks 2>/dev/null

line "Auto-updates"
systemctl is-enabled unattended-upgrades 2>/dev/null || systemctl is-enabled dnf-automatic.timer 2>/dev/null || echo 'not enabled'
```

## Related
- `ops-firewall` — network layer that precedes host hardening.
- `ops-intrusion-detection` — active detection on top of hardening.
- `ops-database` — full DB hardening procedures.
- `ops-server-core` — base SSH/user setup this layer tightens.
- `ops-update-patch` — staged updates and reboot-safe patching.
- `ops-ssl` — TLS that backs HSTS and secure cookies.
````

### Skill: ops-intrusion-detection

````markdown
---
name: ops-intrusion-detection
description: Active intrusion detection via fail2ban, AIDE file integrity, and structured log monitoring for SSH attacks, web probes, and outbound anomalies.
version: 1.0
---

# ops-intrusion-detection

Hardening reduces the attack surface; detection tells you when someone is
probing or has gotten in. This layer adds automated banning (fail2ban),
file-integrity baselining (AIDE), and log-pattern hunting — the third ring of
defense-in-depth, focused on visibility and rapid response.

## When to Use
- Hardening a server after firewall + host hardening are in place.
- Recurring brute-force or probe traffic in logs.
- After an incident, to baseline integrity and watch for re-entry.
- Setting up proactive detection for `monitoring-sentinel` to consume.

## fail2ban
Install and configure via `jail.local` (never edit `jail.conf` — it is replaced
on upgrade).

```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
# Ban via firewall; never lock out your own admin IPs
ignoreip = 127.0.0.1/8 ::1 203.0.113.10
banaction = ufw            # use 'firewallcmd-rich-rules' on RHEL-family

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 2h

[nginx-http-auth]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log

[nginx-badbots]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/access.log
maxretry = 2

# Custom jail: ban probes for sensitive paths
[nginx-sensitive-probe]
enabled  = true
port     = http,https
filter   = nginx-sensitive-probe
logpath  = /var/log/nginx/access.log
maxretry = 1
bantime  = 24h
```

Custom filter for sensitive-path scanning (`.env`, `.git`, wp-login, phpmyadmin):
```ini
# /etc/fail2ban/filter.d/nginx-sensitive-probe.conf
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) [^"]*(/\.env|/\.git|/wp-login\.php|/xmlrpc\.php|/phpmyadmin|/pma|/adminer|/\.aws|/config\.php|/\.ssh)[^"]*" .*$
ignoreregex =
```

Operate and verify:
```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status                       # list active jails
sudo fail2ban-client status sshd                  # banned IPs for a jail
sudo fail2ban-client status nginx-sensitive-probe
# Test a filter against real logs before enabling its jail:
sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/nginx-sensitive-probe.conf
sudo fail2ban-client set sshd unbanip 203.0.113.99   # manual unban
```

## File Integrity — AIDE
Baseline the filesystem, then detect any unexpected change to binaries/configs.

```bash
# Install
sudo apt install -y aide aide-common      # Debian/Ubuntu
# sudo dnf install -y aide                 # RHEL-family

# Initialize the baseline DB (do this on a KNOWN-GOOD system)
sudo aideinit                              # Debian helper
# or: sudo aide --init
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# On-demand integrity check
sudo aide --check
```

Schedule a daily check with emailed diff:
```bash
# /etc/cron.d/aide-check
0 4 * * * root /usr/bin/aide --check | mail -s "AIDE report $(hostname)" root
```
> Store the AIDE DB offline/read-only where feasible — an attacker who can edit
> the baseline can hide their changes. After any **legitimate** change (deploy,
> patch), re-initialize the baseline.

## Log Monitoring Patterns
Read-only hunting queries. Feed recurring hits into fail2ban jails or alerts.

```bash
# --- Failed SSH logins (brute force) ---
sudo journalctl -u ssh --since "1 hour ago" | grep -i 'Failed password'
sudo grep -i 'authentication failure' /var/log/auth.log | awk '{print $NF}' | sort | uniq -c | sort -rn | head
# Successful logins from unexpected IPs:
sudo journalctl -u ssh | grep -i 'Accepted'

# --- Web injection / traversal probes in Nginx ---
sudo grep -E "(\.\./|/etc/passwd|union.*select|<script|base64_decode|/\.env|/\.git)" /var/log/nginx/access.log
# Top 404-generating scanners:
sudo awk '$9==404{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head

# --- Suspicious outbound / reverse shell ---
# Unexpected outbound connections (look for shells/web servers reaching out):
sudo ss -tnp state established | grep -vE ':(443|80|53|22)\b'
# Listeners that should not exist (potential backdoor/bind shell):
sudo ss -tlnp
# Shells/interpreters with active network sockets:
sudo lsof -i -nP | grep -E '(bash|sh|nc|ncat|python|perl)\b'

# --- Privilege use ---
sudo grep -i 'sudo:' /var/log/auth.log | grep -i 'COMMAND='     # who ran what as root
sudo journalctl _COMM=sudo --since today

# --- New SUID binaries vs. baseline ---
sudo find / -xdev -perm -4000 -type f 2>/dev/null | sort > /tmp/suid.now
diff /var/lib/ops/suid.baseline /tmp/suid.now    # baseline created during hardening
```

Indicators worth immediate escalation to `ops-incident-response`:
- A shell/interpreter holding an outbound connection (reverse shell).
- A new listening port owned by a non-service process (bind shell/backdoor).
- New SUID binary not from a package.
- AIDE reporting changes to `/bin`, `/usr/bin`, `/etc/ssh`, or cron paths.

## Related
- `ops-firewall` — fail2ban enforces bans through it.
- `ops-security-hardening` — reduces what detection has to watch.
- `ops-incident-response` — escalation path for confirmed intrusions.
- `ops-monitoring` — alerting pipeline for detection signals.
- `ops-log-management` — log locations and retention these queries rely on.
````

### Subagent: security-auditor

````markdown
---
name: security-auditor
description: PROACTIVELY runs a read-only, full-stack security audit across SSH, firewall/ports, web server, runtime, DB, permissions, IDS, SSL, updates, and backups. Use before exposing a server, after incidents, on a recurring schedule, or whenever the user asks "is this server secure?". Reports findings by severity with exact remediation commands.
tools: ["Read","Bash"]
model: sonnet
---

You are a security auditor. Your job is to inspect a server across every defense
layer and report what is wrong, how bad it is, and exactly how to fix it — all
without changing anything.

## Operating Rules
- **READ-ONLY (Principle 2).** You run only inspection commands: `ss`, `find`,
  `grep`, `sshd -T`, `ufw status`, `firewall-cmd --list-all`, `systemctl status`,
  `php -i`, `nginx -T`, `aide --check`, `fail2ban-client status`, etc. You NEVER
  modify config, restart services, or ban/unban. Remediation is reported, not
  applied — applying belongs to `/harden` under the WRITE tier.
- If you need a destructive or write command to confirm something, describe it
  instead of running it.

## Audit Coverage (every layer)
1. **SSH** — `sshd -T`: PermitRootLogin, PasswordAuthentication, MaxAuthTries,
   PermitEmptyPasswords, crypto algorithms, AllowUsers.
2. **Firewall / ports** — default policy, SSH rate-limit, public listeners vs.
   allow rules; flag any DB/cache port reachable off-localhost.
3. **Web server** — `server_tokens`, security headers (HSTS, CSP, X-Frame,
   X-Content-Type-Options, Permissions-Policy), exposed dotfiles/admin paths.
4. **Runtime** — PHP (`expose_php`, `allow_url_fopen`, `open_basedir`,
   `disable_functions`, cookie flags) / Node / Python exposure.
5. **Database** — local binding, anonymous/test users, weak grants (refer to
   `ops-database` for deep checks).
6. **Filesystem** — world-writable files/dirs, unexpected SUID/SGID,
   `.env`/key permissions, any `777`.
7. **IDS** — fail2ban running with expected jails; AIDE initialized + recent.
8. **SSL/TLS** — certificate validity/expiry, protocol versions, weak ciphers.
9. **Updates** — pending security updates, unattended-upgrades/dnf-automatic on.
10. **Backups** — backup job present and last run recent (refer `ops-backup`).

## Severity Classification
| Severity  | Definition                                              | Examples                                                        |
|-----------|---------------------------------------------------------|----------------------------------------------------------------|
| CRITICAL  | Direct path to compromise; fix now                      | Root SSH + password auth on; DB on 0.0.0.0; world-writable web root; cert expired |
| HIGH      | Serious weakness, likely exploitable                    | No fail2ban; missing HSTS/CSP on auth app; pending security updates; SUID anomaly |
| MEDIUM    | Hardening gap, defense-in-depth shortfall               | `server_tokens on`; `allow_url_fopen On`; no auto-updates       |
| LOW       | Minor / best-practice                                   | Verbose error pages off but version banner present; loose file modes |

## Output Format
Group findings by severity, give the **exact** remediation command, and ALSO
list what PASSED so the user sees the full posture.

```
╔══════════════════════════════════════════════════════════════╗
║  SECURITY AUDIT — <hostname>            <YYYY-MM-DD HH:MM UTC> ║
╠══════════════════════════════════════════════════════════════╣
║  Score: 7 PASS · 1 CRIT · 2 HIGH · 1 MED · 0 LOW              ║
╚══════════════════════════════════════════════════════════════╝

[CRITICAL] SSH: root login permitted with password auth
  Evidence : permitrootlogin yes / passwordauthentication yes
  Impact   : Internet-facing brute-force path to root.
  Fix      : echo -e 'PermitRootLogin no\nPasswordAuthentication no' \
             | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
             sudo sshd -t && sudo systemctl reload ssh

[HIGH] Firewall: PostgreSQL listening on 0.0.0.0:5432
  Evidence : ss -tlnp -> *:5432 (postgres)
  Impact   : DB exposed to the internet.
  Fix      : set listen_addresses='localhost' in postgresql.conf;
             reach it via: ssh -N -L 5433:127.0.0.1:5432 user@host

[MEDIUM] Nginx: server_tokens on (version disclosed)
  Fix      : add 'server_tokens off;' to http{} ; sudo nginx -t && reload

── PASSED ─────────────────────────────────────────────────────
  [OK] UFW default deny incoming, SSH rate-limited
  [OK] fail2ban active (sshd, nginx-sensitive-probe)
  [OK] TLS cert valid 71 days; TLS 1.2/1.3 only
  [OK] No world-writable files in web root
  [OK] unattended-upgrades enabled
```

Always: cite evidence, never guess, and prefer scoped fixes over broad ones.

## Key Principles
- Read-first, never write — auditing must not alter the system (Principle 2).
- Every layer, every time — defense-in-depth means no layer is skipped (Principle 5).
- Exact, copy-pasteable remediation tied to evidence — no vague advice.
- Report PASSED items too; a clean layer is information, not silence.
- Classify honestly; do not downgrade a real CRITICAL to look better.

**Remember**: An audit that changes nothing and hides nothing — evidence in, severity-ranked truth out.
````

### Subagent: incident-responder

````markdown
---
name: incident-responder
description: PROACTIVELY guides live incident response when compromise, breach, or outage is suspected. Use the moment there are signs of intrusion (reverse shell, unknown process/port, defacement), data breach, or a P1 outage. Drives Contain → Assess → Preserve → Remediate → Review while preserving evidence first.
tools: ["Read","Bash"]
model: opus
---

You are an incident responder. You take command of a suspected security incident
or outage and walk the operator through a disciplined response. Speed matters,
but **evidence preservation and not making things worse matter more.**

## Cardinal Rules
- **Preserve before you change.** Capture volatile state (processes, network,
  logins, memory artifacts) BEFORE killing processes, banning IPs, or rebuilding.
  Remediation that destroys evidence is a mistake you cannot undo.
- **Do not contaminate evidence.** Prefer read commands; copy logs rather than
  rotating them; note timestamps and the commands you ran (Principle 7).
- **Never minimize severity.** If unsure between two severities, choose the
  higher one. Assume breach until evidence says otherwise.
- **Confirm-before-harm still applies** (Principle 8) — but legitimate
  containment (isolating a compromised host) is authorized once stated clearly.

## Response Flow
**1. CONTAIN** — stop the bleeding without destroying evidence.
- Isolate: tighten the firewall to drop all but your admin IP (do NOT wipe yet).
- Do not reboot (loses memory/volatile evidence) unless safety requires it.

**2. ASSESS** — scope the incident: what, where, how deep.
- Sessions, processes, connections, changed files, logins, cron, persistence.

**3. PRESERVE** — snapshot evidence to a safe location (ideally off-host).

**4. REMEDIATE** — only after preserve: rotate all credentials, remove
persistence, and rebuild from known-good if compromise is confirmed.

**5. REVIEW** — root cause, timeline, and hardening to prevent recurrence.

## First-Response Commands (read/preserve)
```bash
# Timestamp the response and start a transcript
date -u; HOST=$(hostname); EVID=/var/tmp/incident-$(date +%Y%m%d-%H%M); mkdir -p "$EVID"

# --- CONTAIN (state intent clearly; this is WRITE) ---
# sudo ufw default deny incoming && sudo ufw allow from <ADMIN_IP> to any port 22

# --- ASSESS / PRESERVE (read-only captures) ---
who -a                        | tee "$EVID/sessions.txt"   # active sessions
last -20                      | tee "$EVID/last.txt"       # recent logins
ps auxww                      | tee "$EVID/processes.txt"  # full process list
sudo ss -tunap                | tee "$EVID/connections.txt"# sockets + owners
sudo lsof -i -nP              | tee "$EVID/netfiles.txt"   # net file handles
sudo crontab -l 2>/dev/null   | tee "$EVID/cron-root.txt"
ls -la /etc/cron.* /var/spool/cron 2>/dev/null | tee "$EVID/cron-all.txt"
# Files changed in last 24h (persistence / webshells)
sudo find / -xdev -mtime -1 -type f ! -path '/proc/*' ! -path '/sys/*' 2>/dev/null | tee "$EVID/changed-24h.txt"
# Auth + sudo history
sudo cp -a /var/log/auth.log "$EVID/" 2>/dev/null || sudo journalctl -u ssh > "$EVID/ssh.log"
# Reverse-shell hunt: shells with sockets
sudo lsof -i -nP | grep -E '(bash|sh|nc|python|perl)\b' | tee "$EVID/suspect-shells.txt"
# New SUID vs baseline
sudo find / -xdev -perm -4000 -type f 2>/dev/null | tee "$EVID/suid.txt"
```

When a process must be stopped, **record it first** (`ps`, `lsof`, copy the
binary, capture `/proc/<pid>/`) before `kill`.

## Output
State current phase, what you observed, the single next action, and its tier.
Keep a running evidence list and a timeline. Hand off long procedures to
`ops-incident-response`.

## Key Principles
- Preserve before remediate — volatile evidence is gone the moment you act.
- Do not destroy or contaminate evidence; log every command (Principle 7).
- Assume the worst on severity; never minimize.
- Contain first, but cleanly — isolation, not destruction.
- Rotate every credential the host could have touched once compromise is confirmed.

**Remember**: In an incident, the worst move is a fast one that erases how it happened — preserve, then act.
````

### Skill: ops-incident-response

````markdown
---
name: ops-incident-response
description: Severity-ranked incident procedures for server compromise, data breach, and service outage — contain, assess, preserve evidence, remediate, and review.
version: 1.0
---

# ops-incident-response

The playbook for when prevention has failed or service is down. Every procedure
preserves evidence before remediation (Principle 7: auditable) and treats
destructive recovery steps under the DESTRUCTIVE tier (backup verified first).

## When to Use
- Signs of compromise: reverse shell, unknown process/port, defacement, webshell.
- Suspected data breach / exfiltration.
- Production outage (service down, site unreachable, cascading failure).
- Any alert from `ops-intrusion-detection` that crosses the escalation line.

## Severity & Response Time
| Sev | Definition                                              | Response time      | Examples                                  |
|-----|---------------------------------------------------------|--------------------|-------------------------------------------|
| P1  | Confirmed compromise OR full production outage          | Immediate (<15 min)| Root breach, ransomware, site down hard   |
| P2  | Partial outage or active high-risk attack in progress   | <1 hour            | One app down; ongoing brute force         |
| P3  | Degraded service or contained security issue            | <4 hours           | Slow responses; isolated probe banned     |
| P4  | Minor / informational                                   | Next business day  | Single failed login burst, expired LOW cert |

## Procedure — P1 Server Compromise
Follow in order. **Do not skip Preserve.**

### 1. Contain (without destroying evidence)
```bash
# Lock inbound to your admin IP only — DO NOT wipe rules or reboot yet
sudo ufw default deny incoming
sudo ufw allow from <ADMIN_IP> to any port 22 proto tcp comment 'incident admin'
# Reboot loses RAM/volatile evidence — avoid unless safety demands it.
# If active exfiltration: block egress to the attacker IP specifically.
sudo ufw deny out to <ATTACKER_IP>
```

### 2. Assess (scope the breach)
```bash
who -a; w                                  # live sessions / intruder logged in?
ps auxfww                                  # process tree — odd parents, miners
sudo ss -tunap                             # connections — C2 / reverse shell
sudo lsof -i -nP | grep -E '(sh|nc|python|perl)\b'   # shells with sockets
last -50; sudo lastb -20                   # successful / failed logins
sudo find / -xdev -mtime -2 -type f ! -path '/proc/*' 2>/dev/null   # changed files
sudo crontab -l; ls -la /etc/cron.* /var/spool/cron/* 2>/dev/null   # persistence
ls -la /etc/systemd/system /etc/init.d 2>/dev/null                  # rogue services
sudo find / -xdev -perm -4000 -type f 2>/dev/null                   # new SUID
# Lightweight rootkit / integrity check:
sudo aide --check 2>/dev/null; which chkrootkit rkhunter && sudo rkhunter --check --sk
```

### 3. Preserve Evidence (snapshot BEFORE remediation)
```bash
EVID=/var/tmp/incident-$(date +%Y%m%d-%H%M%S); sudo mkdir -p "$EVID"
{ date -u; hostname; uname -a; } | sudo tee "$EVID/meta.txt"
sudo ps auxfww          | sudo tee "$EVID/processes.txt"
sudo ss -tunap          | sudo tee "$EVID/connections.txt"
sudo lsof -nP           | sudo tee "$EVID/openfiles.txt"
sudo cp -a /var/log "$EVID/log-copy"                       # logs intact
sudo find / -xdev -mtime -2 -type f 2>/dev/null | sudo tee "$EVID/changed-files.txt"
# Copy suspicious binaries before killing their processes; capture /proc/<pid>/exe.
sudo tar czf "$EVID.tar.gz" -C "$(dirname "$EVID")" "$(basename "$EVID")"
# Move the archive OFF-HOST (a compromised host cannot be trusted to keep it):
scp "$EVID.tar.gz" evidence@vault:/incidents/
```

### 4. Remediate (after evidence is safe)
- Kill confirmed malicious processes (recorded first); remove persistence
  (cron, systemd units, authorized_keys, LD_PRELOAD).
- **Rotate ALL credentials the host could have touched** — treat every secret as
  burned:
```bash
# SSH: regenerate keys, replace authorized_keys with known-good only
# App: rotate .env secrets, API keys, DB passwords (see ops-secrets)
# DB: change all DB user passwords (see ops-database)
# TLS: reissue certs/private keys if key exposure is possible (see ops-ssl)
# Cloud/provider tokens, webhook secrets, mail creds, etc.
```
- **Rebuild when in doubt.** If root was compromised or a rootkit is suspected,
  do NOT trust the OS — rebuild from a known-good image and restore data from a
  **pre-incident, verified** backup (DESTRUCTIVE; confirm backup integrity first
  per `ops-backup`). A "cleaned" rooted box is never trustworthy.

### 5. Post-Incident Review
- Timeline from preserved logs; identify entry vector and dwell time.
- Close the vector (patch, config, credential hygiene) via `ops-security-hardening`.
- Add detection so it cannot recur silently (`ops-intrusion-detection`).
- Record who/what/when/why + remediation in the changelog (Principle 7).

## Procedure — P1 Service Outage (diagnostic decision tree)
Read-first triage, narrowing from network to app:
```
Site unreachable?
├─ DNS resolves?            dig +short example.com  ── No → fix DNS (ops-dns)
├─ Host reachable?          ping / curl -I https://example.com
│    └─ No (conn refused/timeout) → firewall? web server down?
│         sudo ufw status; sudo systemctl status nginx
├─ Web server up but 5xx?   curl -I https://example.com  (502/503/504)
│    ├─ 502/504 → upstream down → check app/runtime:
│    │     systemctl status php8.3-fpm | pm2 list | systemctl status <app>
│    │     sudo tail -50 /var/log/nginx/error.log
│    ├─ 503 → overload/maintenance → load + workers:
│    │     uptime; free -h; df -h           # CPU/RAM/disk exhausted?
│    └─ 500 → app error → app logs (ops-log-management)
├─ Resource exhaustion?     df -h (disk full?) ; free -h (OOM?) ; dmesg | tail
│    └─ OOM killer?  dmesg | grep -i 'killed process'  → restart + tune
└─ DB down?                 systemctl status mysql|postgresql ; check connections
```
Triage commands (all READ):
```bash
curl -so /dev/null -w '%{http_code} %{time_total}s\n' https://example.com
systemctl --failed                          # any failed units?
journalctl -p err --since "30 min ago"      # recent errors
df -h; free -h; uptime                       # resource snapshot
sudo ss -s                                   # socket summary (exhaustion?)
```
Restart of a failed service is a **WRITE** action — show impact, then:
`sudo systemctl restart <service>` and verify with `systemctl status` + a fresh
`curl`. If a recent deploy caused it, prefer rollback (see `ops-deploy`).

## Related
- `ops-intrusion-detection` — signals that trigger these procedures.
- `ops-security-hardening` — close the vector after review.
- `ops-secrets` — credential rotation during remediation.
- `ops-backup` — verified pre-incident backups for rebuild/restore.
- `ops-firewall` — containment and egress blocking.
- `ops-deploy` — rollback path for deploy-caused outages.
````

### Commands

````markdown
---
description: Audit and configure the host firewall (UFW or firewalld) with a default-deny posture.
---

# /firewall

Manage network-layer access control. Detects the firewall in use, reports the
current posture, and applies changes under the WRITE tier (rule edits) or
DESTRUCTIVE tier (`ufw disable`/reset).

## Steps
1. Detect: UFW vs. firewalld; read current rules and default policy (READ).
2. Reconcile listening ports (`ss -tlnp`) against allow rules; flag public DB/
   cache ports and any undocumented exposure.
3. Propose changes: default deny incoming / allow outgoing, SSH rate-limit
   (`limit 22`), allow 80/443 with comments, scope admin ports to known IPs.
4. **Confirm SSH is allowed before enabling** to avoid lockout.
5. Apply with a config backup (`/etc/ufw` copy) and show the resulting status.

## Subagents
- `security-auditor` — for the read-only exposure assessment in step 2.

Refers to skill `ops-firewall`.
````

````markdown
---
description: Run a read-only, full-stack security audit and report findings by severity with exact fixes.
---

# /security-audit

Read-only assessment of every defense layer. Changes nothing; produces a
severity-ranked report (CRITICAL/HIGH/MEDIUM/LOW) plus a PASSED list, each with
exact remediation commands.

## Steps
1. Invoke `security-auditor` to inspect SSH, firewall/ports, web server, runtime,
   DB, filesystem permissions, IDS, SSL, updates, and backups (all READ).
2. Classify each finding by severity; cite evidence.
3. Output the boxed audit report; record a summary in the Server Profile audit
   field (Principle 6).

## Subagents
- `security-auditor` (primary).

Refers to skills `ops-firewall`, `ops-security-hardening`, `ops-intrusion-detection`.
````

````markdown
---
description: Audit the server, then apply hardening fixes incrementally with confirmation and rollback.
---

# /harden

Closes the loop after `/security-audit`: applies the recommended fixes one layer
at a time, each as a WRITE action with impact shown, a config backup taken, and
a rollback command provided.

## Steps
1. Run `/security-audit` first (READ) to establish findings and baseline.
2. For each layer (SSH → firewall → web server → PHP/runtime → filesystem →
   sysctl → auto-updates → fail2ban/AIDE), present the fix, its impact, and
   rollback; apply only on confirmation (WRITE).
3. Validate each change before moving on (`sshd -t`, `nginx -t`, re-`curl`
   headers, `fail2ban-client status`) per the verify rule.
4. Never apply all changes blindly; SSH changes are tested in a second session
   before the current one is closed.

## Subagents
- `security-auditor` — re-runs to confirm each fix took effect.

Refers to skills `ops-security-hardening`, `ops-firewall`, `ops-intrusion-detection`.
````

````markdown
---
description: Guided incident response for suspected compromise, breach, or outage.
---

# /incident

Drives a disciplined incident response: Contain → Assess → Preserve → Remediate
→ Review. Preserves evidence before any remediation and treats rebuild/restore
as DESTRUCTIVE (verified backup required).

## Steps
1. Triage severity (P1–P4) and state the response clock.
2. Hand off to `incident-responder` to contain (isolate to admin IP, no reboot),
   then assess scope (sessions/processes/connections/changed files/persistence).
3. Preserve an evidence snapshot off-host BEFORE remediation (Principle 7).
4. Remediate: rotate all credentials; remove persistence; rebuild from known-good
   + verified pre-incident backup if compromise is confirmed.
5. Post-incident review: root cause, timeline, hardening, changelog entry.

## Subagents
- `incident-responder` (primary).

Refers to skills `ops-incident-response`, `ops-intrusion-detection`, `ops-security-hardening`, `ops-secrets`, `ops-backup`.
````

## XIII. Domain — Observability: Monitoring, Logs & Performance

Observability adalah mata dan telinga ECC-Ops: tanpa visibilitas yang andal, agent buta terhadap degradasi performa, disk yang nyaris penuh, sertifikat yang akan kedaluwarsa, atau backup yang diam-diam berhenti berjalan. Domain ini menyatukan tiga pilar yang saling melengkapi: **monitoring** (apa kondisi sistem sekarang dan apakah ada yang melewati ambang batas), **log management** (apa yang sudah terjadi dan mengapa), dan **performance** (apakah sistem berjalan secepat seharusnya dan di lapisan mana hambatannya). Sesuai Prinsip 2 (read-first), seluruh aktivitas diagnosa di domain ini bersifat read-only dan otomatis (tier READ); pemasangan cron monitoring, perubahan tuning, atau penyesuaian config termasuk tier WRITE yang membutuhkan konfirmasi dan menyiapkan rollback (Prinsip 3). ECC-Ops sengaja mengutamakan pendekatan **agentless** — health check dan alerting dibangun dari primitive yang sudah ada di setiap server Linux (cron, journald, curl, awk) — sehingga tidak menambah attack surface atau ketergantungan eksternal, selaras dengan Prinsip 5. Semua temuan dan ambang batas terbaca/tertulis ke Server Profile (Prinsip 6) agar agent mengingat baseline tiap host dan dapat mendeteksi anomali secara kontekstual.

### Skill: ops-monitoring

````markdown
---
name: ops-monitoring
description: Proactive health checks, resource metrics, and agentless alerting (cron-based) for managed servers.
version: 1.0
---

# Operations: Monitoring & Proactive Alerting

Monitoring answers one question continuously: *is this server healthy right now, and is anything trending toward failure?* ECC-Ops favors an **agentless** model — every check is built from tools already present on the host (cron, curl, awk, systemctl) — so no external collector or open port is required.

## When to Use

- Standing up baseline health monitoring on a freshly provisioned server.
- Running an on-demand health snapshot during a session (`/health-check`).
- Installing proactive, scheduled monitoring with alerting (`/monitor`).
- Investigating whether a symptom (slowness, errors) correlates with a resource threshold breach.

## Health Check Philosophy

A useful health check is **layered**: liveness (is the process up?), readiness (can it serve a request end-to-end, including its DB?), and resource headroom (CPU/RAM/disk/swap). Liveness without readiness is a trap — a PHP-FPM master can be up while every worker blocks on a dead database.

## Application Health Endpoints (per stack)

Expose a lightweight, unauthenticated-but-obscure health route that touches the database so readiness is verified, not just liveness.

### PHP / Laravel

```php
// routes/web.php — readiness probe that verifies the DB connection
Route::get('/_health', function () {
    try {
        DB::connection()->getPdo()->query('SELECT 1');
        return response()->json([
            'status' => 'ok',
            'time'   => now()->toIso8601String(),
        ], 200);
    } catch (\Throwable $e) {
        return response()->json([
            'status' => 'degraded',
            'error'  => 'database unreachable',
        ], 503);
    }
});
```

### Node / Express

```javascript
// health.js — readiness probe with a DB round-trip (pg example)
const express = require('express');
const router = express.Router();

router.get('/_health', async (req, res) => {
  try {
    await req.app.locals.db.query('SELECT 1'); // pool injected at boot
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: 'database unreachable' });
  }
});

module.exports = router;
```

### Python / Django

```python
# views.py — readiness probe verifying the default DB connection
from django.db import connections
from django.http import JsonResponse
from django.utils import timezone


def health(request):
    try:
        with connections['default'].cursor() as cur:
            cur.execute('SELECT 1')
        return JsonResponse({'status': 'ok', 'time': timezone.now().isoformat()})
    except Exception:
        return JsonResponse({'status': 'degraded', 'error': 'database unreachable'},
                            status=503)
```

## System Health Check Script

A single, dependency-free script that prints a full snapshot. Read-only (tier READ); safe to run any time and to schedule.

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-health-check.sh — agentless full health snapshot (READ-only)
set -uo pipefail
export LC_ALL=C

# --- Config (override via /etc/ecc-ops/health.conf) -------------------------
DISK_WARN=${DISK_WARN:-85}          # percent
SWAP_WARN=${SWAP_WARN:-50}          # percent of swap used
LOAD_PER_CORE_WARN=${LOAD_PER_CORE_WARN:-1.5}
SSL_WARN_DAYS=${SSL_WARN_DAYS:-14}
SERVICES=${SERVICES:-"nginx php8.3-fpm mysql"}
APP_URLS=${APP_URLS:-"https://example.com/_health"}
CONF=/etc/ecc-ops/health.conf
[ -r "$CONF" ] && . "$CONF"

bold() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()   { printf '  [OK]   %s\n' "$1"; }
warn() { printf '  [WARN] %s\n' "$1"; }
crit() { printf '  [CRIT] %s\n' "$1"; }

bold "Host & Uptime"
printf '  host=%s  kernel=%s\n' "$(hostname -f 2>/dev/null || hostname)" "$(uname -r)"
printf '  %s\n' "$(uptime -p 2>/dev/null || uptime)"

bold "Load Average"
CORES=$(nproc)
read -r L1 L5 L15 _ < /proc/loadavg
THRESH=$(awk -v c="$CORES" -v p="$LOAD_PER_CORE_WARN" 'BEGIN{printf "%.2f", c*p}')
printf '  cores=%s  load(1/5/15)=%s/%s/%s  warn>%s\n' "$CORES" "$L1" "$L5" "$L15" "$THRESH"
awk -v l="$L1" -v t="$THRESH" 'BEGIN{exit !(l>t)}' && warn "1m load above threshold" || ok "load within range"

bold "Memory & Swap"
free -h | awk 'NR==1||/Mem|Swap/'
SWAP_TOTAL=$(awk '/SwapTotal/{print $2}' /proc/meminfo)
SWAP_FREE=$(awk '/SwapFree/{print $2}'  /proc/meminfo)
if [ "${SWAP_TOTAL:-0}" -gt 0 ]; then
  SWAP_PCT=$(( (SWAP_TOTAL - SWAP_FREE) * 100 / SWAP_TOTAL ))
  [ "$SWAP_PCT" -ge "$SWAP_WARN" ] && warn "swap used ${SWAP_PCT}%" || ok "swap used ${SWAP_PCT}%"
fi

bold "Disk Usage"
df -hP -x tmpfs -x devtmpfs | awk 'NR==1{print "  "$0; next}{print "  "$0}'
df -P -x tmpfs -x devtmpfs | awk -v w="$DISK_WARN" 'NR>1{
  gsub(/%/,"",$5);
  if ($5+0 >= w) printf "  [WARN] %s at %s%%\n", $6, $5
}'

bold "Services"
for svc in $SERVICES; do
  if systemctl is-active --quiet "$svc"; then ok "$svc active"
  else crit "$svc NOT active"; fi
done

bold "Application Endpoints"
for url in $APP_URLS; do
  read -r CODE TIME < <(curl -ksS -o /dev/null \
    -w '%{http_code} %{time_total}\n' --max-time 10 "$url" || echo "000 0")
  if [ "$CODE" = "200" ]; then ok "$url -> ${CODE} in ${TIME}s"
  else crit "$url -> ${CODE} (time ${TIME}s)"; fi
done

bold "Errors (last 1h)"
ERRS=$(journalctl --since "1 hour ago" -p err --no-pager 2>/dev/null | wc -l)
[ "$ERRS" -gt 0 ] && warn "${ERRS} error-level journal lines in last hour" || ok "no error-level journal lines"

bold "SSL Expiry"
for url in $APP_URLS; do
  host=$(printf '%s' "$url" | awk -F[/:] '{print $4}')
  [ -z "$host" ] && continue
  END=$(echo | openssl s_client -servername "$host" -connect "${host}:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -z "$END" ] && { warn "$host: cannot read certificate"; continue; }
  EXP=$(date -d "$END" +%s 2>/dev/null); NOW=$(date +%s)
  DAYS=$(( (EXP - NOW) / 86400 ))
  [ "$DAYS" -lt "$SSL_WARN_DAYS" ] && warn "$host cert expires in ${DAYS}d" || ok "$host cert valid ${DAYS}d"
done

bold "Backups"
BK_DIR=${BK_DIR:-/var/backups/ecc-ops}
if [ -d "$BK_DIR" ]; then
  LAST=$(find "$BK_DIR" -type f -name '*.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1)
  if [ -n "$LAST" ]; then
    AGE_H=$(( ( $(date +%s) - ${LAST%% *} ) / 3600 ))
    [ "$AGE_H" -gt 26 ] && warn "last backup ${AGE_H}h old (${LAST#* })" \
                        || ok "last backup ${AGE_H}h old"
  else warn "no backup files found in $BK_DIR"; fi
else warn "backup dir $BK_DIR missing"; fi

bold "Security Posture"
if command -v ufw >/dev/null; then
  ufw status | head -1 | grep -qi active && ok "UFW active" || crit "UFW inactive"
fi
FAILED=$(journalctl _SYSTEMD_UNIT=ssh.service _SYSTEMD_UNIT=sshd.service --since "1 hour ago" \
         --no-pager 2>/dev/null | grep -ci 'failed password')
[ "$FAILED" -gt 20 ] && warn "${FAILED} failed SSH logins in last hour" \
                     || ok "${FAILED} failed SSH logins last hour"
if command -v fail2ban-client >/dev/null; then
  BANNED=$(fail2ban-client status sshd 2>/dev/null | awk -F: '/Currently banned/{gsub(/ /,"",$2);print $2}')
  ok "fail2ban sshd currently banned: ${BANNED:-0}"
fi

bold "Done"
date -Is
```

## Agentless Cron-Based Monitoring

No external agent — just cron plus the snapshot script. Two cadences: a fast liveness/threshold check that only speaks when something is wrong, and a daily digest that always reports.

```bash
# /etc/cron.d/ecc-ops-monitoring — installed by /monitor (tier WRITE)
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

# Every 5 min: run threshold watcher; it self-suppresses when all clear
*/5 *  * * *  root  /usr/local/bin/ecc-monitor-watch.sh >> /var/log/ecc-ops/monitor.log 2>&1

# Daily 07:00: full health digest pushed to the configured channel
0 7    * * *  root  /usr/local/bin/ecc-health-check.sh | /usr/local/bin/ecc-alert.sh digest "Daily health report $(hostname -f)"
```

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-monitor-watch.sh — threshold watcher; alerts only on breach
set -uo pipefail
. /etc/ecc-ops/health.conf 2>/dev/null || true
DISK_WARN=${DISK_WARN:-85}; LOAD_PER_CORE_WARN=${LOAD_PER_CORE_WARN:-1.5}
SERVICES=${SERVICES:-"nginx php8.3-fpm mysql"}
STATE=/var/lib/ecc-ops/alert-state   # for flap suppression
mkdir -p "$(dirname "$STATE")"; touch "$STATE"
ALERTS=()

# Disk space (the most common silent killer)
while read -r pct mnt; do
  [ "$pct" -ge "$DISK_WARN" ] && ALERTS+=("disk ${mnt} at ${pct}% (warn ${DISK_WARN}%)")
done < <(df -P -x tmpfs -x devtmpfs | awk 'NR>1{gsub(/%/,"",$5);print $5" "$6}')

# Services down
for svc in $SERVICES; do
  systemctl is-active --quiet "$svc" || ALERTS+=("service ${svc} is DOWN")
done

# Load per core
read -r L1 _ < /proc/loadavg
awk -v l="$L1" -v t="$(nproc)" -v p="$LOAD_PER_CORE_WARN" 'BEGIN{exit !(l > t*p)}' \
  && ALERTS+=("load ${L1} exceeds $(nproc)x${LOAD_PER_CORE_WARN}")

# Error spike in last 5 min
ESPIKE=$(journalctl --since "5 min ago" -p err --no-pager 2>/dev/null | wc -l)
[ "$ESPIKE" -gt 50 ] && ALERTS+=("error spike: ${ESPIKE} err lines in 5 min")

if [ "${#ALERTS[@]}" -gt 0 ]; then
  MSG=$(printf '%s\n' "${ALERTS[@]}")
  # de-dup: only alert if state changed since last run
  if ! cmp -s <(printf '%s' "$MSG") "$STATE"; then
    printf '%s' "$MSG" > "$STATE"
    printf '%s\n' "$MSG" | /usr/local/bin/ecc-alert.sh warn "ALERT $(hostname -f)"
  fi
else
  : > "$STATE"   # clear state -> next breach re-alerts (recovery)
fi
```

## Proactive Alerting Concept

`ecc-alert.sh` is a thin dispatcher: it never decides *what* is wrong (the watcher does), only *where to send it*. It fans out to whichever channels are configured, degrading gracefully (always log to disk even if email/webhook fail). This keeps alerting **idempotent** (Prinsip 4) and auditable (Prinsip 7).

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-alert.sh <level> <subject> — reads body from stdin, fans out
set -uo pipefail
LEVEL="${1:-info}"; SUBJECT="${2:-ECC-Ops alert}"; BODY="$(cat)"
. /etc/ecc-ops/alert.conf 2>/dev/null || true   # ALERT_EMAIL, ALERT_WEBHOOK

TS=$(date -Is)
# 1) Always persist to the local logger (never lost)
printf '%s [%s] %s\n%s\n' "$TS" "$LEVEL" "$SUBJECT" "$BODY" \
  >> /var/log/ecc-ops/alerts.log
logger -t ecc-ops -p "daemon.${LEVEL}" "$SUBJECT"

# 2) Email channel (best effort)
if [ -n "${ALERT_EMAIL:-}" ] && command -v mail >/dev/null; then
  printf '%s\n' "$BODY" | mail -s "[ECC-Ops][$LEVEL] $SUBJECT" "$ALERT_EMAIL" || true
fi

# 3) Webhook channel (Slack/Discord/generic; best effort)
if [ -n "${ALERT_WEBHOOK:-}" ]; then
  # JSON-escape so quotes/newlines/control chars in $BODY can't produce invalid JSON
  if command -v jq >/dev/null; then
    payload=$(jq -n --arg t "*[ECC-Ops][$LEVEL]* $SUBJECT" --arg b "$BODY" '{text: ($t + "\n" + $b)}')
  else
    esc=$(printf '%s' "$BODY" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN{ORS="\\n"}{print}')
    payload=$(printf '{"text":"*[ECC-Ops][%s]* %s\\n%s"}' "$LEVEL" "$SUBJECT" "$esc")
  fi
  curl -sS -m 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK" >/dev/null || true
fi
```

Escalation tiers map cleanly to severity: `info`/`digest` -> logger only; `warn` -> logger + email/webhook; `crit` (service down, disk full) -> all channels, no flap suppression. Thresholds and channel config live in `/etc/ecc-ops/` and are mirrored into the Server Profile so the agent recalls each host's baseline.

## Related

- `ops-log-management` — where the errors this skill counts actually live.
- `ops-performance` — when a threshold breach is sustained, profile the bottleneck.
- `ops-ssl` — owns certificate issuance/renewal; monitoring only watches expiry.
- `ops-backup` — owns backup runs; monitoring only watches freshness.
- `ops-incident-response` — consumes `crit` alerts as incident triggers.
````

### Skill: ops-log-management

````markdown
---
name: ops-log-management
description: Log rotation, journald, log locations, and diagnostic queries across the stack.
version: 1.0
---

# Operations: Log Management

Logs are the system's memory. This skill keeps them **bounded** (rotation so they never fill the disk), **findable** (a map of where every component writes), and **queryable** (diagnostic one-liners that turn megabytes of noise into the three lines that matter).

## When to Use

- Configuring rotation for a newly deployed app so logs don't fill the disk.
- Hunting the root cause of an incident across multiple log sources (`/logs`, `/troubleshoot`).
- Auditing what is being logged and whether retention is sane.

## logrotate Config (per app)

Each app gets its own rotation policy. Rotate daily, keep 14 generations, compress (delayed by one cycle so the freshest archive stays readable), and reload the web server after rotation so it reopens file handles.

```ini
# /etc/logrotate.d/ecc-app-example
/var/www/example/storage/logs/*.log
/var/log/nginx/example.access.log
/var/log/nginx/example.error.log
{
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    dateext
    dateformat -%Y%m%d
    su www-data www-data
    create 0640 www-data adm
    sharedscripts
    postrotate
        # Reload nginx so it reopens log file handles (no dropped connections)
        [ -f /run/nginx.pid ] && nginx -s reopen 2>/dev/null || systemctl reload nginx >/dev/null 2>&1 || true
    endscript
}
```

> `copytruncate` is used for app logs whose process won't reopen handles on signal; for nginx, `nginx -s reopen` is the clean path and `copytruncate` is the safety net. Validate with `logrotate -d /etc/logrotate.d/ecc-app-example` (dry run, READ-only).

## Log Locations Map

| Component | Path | What to look for |
|---|---|---|
| Linux journal | `journalctl` (binary, journald) | Service crashes, OOM kills, unit failures |
| Auth / SSH | `/var/log/auth.log` (Deb), `/var/log/secure` (RHEL) | Failed logins, sudo use, intrusion attempts |
| Nginx access | `/var/log/nginx/*.access.log` | Traffic patterns, 4xx/5xx, slow upstreams |
| Nginx error | `/var/log/nginx/*.error.log` | 502/504 causes, upstream timeouts, config errors |
| PHP-FPM | `/var/log/php8.3-fpm.log` + pool `slowlog` | Worker exhaustion, slow requests, fatal errors |
| Laravel | `storage/logs/laravel.log` | App exceptions, stack traces |
| Node (systemd) | `journalctl -u <app>` | Uncaught exceptions, restart loops |
| Python/Gunicorn | `journalctl -u <app>` or app log | Worker timeouts, 500s, tracebacks |
| MySQL error | `/var/log/mysql/error.log` | Crashes, InnoDB issues, aborted connections |
| MySQL slow | `/var/log/mysql/slow.log` | Queries above `long_query_time` |
| PostgreSQL | `/var/log/postgresql/postgresql-16-main.log` | Slow queries, deadlocks, checkpoint spam |
| Kernel | `dmesg`, `journalctl -k` | OOM, disk/IO errors, hardware faults |
| Cron | `journalctl -u cron` / `/var/log/syslog` | Missed/failed scheduled jobs |
| fail2ban | `/var/log/fail2ban.log` | Bans, ignored hosts, jail activity |
| ECC-Ops audit | `/var/log/ecc-ops/audit.log` | Every change the agent made (who/what/when/why) |

## Diagnostic Queries

All read-only (tier READ). Start broad, then narrow.

```bash
# Correlate several units on one timeline (priority warning+) for the last 30 min
journalctl -u nginx -u php8.3-fpm -u mysql -p warning --since "30 min ago" --no-pager

# All error-level entries in the last hour, newest last
journalctl --since "1 hour ago" -p err --no-pager

# Top 10 client IPs hitting an app (spot abuse / a hammering bot)
awk '{print $1}' /var/log/nginx/example.access.log | sort | uniq -c | sort -rn | head

# Top 10 URLs returning 404 (broken links, missing assets, scanners)
awk '$9=="404"{print $7}' /var/log/nginx/example.access.log | sort | uniq -c | sort -rn | head

# Count responses by status code (quick error-rate read)
awk '{print $9}' /var/log/nginx/example.access.log | sort | uniq -c | sort -rn

# PHP-FPM slow requests (requires slowlog enabled in the pool)
grep -A20 'script_filename' /var/log/php8.3-fpm-slow.log | tail -60

# MySQL slow query summary, sorted by total time (most expensive first)
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log

# Follow a live tail of correlated errors during an incident
journalctl -u nginx -u php8.3-fpm -p err -f
```

## Related

- `ops-monitoring` — counts these errors and alerts on spikes.
- `ops-performance` — slowlog/slow-query output feeds tuning decisions.
- `ops-intrusion-detection` — consumes auth.log / fail2ban.log for attack analysis.
- `ops-incident-response` — uses these queries to build the incident timeline.
````

### Skill: ops-performance

````markdown
---
name: ops-performance
description: Performance analysis and tuning across web server, runtime, and database layers.
version: 1.0
---

# Operations: Performance Analysis & Tuning

Performance work follows one rule: **measure, change one thing, measure again.** Guessing wastes capacity and hides the real bottleneck. This skill provides fast diagnostics to locate the constrained layer, then per-layer tuning levers with the reasoning behind each.

## When to Use

- A service is slow but up (latency, not outage).
- After a traffic increase, to right-size workers and buffers.
- Capacity planning before a launch (`/perf-tune`).

## Quick Diagnostics (locate the bottleneck)

```bash
# Live overview: CPU/mem/load + per-process; press M (mem) or P (cpu) to sort
top -b -n1 | head -20

# Memory headroom and swap pressure (swap in use under load = RAM bound)
free -h

# Per-device I/O: %util near 100 = disk bound; await high = slow storage
iostat -xz 1 3

# Top memory consumers
ps -eo pid,comm,%mem,rss --sort=-%mem | head -10

# Top CPU consumers
ps -eo pid,comm,%cpu,time --sort=-%cpu | head -10

# Listening sockets + connection counts (find the busy port)
ss -s; ss -tlnp

# What's holding a file / port (e.g. who has the log open, who binds :80)
lsof -i :80; lsof -nP +L1 | head   # +L1: open-but-deleted files eating disk
```

Interpretation: high load + low CPU% usually means I/O wait (check `iostat`); high CPU% on the runtime means application/CPU-bound work; growing swap means RAM-bound — fix that first, since swapping makes everything slow.

## PHP-FPM Tuning

Pool sizing is the single biggest PHP lever. Size `pm.max_children` to RAM, not optimism: `max_children = (RAM_for_PHP) / (avg process RSS)`.

```ini
; /etc/php/8.3/fpm/pool.d/example.conf
[example]
user = www-data
group = www-data
listen = /run/php/example.sock
listen.owner = www-data
listen.group = www-data

pm = dynamic
pm.max_children = 24          ; e.g. 3GB for PHP / ~128MB per worker
pm.start_servers = 6
pm.min_spare_servers = 4
pm.max_spare_servers = 10
pm.max_requests = 500         ; recycle workers to bound memory leaks

; Surface slow requests for ops-log-management to analyze
request_slowlog_timeout = 5s
slowlog = /var/log/php8.3-fpm-slow.log
```

```ini
; /etc/php/8.3/mods-available/opcache.ini — production opcache
opcache.enable=1
opcache.memory_consumption=256
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=20000
opcache.validate_timestamps=0   ; deploy must clear opcache (reload fpm); huge win
opcache.jit=tracing
opcache.jit_buffer_size=128M
```

## Nginx Tuning

```nginx
# /etc/nginx/conf.d/performance.conf
# Buffers sized to avoid spilling proxied responses to disk
proxy_buffering on;
proxy_buffer_size 8k;
proxy_buffers 16 8k;
proxy_busy_buffers_size 16k;
client_body_buffer_size 16k;
client_max_body_size 32m;

# Compression for text payloads (skip already-compressed binaries)
gzip on;
gzip_vary on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript
           application/xml text/xml image/svg+xml font/woff2;

# Long-cache immutable static assets at the edge of the box
location ~* \.(?:css|js|woff2|jpg|jpeg|png|gif|svg|ico)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    access_log off;
    try_files $uri =404;
}
```

## MySQL Tuning Guidelines

The dominant lever on a dedicated DB host is the InnoDB buffer pool — it should hold the working set. Validate with `SHOW ENGINE INNODB STATUS` and the slow log before/after.

| Parameter | Formula / guideline | Why |
|---|---|---|
| `innodb_buffer_pool_size` | 60–70% of RAM (dedicated host) | Keeps hot data/index pages in memory |
| `innodb_buffer_pool_instances` | 1 per GB of pool, cap ~8 | Reduces internal contention |
| `innodb_log_file_size` | ~25% of buffer pool | Fewer checkpoint flushes |
| `innodb_flush_log_at_trx_commit` | 1 (safe) / 2 (faster, risk 1s) | Durability vs throughput trade |
| `innodb_flush_method` | `O_DIRECT` | Avoid double-buffering with OS cache |
| `max_connections` | peak concurrent + headroom | Too high wastes RAM per conn |
| `tmp_table_size`/`max_heap_table_size` | equal, e.g. 64M | Avoid on-disk temp tables |
| `long_query_time` | 1s (then tune down) | Feed the slow log |
| `slow_query_log` | ON | Enables `mysqldumpslow` analysis |

```ini
; /etc/mysql/mysql.conf.d/zz-ecc-tuning.cnf (example for ~16GB dedicated host)
[mysqld]
innodb_buffer_pool_size = 10G
innodb_buffer_pool_instances = 8
innodb_log_file_size = 2G
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
max_connections = 200
tmp_table_size = 64M
max_heap_table_size = 64M
slow_query_log = 1
long_query_time = 1
slow_query_log_file = /var/log/mysql/slow.log
```

## Node — PM2 Cluster

Run one worker per core to use all CPUs; PM2 load-balances across them and restarts on crash.

```javascript
// ecosystem.config.js — cluster across all cores with memory guardrails
module.exports = {
  apps: [{
    name: 'example',
    script: './server.js',
    instances: 'max',          // one per CPU core
    exec_mode: 'cluster',
    max_memory_restart: '512M',// restart a worker if it leaks past 512MB
    env: { NODE_ENV: 'production', PORT: 3000 },
  }],
};
```

```bash
pm2 start ecosystem.config.js   # WRITE: starts/loads the cluster
pm2 save                        # persist process list across reboot
pm2 monit                       # live per-worker CPU/mem (READ)
```

## Related

- `ops-monitoring` — sustained threshold breaches trigger a tuning session.
- `ops-log-management` — slowlog/slow-query data is the input to tuning.
- `ops-runtime-php` / `ops-runtime-node` — runtime-specific deploy & pool details.
- `ops-database` — schema/index changes that may outrank server tuning.
````

### Subagent: ops-troubleshooter

````markdown
---
name: ops-troubleshooter
description: Use PROACTIVELY whenever a service is down, slow, throwing errors, or behaving unexpectedly. Performs systematic read-only root-cause analysis across logs, metrics, and config before proposing any fix.
tools: ["Read", "Bash"]
model: opus
---

# Ops Troubleshooter

You are a methodical incident diagnostician. Your job is to find the *root cause*, not to make the symptom disappear. You operate read-only (tier READ); you never restart, edit, or install anything yourself — you diagnose, then hand a ranked, rollback-aware fix proposal back to the orchestrator for confirmation.

## Diagnostic Flow (decision tree)

Classify the symptom first, then follow the matching branch. Always read the Server Profile up front to know the expected stack, services, and baselines.

```
SYMPTOM?
│
├─ DOWN (connection refused / 5xx on every request)
│   ├─ Is the service process alive?      systemctl status <svc>; ss -tlnp
│   │   ├─ no  -> why did it die?          journalctl -u <svc> -n100; check OOM (dmesg | grep -i kill)
│   │   └─ yes -> is it listening?         is the port bound / socket present?
│   ├─ Upstream reachable from web tier?   curl to fpm/app socket; nginx error.log (502/504)
│   └─ Dependency down?                    DB/redis reachable? disk full (df -h)? cert expired?
│
├─ SLOW (up, but high latency)
│   ├─ Which layer?                        time curl _health; compare web vs app vs DB time
│   ├─ Resource bound?                     load/iostat/free -> CPU vs I/O vs RAM/swap
│   ├─ Runtime saturated?                  FPM busy children / PM2 queue / gunicorn workers
│   └─ DB bound?                           slow log; SHOW PROCESSLIST; missing index?
│
├─ ERRORS (intermittent 5xx / exceptions)
│   ├─ What & when?                        journalctl -p err --since; app log stack traces
│   ├─ Correlate to a deploy/change?       check ECC-Ops audit log around the spike
│   └─ Pattern?                            one endpoint? one upstream? one client IP?
│
└─ UNEXPECTED (wrong output / regressions)
    ├─ Config drift?                       diff running config vs profile/expected
    ├─ Recent change?                      audit log: what changed, when, by whom
    └─ Cache/stale state?                  opcache not cleared? stale CDN? old symlink?
```

## Method

1. **Reproduce / confirm the symptom** with a read-only probe (curl `_health`, a single query) before touching logs — anchor what "broken" means.
2. **Gather evidence from multiple sources** for the same time window: journald, app logs, nginx error log, resource metrics, and the ECC-Ops audit log. One source lies; three agree.
3. **Correlate across sources.** A 502 in nginx + "max_children reached" in FPM log + rising load is *one* story (saturation), not three problems. Always line up timestamps.
4. **Form a ranked hypothesis** (most-likely root cause first) with the evidence that supports each.
5. **Propose the fix to the orchestrator** — the action, its tier, its blast radius, and the rollback. Do not execute it.

## Key Principles

- **Never restart as the first action.** A restart erases the evidence and often just resets a timer until the real cause recurs. Diagnose first; restart, if needed, is a *proposed fix*, not a reflex.
- **Read-first, always** (Prinsip 2): every command you run is non-mutating.
- **Correlate, don't guess:** require agreement from independent sources before naming a root cause.
- **Check the audit log early:** most "mysterious" breakage follows a recent change.
- **Report what you inspected**, including dead ends — the orchestrator and the human need your trail, not just your verdict.

**Remember**: the goal is the root cause, not a quiet symptom — a restart that hides the problem is a failure, not a fix.
````

### Subagent: performance-tuner

````markdown
---
name: performance-tuner
description: Use PROACTIVELY when a service is slow but healthy, after traffic growth, or before a launch. Profiles resources, isolates the bottleneck layer, and proposes tuning changes with expected impact — never applies them without confirmation.
tools: ["Read", "Bash"]
model: sonnet
---

# Performance Tuner

You make systems faster by evidence, not folklore. You profile, locate the single constrained layer, and propose the smallest change with the biggest impact — always with a before/after measurement plan. You operate read-only; applying any config change is a tier-WRITE action the orchestrator confirms.

## Method

1. **Establish a baseline.** Capture current numbers before proposing anything: response time (`time curl _health`), load/iostat/free, FPM/PM2/worker utilization, DB slow-query summary. Record them — they are your "before."
2. **Locate the bottleneck layer** (web / runtime / database). Only one layer is the constraint at a time; do not tune three at once.
   - Web (nginx): connection limits, buffering spilling to disk, no gzip/static caching.
   - Runtime (PHP-FPM / PM2 / gunicorn): too few or too many workers, no opcache, leaks forcing restarts.
   - Database: undersized buffer pool, missing indexes, on-disk temp tables, slow queries.
3. **Recommend with expected impact.** For each proposed change, state the lever, the new value, *why*, and the expected effect (e.g. "raise `innodb_buffer_pool_size` 4G->10G: working set fits in RAM, expect slow-query count to drop sharply").
4. **Order by impact / risk.** Lead with high-impact, low-risk, reversible changes (opcache, buffer pool, gzip) before invasive ones (schema/index changes, kernel tuning).
5. **Hand off for confirmation.** Present changes with tier, blast radius, and rollback (saved config copy). Do not apply.

## Output Shape

A short report: baseline numbers, identified bottleneck layer with evidence, ranked recommendations (lever / change / expected impact / risk / rollback), and the exact metric to re-measure after applying.

## Key Principles

- **One layer at a time:** tuning everything at once makes the effective change unknowable.
- **Right-size, don't max-size:** more workers than RAM allows causes swapping — slower, not faster.
- **Reversible first:** prefer changes with a trivial rollback.
- **Never apply without confirmation** (Prinsip 8); always stage a rollback (Prinsip 3).

**Remember**: ukur sebelum & sesudah — a change without a before/after measurement is a guess, not tuning.
````

### Subagent: monitoring-sentinel

````markdown
---
name: monitoring-sentinel
description: Use PROACTIVELY to stand up and run continuous health monitoring. Installs agentless cron health checks, watches thresholds, classifies and escalates breaches, and reports concise periodic summaries.
tools: ["Read", "Bash"]
model: haiku
---

# Monitoring Sentinel

You are the server's always-on watch. You install lightweight, agentless monitoring (cron + the ECC-Ops health scripts), then keep an eye on thresholds, classify what you see, and escalate only what matters. You are not noisy: all-clear is silence, breaches are concise and actionable.

## Responsibilities

1. **Install monitoring (tier WRITE).** Deploy `ecc-health-check.sh`, `ecc-monitor-watch.sh`, and `ecc-alert.sh`; lay down `/etc/cron.d/ecc-ops-monitoring` (5-min watcher + daily digest); seed thresholds and channels in `/etc/ecc-ops/`. Confirm before writing; record in the audit log.
2. **Watch thresholds** against each host's baseline from the Server Profile:

   | Signal | Default threshold | Severity |
   |---|---|---|
   | Disk usage | > 85% | warn / crit at > 95% |
   | RAM / swap | swap in active use, RAM headroom < 10% | warn |
   | Load average | > cores x 1.5 sustained | warn |
   | SSL expiry | < 14h... days | warn / crit at < 3 days |
   | Backup freshness | last success > 26h ago | warn / crit at > 48h |
   | Error spike | > 50 err-lines / 5 min | warn |
   | Service state | any monitored unit not active | crit |

3. **Classify & escalate.** Map severity to channels: `info`/`digest` -> logger only; `warn` -> logger + email/webhook; `crit` -> all channels immediately, no flap suppression. De-duplicate repeated identical alerts; re-alert on recovery-then-recurrence.
4. **Report periodically.** Emit a concise daily digest (overall status + any active warnings) and an immediate line on any new breach. Keep it short — status, signal, value vs threshold, suggested next step.

## Key Principles

- **Agentless by default:** build on cron/journald/curl; add no external collector or open port (Prinsip 5).
- **Baseline-aware:** thresholds come from the Server Profile, not hard-coded guesses (Prinsip 6).
- **Signal over noise:** suppress flapping, stay silent when healthy, escalate sharply on real breaches.
- **Idempotent install:** re-running setup must not duplicate cron entries or scripts (Prinsip 4).
- **Hand off, don't fix:** on a breach, alert and (for outages) trigger `ops-troubleshooter` / incident flow — sentinel watches, it does not remediate.

**Remember**: silence means healthy and proven, never unobserved — a monitor that isn't installed and verified is worse than none.
````

### Commands

````markdown
---
description: Run a full read-only health snapshot of a server (resources, services, endpoints, SSL, backup, security).
---

# /health-check

On-demand, read-only (tier READ) health snapshot. Safe to run any time.

## Steps

1. Load the Server Profile for the target host (expected services, app URLs, thresholds).
2. Run `ecc-health-check.sh` (or its inline equivalent) covering: uptime/load, RAM/swap, disk, monitored services, application `_health` endpoints (HTTP code + response time), error-level journal lines in the last hour, SSL expiry, last backup age, and security posture (UFW, failed SSH, fail2ban bans).
3. Summarize as OK / WARN / CRIT per category; surface every WARN/CRIT first.
4. Update the Server Profile with the latest snapshot (resource baselines, SSL expiry, last-backup age).

Delegates to: **monitoring-sentinel** for the snapshot logic. No writes; nothing to roll back.
````

````markdown
---
description: Install proactive agentless monitoring (cron health checks, threshold watcher, alerting) on a server.
---

# /monitor

Stands up continuous monitoring. Installing scripts and cron is tier WRITE (confirm, then audit-log; rollback = remove the cron file and scripts).

## Steps

1. Detect/confirm monitored services, app URLs, and sensible thresholds (disk 85%, load per-core 1.5, SSL 14d, backup 26h) from the Server Profile.
2. Confirm intended changes and impact, then install: `ecc-health-check.sh`, `ecc-monitor-watch.sh`, `ecc-alert.sh`, `/etc/ecc-ops/health.conf` + `alert.conf`, and `/etc/cron.d/ecc-ops-monitoring` (5-min watcher + daily 07:00 digest).
3. Configure alert channels (logger always; email/webhook if provided).
4. Verify: run the watcher once by hand, confirm cron is registered, send a test `info` alert (Prinsip — ops-verify).
5. Record the install in the audit log and update the Server Profile (monitoring config).

Delegates to: **monitoring-sentinel**. Idempotent — re-running must not duplicate cron entries.
````

````markdown
---
description: Systematically diagnose a server problem (down, slow, errors, or unexpected behavior) read-only and propose a fix.
---

# /troubleshoot

Read-only (tier READ) root-cause analysis. Proposes a fix; never applies one unattended.

## Steps

1. Classify the symptom: DOWN / SLOW / ERRORS / UNEXPECTED.
2. Read the Server Profile (expected stack, services, baselines) and the recent audit log (recent changes are prime suspects).
3. Follow the matching diagnostic branch, gathering evidence from multiple sources (journald, app logs, nginx error log, resource metrics) for the same time window.
4. Correlate timestamps across sources to name the single root cause.
5. Present a ranked diagnosis and a rollback-aware fix proposal (action, tier, blast radius, rollback) for confirmation.

Delegates to: **ops-troubleshooter**. Never restarts as a first action; reports everything inspected, including dead ends.
````

````markdown
---
description: Profile a slow-but-healthy server, isolate the bottleneck layer, and propose tuning changes with expected impact.
---

# /perf-tune

Profiling is read-only; applying tuning is tier WRITE (confirm + saved-config rollback).

## Steps

1. Capture a baseline (response time, load/iostat/free, runtime worker utilization, DB slow-query summary). Record the "before."
2. Locate the constrained layer — web (nginx), runtime (PHP-FPM/PM2/gunicorn), or database — using `ops-performance` diagnostics.
3. Produce ranked recommendations: lever, proposed value, rationale, expected impact, risk, and rollback. Lead with reversible high-impact changes.
4. On confirmation, apply one change, then re-measure the same metric (before/after) to prove the effect; update the Server Profile.

Delegates to: **performance-tuner**. One layer at a time; measure before and after; never max-size beyond available RAM.
````

````markdown
---
description: Locate, query, and correlate logs across the stack to investigate behavior or an incident.
---

# /logs

Read-only (tier READ) log investigation and correlation.

## Steps

1. Identify the relevant components and their log locations (use the `ops-log-management` location map).
2. Run targeted diagnostic queries: multi-unit `journalctl` on a shared timeline, error-level lines in the last hour, top client IPs, top 404s, status-code distribution, PHP-FPM slowlog, and MySQL `mysqldumpslow`.
3. Correlate findings across sources by timestamp to build a coherent timeline.
4. Summarize the signal (the lines that matter) and, if a fault is found, hand off to `/troubleshoot` or the incident flow.

Delegates to: **ops-troubleshooter** (for correlation during an active fault). Pure investigation; no writes.
````

## XIV. Domain — Maintenance & Incident Response

Domain ini menutup siklus operasi ECC-Ops dengan dua hal yang menjaga server tetap sehat dalam jangka panjang: **maintenance rutin** (menjaga OS, paket, runtime, dan dependensi tetap mutakhir dengan aman) dan **kesiapan operasional** (memastikan semua kontrol pelindung — backup, SSL renewal, fail2ban, firewall, security updates — benar-benar hidup dan segar, bukan sekadar terpasang). Fokus utama di sini adalah maintenance yang aman dan idempoten: update tidak pernah dijalankan membabi buta, melainkan selalu didahului audit read-first (Prinsip 2), titik mundur (Prinsip 3), dan verifikasi pasca-perubahan (rule `ops-verify`).

Penanganan incident teknis tingkat dalam — prosedur compromise, outage, dan data breach — sudah dijabarkan tuntas di **Section XII (Domain — Security & Hardening)** lewat skill `ops-incident-response` dan subagent `incident-responder`. Di section ini kita tidak mengulanginya; `/incident` hanya dirujuk kembali ke XII, sementara dua command baru diperkenalkan: `/update` (update terpandu dengan backup dan verifikasi) dan `/ops-doctor` (pemeriksaan kesiapan ops menyeluruh dengan output checklist berstatus). Update dan ops-doctor adalah aktivitas WRITE/READ berkala yang idealnya dijalankan dalam maintenance window terjadwal, dan setiap perubahan tercatat di audit trail (Prinsip 7).

### Skill: ops-update-patch

````markdown
---
name: ops-update-patch
description: Safely update OS packages, runtimes, and dependencies with pre-update backup, reboot detection, post-update health verification, and rollback readiness across Debian/Ubuntu (apt) and RHEL/Rocky/Alma (dnf).
version: 1.0
---

# OS, Package & Runtime Updates

Updates are a WRITE-tier operation (single confirmation + impact + rollback) and major
version jumps are effectively DESTRUCTIVE-adjacent (require a fresh backup first). Never
run blind updates on a production host. Always: audit (read-first) -> snapshot/backup ->
apply -> detect reboot-required -> verify services & app health -> record to audit trail.

## When to Use

- Routine security patching or scheduled OS/package updates.
- Upgrading a language runtime in place (e.g. PHP 8.3 -> 8.4, Node 20 -> 22).
- Configuring automatic security updates (unattended-upgrades / dnf-automatic).
- Planning and executing a maintenance window.

## Step 0 — Read-First Audit (always safe)

Inventory what would change *before* touching anything.

```bash
# Debian / Ubuntu
sudo apt-get update -qq
apt list --upgradable 2>/dev/null          # full list of upgradable packages
apt-get -s dist-upgrade                     # dry-run simulation, no changes

# Count security-only updates
apt-get -s dist-upgrade | grep -ci '^Inst.*security' || true

# RHEL / Rocky / Alma
sudo dnf check-update || true               # exit 100 = updates available
dnf updateinfo list security                # security advisories only
```

Capture the current state for rollback reference (Principle 3 — Rollback-ready):

```bash
# Snapshot installed package versions before the change
dpkg -l > "/var/backups/ecc-ops/pkglist-$(date +%F-%H%M).txt"   # apt
rpm -qa | sort > "/var/backups/ecc-ops/pkglist-$(date +%F-%H%M).txt"  # dnf

# Record currently held/pinned packages so we don't fight them
apt-mark showhold
```

## Step 1 — Backup Before Large Updates

Before a dist-upgrade, kernel update, or runtime major bump, ensure a fresh backup exists
(delegate to `ops-backup`). For DB-bearing hosts this is mandatory.

```bash
# Verify a recent backup exists (fresh < 24h); trigger one if stale.
LATEST=$(ls -t /var/backups/ecc-ops/db/*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ] || [ "$(find "$LATEST" -mtime +1 2>/dev/null)" ]; then
  echo "No fresh backup -> running pre-update backup"
  /usr/local/sbin/ecc-backup-now   # provided by ops-backup
fi
```

## Step 2 — Apply Updates

Prefer security-only patches for unattended/routine runs; full upgrade inside a window.

```bash
# Debian/Ubuntu — security + recommended only, non-interactive, keep existing configs
sudo DEBIAN_FRONTEND=noninteractive apt-get \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  dist-upgrade -y

sudo apt-get autoremove --purge -y
sudo apt-get clean
```

```bash
# RHEL/Rocky/Alma
sudo dnf upgrade --security -y     # security only
# or full: sudo dnf upgrade -y
sudo dnf autoremove -y
```

## Step 3 — Detect Reboot-Required

A kernel, glibc, systemd, or openssl update usually needs a reboot or a service restart.
Never auto-reboot a production box — surface it and let the operator schedule it.

```bash
# Debian/Ubuntu
if [ -f /var/run/reboot-required ]; then
  echo "REBOOT REQUIRED:"; cat /var/run/reboot-required.pkgs 2>/dev/null
fi

# RHEL/Rocky/Alma
sudo dnf needs-restarting -r; echo "exit=$?"   # exit 1 => reboot recommended
needs-restarting -s                            # services using stale libs

# Cross-distro: which running processes use deleted (upgraded) libs?
sudo lsof -nP 2>/dev/null | grep -i '(deleted)' | awk '{print $1,$2}' | sort -u
```

If only services hold stale libraries, restart them targeted (WRITE-tier) instead of a
full reboot:

```bash
sudo systemctl restart php8.3-fpm nginx   # example; only the affected units
```

## Step 4 — Verify (rule: ops-verify)

```bash
# All enabled units are active?
systemctl --failed --no-legend            # must be empty
systemctl is-system-running               # 'running' (or 'degraded' -> inspect)

# Per-app HTTP health (adapt to Server Profile app list)
curl -fsS -o /dev/null -w '%{http_code}\n' https://example.com/health

# Runtime sanity
php -v ; nginx -t ; node -v 2>/dev/null
```

If anything is degraded, roll back using the package snapshot from Step 0 (downgrade the
offending package) or restore from the Step 1 backup, then re-verify.

## Runtime Major Upgrade — PHP 8.3 -> 8.4 (side-by-side)

Never remove the old runtime until the new one is proven. Install side-by-side, switch the
Nginx upstream socket, verify, then retire the old version (Principle 4 — Idempotent,
Principle 3 — Rollback-ready).

```bash
# 1) Install 8.4 alongside 8.3 (Ondrej PPA on Ubuntu / Sury on Debian)
sudo add-apt-repository -y ppa:ondrej/php
sudo apt-get update -qq
sudo apt-get install -y php8.4-fpm php8.4-cli \
  php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-gd php8.4-bcmath

# 2) Recreate the app's FPM pool config for 8.4 (mirror the 8.3 pool)
sudo cp /etc/php/8.3/fpm/pool.d/app.conf /etc/php/8.4/fpm/pool.d/app.conf
# adjust the listen socket inside to /run/php/php8.4-fpm-app.sock
sudo systemctl enable --now php8.4-fpm
```

```bash
# 3) Validate the app under 8.4 BEFORE flipping traffic
sudo -u www-data php8.4 /var/www/app/artisan about     # Laravel example
php8.4 -m | grep -E 'opcache|mysqli'                   # required extensions present
```

```nginx
# 4) Point Nginx at the 8.4 socket (config change = WRITE; keep a copy of the old file)
location ~ \.php$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php8.4-fpm-app.sock;   # was php8.3-fpm-app.sock
}
```

```bash
# 5) Test + reload, then verify end-to-end
sudo nginx -t && sudo systemctl reload nginx
curl -fsS -o /dev/null -w '%{http_code}\n' https://example.com/
php -v   # confirm CLI default if you switched it: sudo update-alternatives --config php

# 6) ONLY after the app is stable for the agreed bake-in period: retire 8.3
sudo systemctl disable --now php8.3-fpm
sudo apt-get purge -y 'php8.3-*' && sudo apt-get autoremove --purge -y
```

Rollback (within bake-in): revert the Nginx `fastcgi_pass` to the 8.3 socket, `nginx -t`,
reload — 8.3 is still installed and running, so traffic returns instantly.

## Automatic Security Updates

Enable unattended security patching, but constrain it to *security* origins, exclude
risky packages, and never auto-reboot in business hours.

```bash
# Debian/Ubuntu
sudo apt-get install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades
```

```ini
# /etc/apt/apt.conf.d/50unattended-upgrades  (verify Allowed-Origins carefully)
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
    "mysql-server";
    "mariadb-server";
    "nginx";
    "php8.*";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
Unattended-Upgrade::Mail "ops@example.com";
Unattended-Upgrade::MailReport "on-change";
```

```ini
# /etc/apt/apt.conf.d/20auto-upgrades  (enable the timers)
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
```

Verify the configuration is actually effective (don't trust the file alone):

```bash
# Dry-run shows exactly which origins/packages would be acted on
sudo unattended-upgrades --dry-run --debug 2>&1 | grep -E 'Allowed origins|Packages that'
systemctl status apt-daily-upgrade.timer --no-pager   # timer enabled & next run
```

```bash
# RHEL/Rocky/Alma equivalent
sudo dnf install -y dnf-automatic
sudo sed -i 's/^upgrade_type.*/upgrade_type = security/' /etc/dnf/automatic.conf
sudo sed -i 's/^apply_updates.*/apply_updates = yes/'   /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
systemctl list-timers dnf-automatic.timer --no-pager
```

## Maintenance Window & Communication

| Phase | Action |
| --- | --- |
| T-24h | Announce window (channel/email/status page); confirm fresh backup planned |
| T-1h  | Run Step 0 audit; freeze deploys; verify rollback artifacts exist |
| T-0   | Enter window: backup -> apply -> reboot if required -> verify |
| T+0   | Smoke-test every app in Server Profile (HTTP health, login path, DB connectivity) |
| Post  | Close window, post status, write audit entry (who/what/when/why + rollback ref) |

Guidelines:
- Schedule low-traffic hours; keep the window short and reversible.
- One change-class per window where possible (kernel vs. runtime vs. DB) to isolate blame.
- Enable a maintenance page only for DESTRUCTIVE-adjacent work (DB major upgrade, reboot).
- Record start/end and outcome to the audit trail (Principle 7); update the Server Profile
  (OS/runtime versions, last-update timestamp).

## Related

- `ops-backup` — pre-update backup and restore-based rollback.
- `ops-server-core` — base packages, kernel, systemd, reboot handling.
- `ops-runtime-php` / `ops-runtime-node` / `ops-runtime-python` — runtime-specific upgrade detail.
- `ops-monitoring` — post-update health watch and regression alerting.
- `ops-incident-response` — escalation path if an update causes an outage (see Section XII).
````

### Commands

````markdown
---
description: Guided, safe update of OS packages and runtimes with pre-update backup, reboot detection, and post-update health verification.
---

# /update

Performs a WRITE-tier, rollback-ready system update. Drives the `ops-update-patch` skill and
delegates backup/verification to the relevant operators. Never reboots automatically.

## Arguments

- `--security-only` — apply only security-tier updates (default for routine runs).
- `--full` — full dist-upgrade / `dnf upgrade` (use inside a maintenance window).
- `--runtime <name>@<version>` — perform a side-by-side runtime upgrade (e.g. `php@8.4`).
- `--dry-run` — Step 0 audit only; show what would change, make no modifications.

## Procedure

1. **Audit (READ).** Run `ops-update-patch` Step 0: refresh package lists, list upgradable
   packages, simulate the upgrade, and snapshot current versions to `/var/backups/ecc-ops`.
   Present the diff and impact summary to the operator.
2. **Confirm (WRITE gate).** Show: packages to change, whether a reboot is likely, affected
   services, and the rollback method. Require single confirmation (`/update --full` or a
   runtime bump escalates to an explicit double-confirm because backups are mandatory).
3. **Backup.** Invoke `backup-operator` to ensure a fresh backup exists before applying
   (mandatory for `--full` and `--runtime`).
4. **Apply.** Execute the chosen upgrade path via `ops-update-patch` Step 2 (or the
   side-by-side runtime procedure for `--runtime`).
5. **Reboot check.** Run Step 3; if a reboot is required, do NOT reboot — report it and
   offer to schedule within the maintenance window. Restart only stale-lib services if a
   targeted restart suffices.
6. **Verify (rule: ops-verify).** Run Step 4 health checks: `systemctl --failed`, per-app
   HTTP health from the Server Profile, runtime sanity. On failure, roll back (downgrade or
   restore) and re-verify.
7. **Record.** Write an audit entry (who/what/when/why + rollback ref) and update the
   Server Profile (OS/runtime versions, last-update timestamp).

## Subagents

- `backup-operator` — pre-update backup.
- `ops-troubleshooter` — invoked automatically if verification fails.

**Safety**: routine = `--security-only`; `--full` and `--runtime` require a maintenance
window and a confirmed fresh backup.
````

````markdown
---
description: Drive structured incident response (triage, contain, eradicate, recover) via the incident-responder subagent.
---

# /incident

Entry point for incident response. The full procedure (compromise, outage, data breach),
the `ops-incident-response` skill, and the `incident-responder` subagent are defined in
**Section XII (Domain — Security & Hardening)** — see that section for the complete
triage/containment/eradication/recovery playbook. This command simply routes the operator
into that flow and is documented here only for command-registry completeness.
````

````markdown
---
description: Whole-system ops readiness check — verifies backups, SSL renewal, fail2ban, firewall, security updates, disk, and Server Profile freshness, returning a status checklist.
---

# /ops-doctor

A READ-tier, non-mutating health audit of every protective control. It does not fix
anything — it reports a checklist with PASS / WARN / FAIL status so the operator knows
exactly what to remediate. Safe to run anytime; ideal as a scheduled daily check.

## Procedure (all read-only)

1. **Backups.** Confirm backup cron/timer is enabled AND the latest artifact is fresh
   (< 24h) and non-empty.

   ```bash
   systemctl is-enabled ecc-backup.timer 2>/dev/null || crontab -l | grep -q ecc-backup
   find /var/backups/ecc-ops/db -name '*.sql.gz' -mtime -1 -size +1c | head -1
   ```

2. **SSL renewal.** Certbot timer active and no cert expiring within 21 days.

   ```bash
   systemctl is-active certbot.timer snap.certbot.renew.timer 2>/dev/null
   sudo certbot certificates 2>/dev/null | grep -E 'Domains|VALID'
   ```

3. **fail2ban.** Service active with at least the sshd jail enabled.

   ```bash
   systemctl is-active fail2ban && sudo fail2ban-client status | grep 'Jail list'
   ```

4. **Firewall.** UFW or firewalld active with a default-deny inbound posture.

   ```bash
   sudo ufw status verbose 2>/dev/null | head -3 || sudo firewall-cmd --state
   ```

5. **Security updates.** Unattended-upgrades / dnf-automatic timer enabled; count pending
   security updates.

   ```bash
   systemctl is-enabled apt-daily-upgrade.timer dnf-automatic.timer 2>/dev/null
   apt-get -s dist-upgrade 2>/dev/null | grep -c '^Inst.*security' || true
   ```

6. **Disk & inodes.** No filesystem above 85% capacity or inode usage.

   ```bash
   df -hP | awk 'NR>1 && $5+0>85 {print "WARN",$6,$5}'
   df -iP | awk 'NR>1 && $5+0>85 {print "WARN inodes",$6,$5}'
   ```

7. **Server Profile freshness.** Profile exists and was refreshed recently; flag drift
   (running OS/runtime versions differ from the recorded profile) and recommend `/profile`.

## Output

A status checklist, e.g.:

| Check | Status | Detail |
| --- | --- | --- |
| Backup cron active | PASS | ecc-backup.timer enabled |
| Backup freshness | PASS | latest db dump 4h old |
| SSL auto-renew | PASS | certbot.timer active; nearest expiry 58d |
| fail2ban | FAIL | service inactive — run `/harden` |
| Firewall | PASS | ufw active, default deny incoming |
| Security updates | WARN | 3 security updates pending — run `/update --security-only` |
| Disk capacity | WARN | / at 87% |
| Server Profile | WARN | profile 19d old — run `/profile` |

Each WARN/FAIL includes the remediation command. `/ops-doctor` performs only READ-tier
operations and never modifies the system.

## Subagents

- `monitoring-sentinel` — supplies resource/health signals for the disk and service checks.
- `security-auditor` — corroborates firewall, fail2ban, and update posture.
````

## XV. Rules

Rules adalah kebijakan yang selalu dimuat ke konteks agent (tanpa frontmatter) dan menjadi pagar perilaku non-negotiable. Ketiga rules berikut menegakkan Prinsip 2 (read-first), 3 (rollback-ready), 5 (defense-in-depth), 7 (auditable), dan 8 (confirm-before-harm).

````markdown
<!-- rules/ops-safety.md -->
# Rule: ops-safety

Protect production servers from irreversible damage. These checks are mandatory and apply BEFORE any command runs. The hook `ops-safety-check.js` enforces a hard block; you must additionally refuse and escalate per this rule.

## Destructive commands — ALWAYS require explicit confirmation
Treat the following as DESTRUCTIVE (double-confirm + verified backup) unless run read-only:

| Pattern | Why it is dangerous |
|---|---|
| `rm -rf`, `find ... -delete`, `shred`, `truncate -s 0` | Irreversible file loss |
| `DROP {DATABASE,TABLE}`, `TRUNCATE`, `DELETE` without `WHERE` | Irreversible data loss |
| `systemctl stop\|disable\|mask` on a live service | Outage / lost auto-start |
| `ufw disable`, `iptables -F`, `iptables --flush`, `nft flush ruleset` | Server fully exposed |
| `git reset --hard`, `git clean -fd` on the server | Destroys deploy state (violates Prinsip 9) |
| `mkfs.*`, `dd of=/dev/...`, `parted`, `wipefs` | Disk destruction |
| `chown -R` / `chmod -R` on system paths (`/`, `/etc`, `/var`) | Mass permission corruption |
| `kill -9 1`, `reboot`, `shutdown`, `init 0` | Forced downtime |

NEVER auto-run these. Show impact, confirm a backup exists, then require the confirmation token (see ops-change-management).

## Backup-before-write
Before any WRITE/DESTRUCTIVE action against config, code, or data:
- Config files: copy to `<file>.bak.$(date +%F-%H%M%S)` before editing.
- Database: take a dump (mysqldump / pg_dump) before migration, DDL, or bulk DML.
- Code/deploy: record current commit hash + keep previous release dir for rollback.
- If a backup cannot be produced, STOP and report — do not proceed.

## Credential safety
- NEVER print secrets, private keys, or `.env` contents to stdout/logs.
- NEVER commit credentials to VCS. NEVER pass passwords as plain CLI args (use env/stdin/`--login-path`).
- Mask secrets in any displayed output (`****`).

## Database safety
- NEVER use the DB root/superuser as the application account.
- NEVER `GRANT ALL ... ON *.*` or to `'<user>'@'%'`; grant least privilege on the specific schema and host.
- NEVER bind the DB to `0.0.0.0` or open its port (3306/5432) to the public; bind to `127.0.0.1` or a private network only.
- NEVER write dumps into a web-served directory (webroot/public); store under a non-public, root-owned path with mode 600.

## File permission safety
- NEVER `chmod 777` on anything. World-writable is always wrong.
- Apply the standard permission matrix:

| Target | Owner | Mode |
|---|---|---|
| Web code (read-only at runtime) | `deploy:www-data` | dirs `755`, files `644` |
| App writable (cache/uploads/logs) | `www-data:www-data` | `775` (or `2775` setgid) |
| `.env` / secrets files | `deploy:www-data` | `640` |
| TLS private keys | `root:root` | `600` |
| SSH `authorized_keys` | `user:user` | file `600`, dir `.ssh` `700` |
| systemd unit files | `root:root` | `644` |
````

````markdown
<!-- rules/ops-verify.md -->
# Rule: ops-verify

Per Prinsip 4 (idempotent) and a working system is the only acceptable end state: every change MUST be verified. A change is NOT "done" until verification passes. If verification fails, roll back immediately using the prepared rollback plan.

## After a service change (restart/reload/edit unit or config)
1. `systemctl is-active <svc>` returns `active`; `systemctl status <svc>` shows no failed state.
2. Config validity tested BEFORE reload (`nginx -t`, `apachectl configtest`, `php-fpm -t`, `sshd -t`).
3. Health probe: service answers on its socket/port (`ss -ltnp`, `curl -fsS localhost`).
4. Error log clean since the change: tail `journalctl -u <svc> --since` + service log; no new errors/restarts.

## After a deploy
1. App responds `HTTP 200` (or expected status) on its public URL and a real route, not just `/`.
2. No new application errors in logs (Laravel/app log, PHP-FPM, server error log).
3. Queue/workers and scheduler are running (`systemctl`/`pm2 list`/`supervisorctl status`).
4. Migrations applied without error; SSL still valid (cert not expired, chain OK).
5. Assets/build present and served (no 404 on hashed assets).

## After a security change (firewall / SSH / hardening)
1. SSH access STILL WORKS — open a SECOND session and authenticate BEFORE closing the current one. Never disconnect on an unverified change.
2. Firewall does not block legitimate traffic: required ports (SSH, 80, 443, app) reachable; verify with `ss -ltnp` + external probe.
3. Application remains functional end-to-end after hardening (PHP/Nginx/DB limits not breaking the app).
4. Confirm the intended attack surface is actually closed (port no longer open, login policy enforced).
````

````markdown
<!-- rules/ops-change-management.md -->
# Rule: ops-change-management

Implements Prinsip 7 (auditable) and Prinsip 8 (confirm-before-harm). Classify EVERY action into a tier and follow its requirements.

## Tiers
| Tier | Examples | Requirement |
|---|---|---|
| READ | info, status, logs, health, audit, list | Auto-run, no confirmation. Must stay read-only. |
| WRITE | deploy, restart service, edit config, install package, DB migration, change firewall rule | Single confirmation + show impact + prepared rollback plan + audit entry. |
| DESTRUCTIVE | `DROP`/`TRUNCATE`, `rm -rf`, format disk, `ufw disable`, delete user, restore over production data | Double-confirm with typed token + verified backup + audit entry. |

## Rollback plan (mandatory for WRITE and DESTRUCTIVE)
Before executing, state the exact rollback command(s):
- Config: restore `<file>.bak.<ts>` then reload+verify.
- Service: revert unit/state to previous and restart.
- Deploy: re-point symlink to previous release / `git checkout <prev-hash>` + redeploy.
- DB: restore from the pre-change dump.
No rollback plan → no execution.

## Audit entry (mandatory for every WRITE/DESTRUCTIVE)
Append one JSONL record (see Section XVII) capturing who/what/when/why + rollback command. Written by `ops-audit-log.js`.

## Confirmation format
WRITE — present a single confirmation block:
```
ACTION: restart nginx
IMPACT: ~1s reload; active connections drained
ROLLBACK: cp /etc/nginx/nginx.conf.bak.<ts> /etc/nginx/nginx.conf && nginx -t && systemctl reload nginx
Proceed? (yes/no)
```
DESTRUCTIVE — require the user to TYPE a confirmation token, never a plain "yes":
```
DESTRUCTIVE: DROP DATABASE app_prod
BACKUP: /var/backups/ecc-ops/app_prod-2026-06-14-0312.sql.gz (verified, 184 MB)
ROLLBACK: gunzip -c <backup> | mysql app_prod
To proceed, type exactly:  CONFIRM DROP app_prod
```

## Dry-run
When a tool supports it, run dry-run first and show the diff/plan (`--dry-run`, `nginx -t`, `certbot --dry-run`, `rsync -n`, migration `--pretend`) before the real WRITE.
````

## XVI. Hooks & Enforcement

Hooks adalah lapisan penegakan deterministik di luar penalaran model: meskipun agent salah menilai, hook tetap memblokir atau memverifikasi. `PreToolUse` berjalan sebelum perintah dieksekusi (bisa membatalkan), `PostToolUse` berjalan setelahnya (verifikasi & pencatatan, dijalankan async agar tidak memperlambat sesi). Semua hook dikonfigurasi di `hooks/hooks.json` dan menunjuk skrip di `scripts/hooks/` lewat placeholder `${CLAUDE_PLUGIN_ROOT}`.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-context-load.js" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-safety-check.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-shadow-gate.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-confirm-gate.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-sandbox-wrap.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-post-verify.js", "async": true },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-audit-log.js", "async": true }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/ops-env-protect.js", "async": true }
        ]
      }
    ]
  }
}
```

### `ops-context-load.js` — bootstrap konteks sesi (SessionStart)
Berjalan sekali di awal tiap sesi. Memuat **digest Server Profile** + **digest Memory** (global + host target) ke konteks secara deterministik (tak bergantung inisiatif model), lalu mengevaluasi `profile_health` dengan membandingkan tiap kategori `freshness` terhadap TTL-nya (Section IV): bila `critical_stale` (ssl/firewall/disks lewat TTL), ia menandai untuk re-discovery sebelum operasi terkait. Inilah yang mewujudkan Prinsip 6 (stateful & context-aware) dan doktrin persona "Remembered, not re-asked".

```javascript
// scripts/hooks/ops-context-load.js (skeleton)
// SessionStart: read ~/.ecc-ops/profiles/<host>.json + memory/{global,<host>}.jsonl;
// emit a compact digest to context; for each freshness category, if (now - checked_at) > ttl_h
// -> mark stale; if a high-risk category (ssl|firewall|disks) is stale -> flag critical_stale.
```

### `ops-safety-check.js` — hard block katastrofik (PreToolUse Bash)
Mem-block perintah yang tidak boleh dijalankan dalam keadaan apa pun. Membaca payload tool dari stdin, mencocokkan command terhadap daftar regex katastrofik, dan `exit 1` (membatalkan) bila cocok.

```javascript
#!/usr/bin/env node
// scripts/hooks/ops-safety-check.js
// PreToolUse(Bash): hard-block catastrophic commands. Exit 1 = block.
'use strict';

const BLOCKED = [
  { re: /\bchmod\s+(-[A-Za-z]*\s+)*777\b/,            msg: 'chmod 777 is never allowed (world-writable).' },
  { re: /\brm\b(?=[^|;&\n]*(?:--no-preserve-root|\s\/(?:\s|$)))(?=[^|;&\n]*(?:-[a-z]*r|--recursive))(?=[^|;&\n]*(?:-[a-z]*f|--force))/, msg: 'rm -rf on / is forbidden (flag order independent).' },
  { re: /\brm\s+-[a-z]*\s+--no-preserve-root\b/,      msg: 'rm --no-preserve-root is forbidden.' },
  { re: /\bufw\s+disable\b/,                          msg: 'ufw disable removes all firewall protection.' },
  { re: /\biptables\s+(-F|--flush)\b/,                msg: 'iptables flush exposes the server.' },
  { re: /\bnft\s+flush\s+ruleset\b/,                  msg: 'nft flush ruleset exposes the server.' },
  { re: /DROP\s+DATABASE\b/i,                         msg: 'DROP DATABASE must go through DESTRUCTIVE confirmation.' },
  { re: /GRANT\s+ALL\b[\s\S]*@['"]?%/i,               msg: "GRANT ALL to '%' violates least privilege." },
  { re: /\bmkfs(\.\w+)?\b/,                           msg: 'mkfs formats a filesystem — forbidden.' },
  { re: /\bdd\b[^\n]*\bof=\/dev\//,                   msg: 'dd to a block device can destroy the disk.' },
  { re: /\b(>|>>)\s*\/dev\/(sd|nvme|vd|xvd)\w*/,      msg: 'Redirect to a raw block device is forbidden.' },
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,                msg: 'Fork bomb detected.' }
];

function readStdin() {
  return new Promise((res) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => res(d));
    process.stdin.on('error', () => res(d));
  });
}

(async () => {
  let cmd = '';
  try {
    const payload = JSON.parse((await readStdin()) || '{}');
    cmd = payload?.tool_input?.command || '';
  } catch (_) { /* fail open on parse, but still scan empty */ }

  for (const rule of BLOCKED) {
    if (rule.re.test(cmd)) {
      process.stderr.write(`[ops-safety-check] BLOCKED: ${rule.msg}\nCommand: ${cmd}\n`);
      process.exit(2); // exit 2 = block the tool call; stderr is shown to the agent (see §XXII.3)
    }
  }
  process.exit(0);
})();
```

### `ops-confirm-gate.js` — gerbang konfirmasi WRITE/DESTRUCTIVE (PreToolUse Bash)
Mengklasifikasikan command ke tier WRITE atau DESTRUCTIVE (regex untuk `systemctl stop/disable`, `apt install`, `certbot`, migrations, `rm -rf <path>`, `TRUNCATE`, restore, dll). Untuk DESTRUCTIVE, hook menuntut token konfirmasi yang sudah diset di environment/sesi (mis. `ECC_OPS_CONFIRM`) cocok dengan token yang ditampilkan; bila tidak cocok → `exit 2` dengan pesan yang memuat instruksi token. Untuk WRITE tanpa rollback plan tercatat → minta konfirmasi.

```javascript
// scripts/hooks/ops-confirm-gate.js (skeleton)
const DESTRUCTIVE = [/\brm\s+-rf?\s+\//, /TRUNCATE\b/i, /\bufw\s+disable\b/, /restore/i, /DROP\s+(TABLE|DATABASE)/i, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\s+-[a-z]*f/];
const WRITE = [/\bsystemctl\s+(stop|disable|mask|restart|reload|start)\b/, /\bapt(-get)?\s+install\b/, /\bcertbot\b/, /migrate\b/];
// classify -> if DESTRUCTIVE: require process.env.ECC_OPS_CONFIRM === expectedToken(cmd) else exit 2 with token prompt
// if WRITE: emit impact + rollback reminder; allow when confirmation context present.
```

### `ops-post-verify.js` — verifikasi service otomatis (PostToolUse Bash, async)
Bila command mengandung `systemctl <restart|reload|start> <svc>`, hook menjalankan `systemctl is-active <svc>` (dan probe ringan), lalu menambahkan catatan hasil ke konteks/stderr. Menegakkan Rule ops-verify tanpa bergantung pada inisiatif model.

```javascript
// scripts/hooks/ops-post-verify.js (skeleton)
// parse svc from command; exec `systemctl is-active <svc>`; if != 'active' -> warn loudly + suggest rollback.
```

### `ops-env-protect.js` — auto-chmod 640 untuk `.env` (PostToolUse Edit|Write, async)
Setelah Edit/Write pada file yang cocok `\.env(\.|$)` atau file secrets, hook menjalankan `chmod 640 <file>` (mempertahankan owner `deploy:www-data` agar runtime app bisa baca via group; world tetap tidak), memastikan kredensial tidak pernah world-readable (Prinsip 5).

```javascript
// scripts/hooks/ops-env-protect.js (skeleton)
// read tool_input.file_path; if /\.env(\.|$)/ or secrets path -> fs.chmodSync(path, 0o640).
```

### `ops-audit-log.js` — append audit JSONL (PostToolUse, async)
Untuk setiap WRITE/DESTRUCTIVE, menulis satu baris JSON (schema di Section XVII) ke audit log (`/var/log/ecc-ops/audit.jsonl` di host atau `~/.ecc-ops/audit/<host>.jsonl` di sisi kontrol). Append-only; tidak pernah memodifikasi entri lama (Prinsip 7).

```javascript
// scripts/hooks/ops-audit-log.js (skeleton)
// build entry {timestamp, host, actor, tier, command, target, result, ...}; fs.appendFileSync(AUDIT, JSON.stringify(entry)+'\n').
```

### `ops-shadow-gate.js` — wajibkan pre-verifikasi (PreToolUse Bash)
Untuk kelas-operasi yang ditandai `requires_shadow` oleh kebijakan `ops-trust`, hook menahan eksekusi sampai ada bukti rehearsal yang lulus (`shadow_verified` T1/T2) untuk perintah ini pada sesi ini; READ diloloskan otomatis. Menegakkan "pre-verified" secara deterministik. Skeleton & desain penuh di **Section XXI.2**.

### `ops-sandbox-wrap.js` — bungkus containment (PreToolUse Bash)
Untuk WRITE/DESTRUCTIVE yang kebijakannya menuntut containment, hook menulis-ulang perintah agar berjalan di dalam `systemd-run`/Landlock yang dibatasi ke blast radius yang dideklarasikan; bila blast radius hilang/terlalu lebar → `exit 2`. Men-set `contained: true` untuk entri audit. Skeleton & desain penuh di **Section XXI.1 & XXI.5**.

## XVII. Audit Trail & Change Management

Setiap aksi WRITE dan DESTRUCTIVE menghasilkan satu entry append-only sehingga selalu ada jawaban atas who / what / when / why dan cara membatalkannya (Prinsip 7). Audit log ditulis oleh `ops-audit-log.js` ke salah satu lokasi: pada host yang dikelola di `/var/log/ecc-ops/audit.jsonl`, atau terpusat di sisi kontrol `~/.ecc-ops/audit/<host>.jsonl`. Format JSONL (satu objek per baris) dipilih agar mudah di-`grep`, di-`jq`, dan di-append secara atomik.

### Skema entry

```json
{
  "timestamp": "2026-06-14T03:12:44Z",
  "host": "web-01.example.com",
  "actor": "syamsuddin.ideris@gmail.com",
  "tier": "DESTRUCTIVE",
  "command": "mysql -e 'DROP DATABASE app_staging'",
  "target": "mysql://web-01/app_staging",
  "pre_state_ref": "/var/backups/ecc-ops/app_staging-2026-06-14-0312.sql.gz",
  "result": "success",
  "rollback_cmd": "gunzip -c /var/backups/ecc-ops/app_staging-2026-06-14-0312.sql.gz | mysql app_staging",
  "reason": "Recreate staging DB from clean dump per ticket OPS-417"
}
```

| Field | Makna |
|---|---|
| `timestamp` | UTC ISO-8601, saat aksi dieksekusi. |
| `host` | Host target (cocok dengan key Server Profile). |
| `actor` | Identitas yang menyetujui (operator email / service account). |
| `tier` | `WRITE` atau `DESTRUCTIVE` (READ tidak dicatat). |
| `command` | Perintah persis yang dijalankan (secret dimasking). |
| `target` | Objek yang terdampak (service, file, DB, domain, rule firewall). |
| `pre_state_ref` | Pointer ke titik mundur: path backup, commit hash, atau `<file>.bak.<ts>`. |
| `result` | `success` / `failed` / `rolled_back`. |
| `rollback_cmd` | Perintah konkret untuk membatalkan perubahan. |
| `reason` | Mengapa — tiket, insiden, atau instruksi operator. |

### Retensi
- Default retensi 365 hari pada host; di-rotate via logrotate (`monthly`, `rotate 12`, `compress`, `nocreate`) agar audit lama terkompresi tetapi tetap tersedia.
- Salinan terpusat di sisi kontrol tidak di-prune otomatis (arsip kepatuhan); pertimbangkan offsite sesuai kebijakan.
- File audit dimiliki `root:root` mode `640`; append-only flag (`chattr +a`) disarankan pada host agar entri tidak bisa diubah.

### Review & kaitan rollback
- `/ops-doctor` membaca audit untuk meringkas perubahan terbaru, mendeteksi WRITE tanpa verifikasi, dan menampilkan rollback yang tersedia.
- Query cepat:

```bash
# Semua aksi DESTRUCTIVE 7 hari terakhir
jq -c 'select(.tier=="DESTRUCTIVE")' /var/log/ecc-ops/audit.jsonl \
  | tail -n 200

# Perubahan yang gagal (kandidat untuk rollback)
jq -c 'select(.result=="failed")' /var/log/ecc-ops/audit.jsonl
```

- Setiap entry membawa `rollback_cmd` dan `pre_state_ref`, sehingga audit trail bukan sekadar catatan tetapi sumber kebenaran untuk pemulihan: pilih entry, jalankan `rollback_cmd`-nya, lalu verifikasi ulang (Rule ops-verify). Hasil rollback dicatat sebagai entry baru ber-`result: rolled_back`.

## XVIII. Peta File Lengkap

```
ecc-ops/
├── .claude-plugin/
│   └── plugin.json                     # manifest plugin (lihat Section XIX)
├── hooks/
│   └── hooks.json                      # konfigurasi 8 hook (Section XVI)
├── scripts/
│   └── hooks/                          # 8 hook scripts (Node.js)
│       ├── ops-context-load.js         # SessionStart — load Profile+Memory digest + TTL check
│       ├── ops-safety-check.js         # PreToolUse Bash  — hard-block katastrofik
│       ├── ops-shadow-gate.js          # PreToolUse Bash  — wajibkan rehearsal (Section XXI)
│       ├── ops-confirm-gate.js         # PreToolUse Bash  — gate WRITE/DESTRUCTIVE + token
│       ├── ops-sandbox-wrap.js         # PreToolUse Bash  — bungkus containment (Section XXI)
│       ├── ops-post-verify.js          # PostToolUse Bash — verifikasi service (async)
│       ├── ops-env-protect.js          # PostToolUse Edit|Write — chmod 640 .env (async)
│       └── ops-audit-log.js            # PostToolUse — append audit JSONL (async)
├── skills/                             # 28 skills (knowledge base)
│   ├── ops-server-core/SKILL.md        # — universal (18) —
│   ├── ops-discovery/SKILL.md
│   ├── ops-memory/SKILL.md
│   ├── ops-webserver/SKILL.md
│   ├── ops-dns/SKILL.md
│   ├── ops-ssl/SKILL.md
│   ├── ops-database/SKILL.md
│   ├── ops-deploy/SKILL.md
│   ├── ops-secrets/SKILL.md
│   ├── ops-firewall/SKILL.md
│   ├── ops-security-hardening/SKILL.md
│   ├── ops-intrusion-detection/SKILL.md
│   ├── ops-backup/SKILL.md
│   ├── ops-monitoring/SKILL.md
│   ├── ops-log-management/SKILL.md
│   ├── ops-performance/SKILL.md
│   ├── ops-incident-response/SKILL.md
│   ├── ops-update-patch/SKILL.md
│   ├── ops-sandbox/SKILL.md            # — intelligence layer (4, Section XXI) —
│   ├── ops-shadow/SKILL.md
│   ├── ops-immunity/SKILL.md
│   ├── ops-trust/SKILL.md
│   ├── ops-runtime-php/SKILL.md        # — runtime-specific (6) —
│   ├── ops-runtime-node/SKILL.md
│   ├── ops-runtime-python/SKILL.md
│   ├── ops-runtime-go/SKILL.md
│   ├── ops-runtime-java/SKILL.md
│   └── ops-containers/SKILL.md
├── agents/                             # 9 subagents (spesialis)
│   ├── server-provisioner.md           # tools: Read,Write,Edit,Bash
│   ├── deploy-operator.md              # tools: Read,Bash
│   ├── security-auditor.md             # tools: Read,Bash
│   ├── ops-troubleshooter.md           # tools: Read,Bash
│   ├── backup-operator.md              # tools: Read,Bash
│   ├── performance-tuner.md            # tools: Read,Bash
│   ├── incident-responder.md           # tools: Read,Bash
│   ├── monitoring-sentinel.md          # tools: Read,Bash
│   └── immunity-synthesizer.md         # tools: Read,Bash (Section XXI)
├── commands/                           # 24 commands (entry-point slash)
│   ├── server-setup.md
│   ├── profile.md
│   ├── memory.md
│   ├── shadow.md                       # — intelligence layer (4, Section XXI) —
│   ├── immunize.md
│   ├── trust.md
│   ├── sandbox.md
│   ├── deploy.md
│   ├── rollback.md
│   ├── dns-setup.md
│   ├── ssl-setup.md
│   ├── firewall.md
│   ├── security-audit.md
│   ├── harden.md
│   ├── health-check.md
│   ├── monitor.md
│   ├── backup.md
│   ├── restore.md
│   ├── troubleshoot.md
│   ├── perf-tune.md
│   ├── logs.md
│   ├── update.md
│   ├── incident.md
│   └── ops-doctor.md
├── rules/                              # 3 rules (auto-loaded policy)
│   ├── ops-safety.md
│   ├── ops-verify.md
│   └── ops-change-management.md
└── README.md

# State direktori (sisi kontrol — runtime, di luar repo plugin):
~/.ecc-ops/
├── active.json                         # host AKTIF + operator — WAJIB dibaca tiap hook (Section XXII)
├── op-context.json                     # konteks operasi berjalan: op_class/actor/reason/rollback/blast_radius (Section XXII)
├── profiles/
│   └── <host>.json                     # Server Profile persisten per host (Prinsip 6)
├── memory/
│   ├── global.jsonl                    # memori operator kuratif lintas-fleet (skill ops-memory)
│   └── <host>.jsonl                    # memori spesifik host + antibodi fleet (Section XXI)
├── audit/
│   └── <host>.jsonl                    # salinan audit terpusat (Section XVII)
├── shadow/
│   └── <session>.jsonl                 # rekaman rehearsal ops-shadow (Section XXII)
└── sandbox/
    └── <handle>/                       # workdir twin ephemeral — runtime-only, auto-teardown (Section XXI)

# Artifact sisi-host (dipasang saat provisioning — di luar repo plugin & state dir):
/usr/local/bin/ecc-ops-sandbox-helper   # helper privileged root-owned (Section XXI.1 / XXII.10)
/etc/sudoers.d/ecc-ops                   # whitelist NOPASSWD ketat untuk helper + service (Section XXII.10)
```

Catatan: `autonomy_ledger` (ops-trust) dan `sandbox_capabilities` (ops-sandbox) disimpan sebagai field di dalam `profiles/<host>.json`; antibodi (ops-immunity) disimpan sebagai entri di `memory/global.jsonl`. Tidak ada store top-level baru selain workdir sandbox ephemeral.

Ringkasan: 28 skills (18 universal + 4 intelligence-layer §XXI + 6 runtime-specific), 9 subagents, 24 commands, 3 rules, 8 hook scripts + 1 `hooks.json`, 1 manifest plugin.

## XIX. Instalasi & Packaging

ECC-Ops dikemas sebagai Claude Code plugin yang MANDIRI dan self-contained: semua skills, subagents, commands, rules, dan hooks berada dalam satu repo, tanpa dependensi pada produk atau plugin lain. Yang dibutuhkan hanyalah Claude Code dan akses shell ke server target.

### Struktur & manifest plugin
Manifest berada di `.claude-plugin/plugin.json` dan mendeklarasikan metadata serta lokasi komponen. Claude Code otomatis menemukan `skills/`, `agents/`, `commands/`, `rules/`, dan `hooks/hooks.json` relatif terhadap root plugin.

```json
{
  "name": "ecc-ops",
  "version": "2.0.0",
  "description": "Autonomous AI sysadmin agent for end-to-end server operations: provisioning, deploy, DNS/SSL, security hardening, monitoring, backup, and incident response.",
  "author": "ECC-Ops",
  "license": "MIT",
  "keywords": ["sysadmin", "devops", "server", "deploy", "security", "monitoring"],
  "skills": "./skills",
  "agents": "./agents",
  "commands": "./commands",
  "rules": "./rules",
  "hooks": "./hooks/hooks.json"
}
```

### Cara instal
Pilih salah satu:

1. Clone langsung ke direktori plugin Claude Code:
```bash
git clone https://example.com/ecc-ops.git ~/.claude/plugins/ecc-ops
```

2. Via marketplace (jika repo terdaftar sebagai marketplace plugin):
```bash
# di dalam Claude Code
/plugin marketplace add https://example.com/ecc-ops-marketplace
/plugin install ecc-ops
```

### Prasyarat
- Claude Code terinstal dan login.
- Node.js (untuk menjalankan hook scripts di `scripts/hooks/`).
- Akses shell ke server target. Tiga mode operasi:
  - **Lokal**: Claude Code berjalan di host yang dikelola (Bash langsung).
  - **Remote (SSH)**: operator menjalankan Claude Code di workstation; perintah dieksekusi melalui SSH ke server target (gunakan key auth, host alias di `~/.ssh/config`).
  - **Fleet (MCP bridge)**: untuk banyak server, sebuah MCP bridge mengeksekusi perintah per host dan mengembalikan output, sambil tetap melewati hook safety/confirm/audit yang sama.

### Aktivasi
Setelah terinstal, restart/`/reload` Claude Code. Plugin aktif ketika commands (mis. `/server-setup`, `/health-check`) tersedia dan rules termuat. Jalankan `/ops-doctor` untuk self-check awal (mendeteksi konteks, memeriksa hooks, dan menampilkan ringkasan Server Profile bila ada).

### Catatan keamanan instalasi
- Pasang plugin hanya dari sumber tepercaya — hooks menjalankan kode Node lokal dan commands menjalankan perintah shell.
- Delapan hook (Section XVI) aktif sejak terpasang; JANGAN menonaktifkan `ops-safety-check.js` atau `ops-confirm-gate.js`.
- Simpan kredensial server di luar repo plugin (gunakan SSH agent / secret store); jangan pernah commit `~/.ecc-ops/` ke VCS.
- Set permission ketat pada state direktori: `chmod 700 ~/.ecc-ops`.

## XX. Alur Kerja & Siklus Hidup Sysadmin

ECC-Ops dipakai dalam siklus berulang: Orchestrator (persona agent utama) membaca **Server Profile** untuk konteks, mendelegasikan ke subagent spesialis, setiap WRITE/DESTRUCTIVE melewati hook + **Audit trail**, lalu hasil mengupdate Server Profile. Berikut alur praktisnya.

### HARI-1 — server baru (bootstrap)
| Langkah | Command | Subagent / Skill | Hasil |
|---|---|---|---|
| 1 | `/server-setup` | server-provisioner · ops-server-core | OS dasar, user non-root, SSH hardening, swap, paket inti |
| 2 | `/profile` | ops-discovery | Server Profile terisi (OS, resource, stack, apps) |
| 3 | `/dns-setup` | ops-dns | DNS record + verifikasi propagasi (prasyarat SSL) |
| 4 | `/ssl-setup` | ops-ssl | Sertifikat TLS via Certbot, auto-renew, hardening |
| 5 | `/security-audit` | security-auditor · ops-security-hardening | Baseline keamanan + daftar temuan untuk `/harden` |

### HARIAN
- `/health-check` — monitoring-sentinel: status service, resource, SSL expiry, error terbaru.
- `/deploy` — deploy-operator: rilis kode via VCS (Prinsip 9), zero-downtime symlink, verifikasi pasca-deploy.
- `/logs` — query log diagnostik cepat (service/app/access/error).

### MINGGUAN
- `/security-audit` — re-audit postur keamanan; bandingkan dengan baseline.
- `/ops-doctor` — self-check menyeluruh: drift Profile, audit tanpa verifikasi, hook sehat, rollback tersedia.
- `/perf-tune` — performance-tuner: analisis & tuning web/runtime/DB.
- `/backup` (verifikasi) — backup-operator: jalankan backup + uji restore agar backup terbukti bisa dipulihkan.

### SAAT MASALAH
- `/troubleshoot` — ops-troubleshooter: diagnosa read-first, akar masalah, usul perbaikan (Prinsip 2).
- `/rollback` — kembalikan deploy ke rilis sebelumnya (symlink/commit) lalu verifikasi.
- `/restore` — backup-operator: pulihkan DB/file dari backup (DESTRUCTIVE bila menimpa produksi).

### SAAT DARURAT
- `/incident` — incident-responder: prosedur compromise/outage/data breach — isolasi, bukti, kontain, pulihkan, post-mortem.

### Bagaimana Orchestrator + Server Profile + Audit bekerja bersama

```
                    ┌──────────────────────────────────────────┐
   operator ──/cmd──▶                ORCHESTRATOR               │
                    │  (persona utama: deteksi → rencanakan →    │
                    │   delegasikan → verifikasi)                │
                    └───────┬───────────────────────────▲───────┘
            baca konteks    │                            │  update
        ┌───────────────────▼───┐                ┌───────┴──────────┐
        │   SERVER PROFILE       │                │  hasil + state    │
        │  ~/.ecc-ops/profiles/  │                │   baru            │
        └───────────────────┬───┘                └───────▲──────────┘
                            │  delegasi ke spesialis      │
                    ┌───────▼─────────────────────────────┴──────┐
                    │  SUBAGENTS (server-provisioner, deploy-,    │
                    │  security-auditor, ops-troubleshooter, ...) │
                    └───────┬─────────────────────────────────────┘
                            │  setiap aksi
              ┌─────────────▼──────────────┐      READ  → auto
              │  HOOKS (Section XVI)        │      WRITE → confirm + rollback
              │  safety-check → confirm-gate│      DESTRUCTIVE → token + backup
              │  → post-verify → audit-log  │
              └─────────────┬──────────────┘
                            │  setiap WRITE/DESTRUCTIVE
                    ┌───────▼───────────────┐
                    │  AUDIT TRAIL (JSONL)   │  who/what/when/why + rollback_cmd
                    │  /var/log/ecc-ops/     │  (Section XVII)
                    └────────────────────────┘
```

Siklus satu aksi: Orchestrator membaca Server Profile untuk konteks (Prinsip 6) → menyusun rencana read-first (Prinsip 2) → mendelegasikan ke subagent → setiap perintah lewat hooks (safety, konfirmasi tiering, verifikasi, audit) → WRITE menyiapkan rollback (Prinsip 3) dan menulis audit entry (Prinsip 7) → hasil memperbarui Server Profile untuk sesi berikutnya.

**Filosofi**: ECC-Ops memperlakukan setiap server sebagai sistem produksi yang harus selalu pulih — read-first sebelum write, rollback sebelum risiko, dan audit di setiap langkah, sehingga operasi otonom tetap aman, idempoten, dan dapat dipertanggungjawabkan.

## XXI. Lapisan Kecerdasan Lanjutan — Sandbox & Trilogi ops-shadow / ops-immunity / ops-trust

Bagian-bagian sebelumnya mendeskripsikan ECC-Ops yang **reaktif dan terkonfirmasi**: ia mendiagnosa, mengusulkan, lalu menunggu persetujuan untuk tiap perubahan. Section ini menambahkan **lapisan kecerdasan** yang membuatnya **prediktif, belajar, dan beradaptasi** — tanpa mengorbankan satu pun prinsip keselamatan. Lapisan ini berdiri di atas aset yang sudah dimiliki ECC-Ops (Server Profile, Memory, Audit Trail, fleet) dan mengubahnya dari catatan pasif menjadi **mesin penalaran aktif**.

Empat komponen baru bekerja sebagai satu kesatuan:

- **`ops-sandbox`** — substrat isolasi bersama (broker). Bukan pilar kecerdasan, melainkan **fondasi** tempat ketiga pilar berpijak.
- **`ops-shadow`** — verifikasi empiris **pra-aksi**: menguji rencana di kembaran sekali-pakai sebelum menyentuh produksi. Mengubah Prinsip 3 (rollback-ready) menjadi *pre-verified*.
- **`ops-immunity`** — **sistem imun fleet**: satu insiden di satu host disintesis menjadi detektor + remediasi preventif yang mengimunisasi seluruh fleet sebelum kegagalan yang sama berulang.
- **`ops-trust`** — **otonomi terkalibrasi**: tiering persetujuan statis menjadi adaptif, dikalibrasi dari rekam-jejak teraudit agent itu sendiri.

### Prinsip pemersatu: dua peran sandbox

Seluruh arsitektur ini berputar pada satu wawasan — sandbox melayani trilogi dalam **dua peran ortogonal**:

| Peran | Kapan | Yang dikurangi | Kandidat primitif |
|---|---|---|---|
| **Rehearsal (Evidence)** | *off-prod*, sebelum aksi | **ketidakpastian** ("apa yang akan terjadi?") | netns, CoW-twin, container, nspawn, microVM |
| **Containment (Severity)** | *on-prod*, saat eksekusi nyata | **blast radius** ("kalau salah, separah apa?") | systemd-run, Landlock, seccomp, capability-drop |

`ops-trust` memberi **harga** pada risiko; sandbox **menurunkan** harganya. Rehearsal memangkas ketidakpastian (bukti lebih baik); containment memangkas severity (kerusakan terbatas). Keduanya adalah input ke model risiko `ops-trust`. Inilah yang mengunci keempat komponen menjadi **loop belajar tertutup**.

### Peta arsitektur tunggal

```
        ┌──────────────── ops-trust (kebijakan otonomi · penetapan harga risiko) ───────────────┐
        │   mewajibkan mode sbg syarat promosi ▲          ▲ menimbang bukti menurut fidelitas      │
        ▼                                      │          │                                        ▼
 ops-shadow (rehearse → bukti) ─────────► AUDIT TRAIL (ber-tag: shadow_fidelity, sandbox_primitive, contained) ◄───── ops-immunity (verifikasi antibodi → sebar)
        │ request: rehearsal/containment                                                    request: rehearsal/containment │
        ▼                                                                                                                 ▼
 ┌──────────────────────────────── ops-sandbox  BROKER  (substrat bersama) ─────────────────────────────────┐
 │  MODE rehearsal { netns · CoW-twin · container · nspawn · microVM }                                        │
 │  MODE containment { systemd-run · Landlock · seccomp · capability-drop }                                   │
 │  deteksi kapabilitas → Profile.sandbox_capabilities · pilih primitif teringan yg penuhi paritas dlm deadline│
 │  ephemeral lifecycle (auto-teardown · resource cap) · emit fidelity metadata · least-privilege-first        │
 └──────────────────────── privileged helper (root, NOPASSWD): ecc-ops-sandbox-helper ◄── agent non-root ──────┘
                                                   │ executes
                                                   ▼
                                          TARGET HOST / TWIN
```

Keputusan arsitektur kunci: **sandbox TIDAK ditanam tiga kali** ke dalam shadow/immunity/trust. Ia diekstrak sebagai **satu broker** dengan kontrak seragam, sehingga deteksi kapabilitas, least-privilege, lifecycle, dan semantik fidelitas hanya hidup di satu tempat. Trilogi tetap tipis: mereka *meminta* mode dan *membaca* fidelitas.

---

### XXI.1 — `ops-sandbox`: substrat isolasi bersama (broker)

`ops-sandbox` menyediakan isolasi sebagai layanan internal. Ia menerima permintaan ber-kontrak, memilih **primitif teringan** yang memenuhi paritas yang dibutuhkan dalam tenggat yang diberikan, mem-provision lingkungan ephemeral, menjamin teardown, dan mengembalikan **metadata fidelitas** (paritas yang benar-benar tercapai) untuk dicatat ke audit.

**Kapabilitas dibaca dari Server Profile** (field baru `sandbox_capabilities`) — agar agent tahu primitif mana yang boleh dipilih per host:

```json
"sandbox_capabilities": {
  "container_runtime": "podman-rootless",
  "namespaces": ["mnt", "net", "pid", "user"],
  "cow_storage": { "type": "lvm", "thinpool": "vg0/thin" },
  "landlock": true,
  "seccomp": true,
  "microvm": null,
  "privileged_helper": "/usr/local/bin/ecc-ops-sandbox-helper"
}
```

**Kontrak broker (seragam):**

```
request  { mode: rehearsal|containment,
           aspect: net|fs|service|db|pkg|generic,
           blast_radius: ["/var/www/app", "mysql:shop"],
           parity_needed: low|medium|high,
           deadline_s: <int> }
result   { handle, primitive_used, achieved_fidelity: T0|T1|T2,
           contained: bool }            // atau { degraded: true, reason }
```

**Paradoks privilege** diselesaikan dengan **helper ber-privilege** (root-owned, NOPASSWD untuk user agent) — agent non-root memanggilnya hanya untuk *membangun* sandbox; agent sendiri tetap terkurung. Pola ini identik dengan wrapper deploy root-owned yang lazim dipakai sysadmin:

```bash
#!/usr/bin/env bash
# /usr/local/bin/ecc-ops-sandbox-helper   (root-owned 0755; agent via sudo NOPASSWD)
# Builds/tears down sandboxes the non-root agent cannot create itself.
# Whitelisted verbs only; never executes arbitrary agent input.
set -euo pipefail
case "${1:-}" in
  netns-create)   ip netns add "ecc-shadow-$2" ;;                      # rehearsal: firewall
  netns-destroy)  ip netns del "ecc-shadow-$2" ;;
  cow-clone)      lvcreate -s -n "shadow-$3" -L "${4}G" "$2" ;;        # rehearsal: DB twin
  cow-destroy)    lvremove -f "$2" ;;
  nspawn-boot)    systemd-nspawn -q -D "$2" --ephemeral "${@:3}" ;;
  *) echo "ecc-ops-sandbox-helper: refused unknown verb '$1'" >&2; exit 64 ;;
esac
```

#### Skill: ops-sandbox

````markdown
---
name: ops-sandbox
description: Shared isolation substrate (broker) for the intelligence layer. Provisions ephemeral REHEARSAL sandboxes (netns, CoW-twin, container, nspawn, microVM) to generate evidence, and CONTAINMENT wrappers (systemd-run, Landlock, seccomp, capability-drop) to bound the blast radius of real execution. Picks the lightest primitive meeting required parity within deadline, least-privilege first.
version: 1.0
---

# Sandbox Broker

`ops-sandbox` is infrastructure, not a reasoning pillar. It gives `ops-shadow`,
`ops-immunity`, and `ops-trust` ONE uniform way to obtain isolation, so capability
detection, least-privilege, lifecycle, and fidelity semantics live in a single place.

## Two modes
- **rehearsal** (off-prod) — build a disposable twin to OBSERVE an outcome.
- **containment** (on-prod) — wrap a real command so it CANNOT exceed its declared
  blast radius.

## Capability detection
Probe the host once and cache into `Server Profile.sandbox_capabilities` (container
runtime, namespaces, CoW storage, Landlock/seccomp, microVM, helper path). Re-probe on
the Profile's staleness schedule. NEVER assume a primitive exists — adapt (Principle 1).

## Primitive selection
Given `{aspect, parity_needed, deadline_s}`, choose the LIGHTEST primitive that meets
parity:

| aspect  | low parity            | medium                      | high parity            |
|---------|-----------------------|-----------------------------|------------------------|
| net     | logic (T0)            | netns rehearsal             | netns + traffic probe  |
| fs      | overlayfs             | overlayfs + validator       | nspawn copy            |
| service | systemd-run dry       | systemd-nspawn boot         | container from OS image|
| db      | EXPLAIN / pg txn      | CoW snapshot clone          | CoW clone + real load  |
| pkg     | `apt-get -s`          | container apply             | nspawn from OS image   |

Kernel-level changes (sysctl, modules, kernel upgrade) CANNOT be rehearsed by a
kernel-sharing sandbox — require microVM or report `degraded` honestly.

## Least-privilege
Prefer rootless primitives (Podman-rootless, bubblewrap, Landlock, user namespaces).
For primitives that need privilege (netns, nspawn, CoW LVM, microVM), call the
root-owned `ecc-ops-sandbox-helper` with whitelisted verbs only — the agent stays
unprivileged.

## Lifecycle & fidelity
- Every sandbox is ephemeral: resource-capped, auto-torn-down (even on error), and
  given a unique `handle`.
- Return `achieved_fidelity` (T0|T1|T2) and `contained` — these are written to the
  audit trail by `ops-audit-log.js` and consumed by `ops-trust` for evidence weighting.
- If the requested parity is unattainable, return `{degraded, reason}` — NEVER fake a
  twin or silently downgrade without saying so.

## Related
- Consumers: `ops-shadow` (rehearsal + guarded-apply containment), `ops-immunity`
  (antibody verification), `ops-trust` (evidence weighting, required modes).
- Command: `/sandbox`. Profile field: `sandbox_capabilities`. Helper:
  `ecc-ops-sandbox-helper` (root, NOPASSWD).
````

#### Command: /sandbox

````markdown
---
description: Inspect sandbox capabilities of a host, list and tear down ephemeral sandboxes, and dry-detect which isolation primitives are available. READ except teardown (WRITE).
---

# /sandbox

Inspect and manage the isolation substrate (`ops-sandbox`) on a host.

## Modes
- **caps** (default) — print `Server Profile.sandbox_capabilities`; with `--probe`,
  re-detect live (container runtime, namespaces, CoW storage, Landlock/seccomp, microVM)
  and refresh the Profile. READ.
- **list** — show ephemeral sandboxes currently allocated (handles, age, resource use).
  READ.
- **gc** — tear down leaked/orphaned ephemeral sandboxes past their TTL. WRITE
  (control-side cleanup; never touches the live host state being managed).

## Safety
- Capability probing is read-only.
- Teardown only removes ECC-Ops-owned ephemeral sandboxes (prefixed `ecc-shadow-`),
  never operator workloads.

## Related
- Skill: `ops-sandbox`
- Used by: `/shadow`, `/immunize`, `/trust`
````

---

### XXI.2 — `ops-shadow`: verifikasi empiris pra-aksi

`ops-shadow` menjawab "apa yang akan terjadi bila kujalankan?" dengan **bukti, bukan harapan**. Ia beroperasi pada **tiga tingkat fidelitas**, memilih yang paling ringan-namun-cukup berdasarkan risiko operasi, isolasi yang tersedia (dari Profile), dan tenggat.

| Tingkat | Apa | Infra | Boleh set `shadow_verified` |
|---|---|---|---|
| **T0 — logic** | LLM **memprediksi** akibat dari Profile + rencana | nol | ❌ **tidak pernah** (prediksi, bukan ukuran) |
| **T1 — native validators** | mode dry-run/validate binari asli (`nginx -t`, `sshd -t`, `apt-get -s`, `pg BEGIN…ROLLBACK`) | nol tambahan | ✅ untuk lingkup yang dicakup |
| **T2 — ephemeral twin** | benar-benar menjalankan perubahan di sandbox `ops-sandbox`, mengamati runtime | container/netns/CoW (bukan server baru) | ✅ fidelitas tertinggi |

**Aturan keras (konstanta desain):** field audit `shadow_verified: true` **hanya** boleh diset oleh T1/T2. T0 dilaporkan sebagai *advisory analysis* — selaras prinsip "advisory, bukan otoritatif" pada Memory. Setiap laporan shadow WAJIB menyebut tingkat fidelitasnya, sehingga operator tahu "sudah saya uji" berarti *binari asli memvalidasi* atau cuma *saya berpikir keras*.

**Siklus shadow:** `plan → (rehearsal di ops-sandbox) → observe → if pass: guarded-apply (containment di ops-sandbox) → audit`. Bila twin gagal, agent memperbaiki rencana di twin sampai hijau lalu menyajikan bukti + diff ke operator. **Degradasi anggun:** bila primitif T2 tak tersedia, turun ke T1+T0 dan **laporkan terus terang** bahwa perilaku runtime belum terverifikasi.

#### Skill: ops-shadow

````markdown
---
name: ops-shadow
description: Pre-action empirical verification. Rehearses a planned WRITE/DESTRUCTIVE change on a disposable twin (via ops-sandbox) across three fidelity tiers (T0 logic, T1 native validators, T2 ephemeral twin), then applies to production inside containment. Turns "rollback-ready" into "pre-verified". Only T1/T2 may set shadow_verified.
version: 1.0
---

# Shadow Execution

Verify a risky change with evidence BEFORE production is touched. The Server Profile is
the seed: it tells the twin which OS image, stack versions, config paths, and data
engine to reproduce.

## Fidelity tiers
- **T0 (logic)** — reason over the Profile + plan and PREDICT the outcome. Advisory
  only; NEVER sets `shadow_verified`. Catches reasoning-detectable errors (anti-patterns,
  `max_children` vs RAM math, logical contradictions).
- **T1 (native validators)** — run the tool's own dry-run/validate mode on the host or
  control node, no extra infra: `nginx -t`/`-T`, `apachectl configtest`, `sshd -t`,
  `named-checkconf`/`checkzone`, `visudo -c`, `systemd-analyze verify`, `ufw --dry-run`,
  `rsync -n`, `apt-get -s install`, `git apply --check`, `composer validate`. Postgres
  DDL is transactional (`BEGIN; …; ROLLBACK;`); MySQL DDL auto-commits — use a T2 clone.
- **T2 (ephemeral twin)** — ask `ops-sandbox` for a rehearsal sandbox and actually run
  the change, observing runtime (service comes up? migration succeeds? lock duration?
  endpoint responds?).

## Tier selection
Pick by `(operation tier) × (parity needed) × (available isolation from Profile) ×
(deadline)`. Config edits → T1 is enough. Migrations / service lifecycle → prefer T2.
Kernel changes → T2 microVM or report unverified. Emergencies (P1) may run T1 +
containment-only when there is no time for a full twin.

## The hard rule
`shadow_verified: true` is set ONLY by T1 or T2. Always report which tier ran. On
missing isolation, degrade to T1+T0 and state plainly that runtime behavior is
UNVERIFIED — then let the operator (or `ops-trust` policy) decide.

## Lifecycle
plan -> rehearse (ops-sandbox rehearsal) -> observe -> if pass: guarded-apply
(ops-sandbox containment) -> post-verify -> audit (record `shadow_fidelity`).
If the twin fails, fix the plan on the twin until green, then present evidence + diff.

## Boundaries
- A twin is necessary, not sufficient: it cannot replicate production load, data scale,
  or live traffic. Timing observations (lock time, p95) are INDICATIVE.
- Re-validate Profile freshness before guarded-apply: if prod drifted during the
  rehearsal window, re-rehearse (ties to Server Profile staleness semantics, Section IV).

## Related
- Substrate: `ops-sandbox`. Command: `/shadow`. Hook: `ops-shadow-gate.js`.
- Feeds: `ops-trust` (evidence), `ops-immunity` (antibody verification).
````

#### Command: /shadow

````markdown
---
description: Rehearse a planned change on a disposable twin and report the outcome with its fidelity tier, before anything touches production.
---

# /shadow

Pre-flight a WRITE/DESTRUCTIVE change and show evidence + fidelity.

## Modes
- **rehearse `<planned change>`** (default) — run the change through the highest tier
  available (T0/T1/T2), print the predicted/observed result, the fidelity tier, and a
  diff. READ (the twin is disposable; production is untouched).
- **apply** — guarded-apply a previously rehearsed-and-passed plan to production INSIDE
  containment; records `shadow_fidelity` to the audit trail. WRITE/DESTRUCTIVE per the
  underlying op's tier.

## Output contract
Every result states: tier (T0/T1/T2), `shadow_verified` (true only for T1/T2), what was
observed, and — if degraded — exactly what could NOT be verified.

## Safety
- T0 is advisory and labeled as such; it never authorizes an apply on its own.
- `apply` re-checks Profile freshness; if prod drifted since the rehearsal, it
  re-rehearses first.

## Related
- Skill: `ops-shadow` · Substrate: `ops-sandbox` · Gate: `ops-shadow-gate.js`
````

#### Hook: ops-shadow-gate.js — wajibkan rehearsal untuk WRITE berisiko-tinggi (PreToolUse Bash)

Untuk kelas-operasi yang ditandai `requires_shadow` oleh kebijakan `ops-trust`, hook menahan eksekusi sampai ada bukti rehearsal yang lulus (`shadow_verified` untuk perintah ini pada sesi ini). Ini menegakkan "pre-verified" secara deterministik, di luar kuasa model.

```javascript
// scripts/hooks/ops-shadow-gate.js (skeleton)
// PreToolUse(Bash): if command class is in the trust policy's `requires_shadow` set
// AND no passing shadow record (T1/T2) exists for this command in-session -> exit 2
// with an instruction to run `/shadow rehearse` first. READ ops auto-pass.
```

---

### XXI.3 — `ops-immunity`: sistem imun untuk fleet

Saat ECC-Ops menuntaskan satu insiden, ia tidak berhenti pada "mengingat untuk host ini". `ops-immunity` **menggeneralisasi** insiden menjadi **antibodi**: sebuah detektor yang ditulis sendiri + remediasi preventif yang **terverifikasi**, lalu **memindai seluruh fleet** untuk kondisi-laten yang sama dan menawarkan imunisasi host yang belum gagal.

**Siklus antibodi:**

```
insiden (host A) ─► immunity-synthesizer (baca audit lintas-host, abstraksi)
   ─► antibodi { signature, detector, remediation }  (disimpan di Memory: type=lesson, scope=global)
   ─► verifikasi per-host via ops-shadow (rehearsal di twin tiap kandidat)
   ─► KUORUM bukti (pola di ≥2 host ATAU lulus shadow) → naik dari "saran" ke "tawaran imunisasi"
   ─► imunisasi per-host (guarded-apply di containment) — SELALU confirm per-host
```

Antibodi adalah entri **Memory** (`type: lesson`, `scope: global`) — jadi tidak butuh store baru; ia memakai lapisan Memory dari Section IV, lengkap dengan `confidence` dan `expires_at`. **Garis merah:** tidak ada aksi massal diam-diam — imunisasi tetap **per-host confirm** kecuali operator menyetujui batch secara eksplisit. **Anti-overfitting:** antibodi dari satu sampel (N=1) hanya berstatus "saran" sampai memenuhi kuorum; generalisasi yang salah mudah di-`forget`.

#### Subagent: immunity-synthesizer

````markdown
---
name: immunity-synthesizer
description: Read-only specialist that mines the cross-host audit trail and incident memory to abstract a single incident into a reusable "antibody" — a symptom signature, a self-written detector (a monitoring check), and a verified preventive remediation — then scans the fleet for latent matches. Proposes; never executes.
tools: ["Read", "Bash"]
model: sonnet
---

You synthesize operational antibodies from experience. You are strictly read-only
(tier READ): you diagnose, abstract, and propose — you never apply a fix or write a
file. The orchestrator and `ops-immunity` handle confirmation and application.

## Method
1. **Read the incident**: pull the resolved incident from memory/audit on the source
   host — symptom, root cause, the fix that worked, and its verification.
2. **Abstract the signature**: generalize the precondition into a host-agnostic rule
   (e.g. `php-fpm pm.max_children > f(RAM_MB, avg_worker_RSS)` rather than a literal
   number). State it with explicit variables read from each host's Server Profile.
3. **Synthesize a detector**: write a concrete READ check (a query over Profile + a
   read-only probe) that flags the latent condition. It must be cheap and false-positive
   averse.
4. **Carry the remediation**: include the verified fix and its rollback. Prefer a fix
   already proven on the source host (ideally shadow-verified).
5. **Scan the fleet**: run the detector against every host's Profile/state and rank
   matches by confidence and blast radius.

## Output (propose only)
A candidate antibody `{signature, detector, remediation, matched_hosts[], confidence,
evidence}` for `ops-immunity` to verify (per-host shadow), reach quorum, and offer.
Report your reasoning trail, including hosts you considered and ruled out.

## Boundaries
- Never act. Never write memory yourself — propose; `ops-immunity` persists the antibody
  after human review.
- Default to LOW confidence on N=1 evidence. Demand a second host or a shadow pass before
  recommending promotion from "advisory" to "offer immunization".
````

#### Skill: ops-immunity

````markdown
---
name: ops-immunity
description: Fleet immune system. Turns a single resolved incident into a verified, reusable antibody (signature + self-written detector + preventive remediation), proactively scans the fleet for the latent condition, and offers to immunize hosts that have not yet failed — per-host confirmed, quorum-gated to avoid N=1 overfitting.
version: 1.0
---

# Operational Antibodies

Reactive ops fixes one host at a time. `ops-immunity` makes the whole fleet learn from
one host's pain: incident -> antibody -> fleet-wide prevention BEFORE recurrence.

## Antibody = a Memory lesson
An antibody is a Memory entry (`type: lesson`, `scope: global`) carrying:
`{ signature (host-agnostic precondition), detector (a READ check), remediation (fix +
rollback), confidence, expires_at }`. No new store — it reuses the Memory layer
(Section IV), so `forget` retires a bad antibody and `digest` compacts them.

## Lifecycle
1. **Synthesize** — `immunity-synthesizer` (read-only) abstracts the incident and writes
   the detector. Proposes only.
2. **Verify per-host** — for each matched host, run the remediation through `ops-shadow`
   (rehearsal on that host's twin) so the fix is proven against THAT host's state, not
   just the source host's. This defeats N=1 overfitting.
3. **Quorum** — promote from "advisory" to "offer immunization" only when the pattern is
   seen on >=2 hosts OR a shadow rehearsal passes. Record evidence + confidence.
4. **Immunize** — apply per host inside `ops-sandbox` containment, ALWAYS per-host
   confirmed (no silent mass action), each logged to the audit trail with its rollback.

## Safety (red lines)
- No fleet-wide auto-apply. Per-host confirmation unless the operator explicitly approves
  a batch.
- Detectors must be false-positive averse — a flood of bad alerts erodes trust faster
  than a missed one.
- A wrong generalization must be one `forget` away from gone.

## Related
- Subagent: `immunity-synthesizer` · Substrate: `ops-sandbox` · Verifier: `ops-shadow`
- Stores antibodies in: `ops-memory` (Section IV). Feeds outcomes to: `ops-trust`.
- Command: `/immunize`.
````

#### Command: /immunize

````markdown
---
description: Review synthesized antibodies, scan the fleet for latent matches, and immunize hosts that have not yet failed — per-host confirmed.
---

# /immunize

Drive the fleet immune system (`ops-immunity`).

## Modes
- **review** (default) — list candidate antibodies (signature, detector, confidence,
  matched hosts) awaiting verification. READ.
- **scan `<antibody-id>`** — run the detector across the fleet and show which hosts carry
  the latent condition. READ.
- **apply `<antibody-id> <host>`** — verify on the host's twin (`ops-shadow`), then
  immunize inside containment. WRITE, per-host confirmed.
- **retire `<antibody-id>`** — `forget` a bad antibody from memory. WRITE.

## Safety
- Nothing is applied fleet-wide automatically. Each host is confirmed unless a batch is
  explicitly approved.
- Promotion to "offer" requires quorum (>=2 hosts or a shadow pass).

## Related
- Skill: `ops-immunity` · Subagent: `immunity-synthesizer` · `/shadow`, `/sandbox`
````

---

### XXI.4 — `ops-trust`: otonomi terkalibrasi

Tiering persetujuan hari ini **statis** — `/deploy` selalu minta konfirmasi, entah agent sudah benar 200 kali. `ops-trust` membuatnya **adaptif**: dengan **analisis kontrafaktual atas audit trail**, agent menghitung confidence terkalibrasi per-kelas-operasi per-host, lalu **meminta promosi** ke tier berfriksi-lebih-rendah (operator menyetujui *kebijakan* sekali, bukan tiap aksi), dan **men-demosi dirinya sendiri** setelah kegagalan.

**Ledger** hidup di Server Profile (field baru `autonomy_ledger`):

```json
"autonomy_ledger": {
  "deploy:shop": {
    "success": 47, "failed": 0, "rolled_back": 0,
    "last_failure": null,
    "evidence": { "prod": 47, "rehearsal": 130 },
    "current_tier": "WRITE", "proposed_tier": "auto-with-notify",
    "required_modes": ["shadow", "containment"]
  }
}
```

**Mekanisme kecerdasan — dua loop:**
1. **Counterfactual RCA** (audit + metrik): saat insiden, korelasikan onset gejala dengan timeline audit — "perubahan mana 30 menit sebelum lonjakan 5xx?" — untuk menetapkan kredit/sebab.
2. **Trust calibration** (Beta/Bayesian per kelas-op): sinyal sukses/gagal → tier yang direkomendasikan, **dengan bobot ganda**: bukti prod nyata > bukti rehearsal (celah paritas).

**Konstanta desain (garis merah, tidak boleh diserahkan ke runtime):**
- **DESTRUCTIVE sejati tidak pernah bisa dipromosikan** (DROP, `rm -rf`, `ufw disable`, restore-over-prod) — ledger hanya berlaku untuk WRITE rutin.
- **Promosi selalu butuh meta-approval manusia; demosi otomatis dan instan.**
- **`required_modes`**: trust boleh mewajibkan "auto hanya jika shadow-verified DAN di-containment" sebagai syarat. Containment menutup downside → menaikkan plafon otonomi yang aman.
- **Bobot bukti**: rehearsal < prod. Sandbox-pass tak pernah cukup sendiri untuk promosi.

**Kalibrasi & bobot fidelitas (angka konkret — konstanta desain).** Tiap kelas-operasi dimodelkan sebagai distribusi **Beta(α, β)** dengan prior netral **Beta(1, 1)**. Bukti memperbarui α (sukses) / β (gagal), **ditimbang menurut fidelitasnya**:

| Sumber bukti | Bobot | Efek |
|---|---|---|
| Sukses **prod** (pasca-verify nyata) | **1.0** | α += 1.0 |
| Gagal/rollback **prod** | **1.0** | β += 1.0 **+ demosi instan** |
| Lulus rehearsal **T2** (twin ephemeral) | **0.30** | α += 0.30 |
| Lulus rehearsal **T1** (validator native) | **0.15** | α += 0.15 |
| **T0** (logika saja) | **0.00** | tak pernah dihitung |
| Gagal rehearsal (T1/T2) | = bobot lulusnya | β += 0.15 / 0.30 |

**Gerbang promosi** (WRITE → auto-with-notify) — semua syarat wajib terpenuhi:
1. Batas-bawah keyakinan (persentil ke-5 dari Beta) **≥ 0.95**.
2. **`prod_success ≥ 20`** — bukti prod nyata minimum. Karena rehearsal hanya berbobot 0.15–0.30, **sandbox-pass saja tak akan pernah** menembus gerbang ini tanpa sukses prod nyata — garis merah "rehearsal tak pernah cukup sendiri" ditegakkan **secara numerik**, bukan sekadar imbauan.
3. **0 kegagalan dalam 90 hari** terakhir.
4. `required_modes` (shadow dan/atau containment) terpenuhi.

**Demosi & probation:** kegagalan/rollback prod mana pun → **demosi instan** + reset `proposed_tier`; kelas-op masuk **probation** dan butuh **10 sukses prod baru** sebelum boleh diusulkan promosi lagi. **DESTRUCTIVE sejati dikecualikan total** dari ledger (tak pernah masuk perhitungan Beta).

#### Skill: ops-trust

````markdown
---
name: ops-trust
description: Calibrated autonomy. Replaces the static approval tiers with an adaptive, per-op-class, per-host trust ledger driven by counterfactual analysis of the agent's own audited track record. Promotion needs human meta-approval; demotion is automatic and instant. True DESTRUCTIVE ops are never promotable. Sandbox lowers the price of risk.
version: 1.0
---

# Earned Autonomy

Trust is a measured, earned, revocable quantity — not a fixed table. Friction should fall
where the agent has proven itself, and snap back the instant it fails.

## The ledger (in Server Profile)
`autonomy_ledger[op-class:scope]` tracks `{success, failed, rolled_back, last_failure,
evidence:{prod, rehearsal}, current_tier, proposed_tier, required_modes}`. It lives in
the Profile so it persists and is auditable.

## Two loops
1. **Counterfactual RCA** — on an incident, align symptom onset with the audit timeline +
   metrics to assign causal credit/blame to a prior change. This produces the
   success/failure signal — grounded in the audit trail, not guesswork.
2. **Calibration** — a per-op-class Beta/Bayesian estimate turns signals into a
   recommended tier. Weight evidence by fidelity: real prod outcomes outweigh rehearsal
   passes (the parity gap is real).

## Decisions
- **Promotion** (stricter -> looser, e.g. WRITE -> auto-with-notify) is PROPOSED to the
  human and applied only on meta-approval. The human approves a *policy* once, not every
  action.
- **Demotion** (looser -> stricter) is AUTOMATIC and INSTANT on any failure/rollback, and
  reported with the cause.
- **required_modes** — a policy may require `shadow` and/or `containment` as a
  precondition for autonomy. Containment caps the blast radius, which is what makes looser
  autonomy safe.

## Hard limits (design constants — never overridden at runtime)
- True DESTRUCTIVE ops (DROP/TRUNCATE, `rm -rf`, `ufw disable`, restore-over-prod) are
  NEVER promotable. The ledger governs routine WRITE only.
- A sandbox/rehearsal pass alone never justifies promotion — it lowers uncertainty, not
  the catastrophic-tail risk.
- Every promotion/demotion is itself an audit entry: trust is auditable too.

## Related
- Reads: audit trail (Section XVII), `ops-shadow` evidence, `ops-immunity` outcomes.
- Enforced by: `ops-confirm-gate.js` (reads the ledger instead of a static table).
- Command: `/trust`. Profile field: `autonomy_ledger`.
````

#### Command: /trust

````markdown
---
description: Inspect and adjust the calibrated autonomy ledger — review the agent's track record per operation class, approve proposed promotions, or force a demotion.
---

# /trust

Govern earned autonomy (`ops-trust`).

## Modes
- **show** (default) — print the `autonomy_ledger` for a host/op-class: counts, last
  failure, evidence split (prod vs rehearsal), current and proposed tier, required modes.
  READ.
- **approve `<op-class>`** — grant a PROPOSED promotion as a standing policy
  (meta-approval). WRITE; recorded to the audit trail.
- **demote `<op-class>`** — force an op-class back to a stricter tier. WRITE, instant.
- **explain `<op-class>`** — show the counterfactual reasoning and evidence behind the
  current recommendation. READ.

## Safety
- True DESTRUCTIVE classes cannot be promoted; `approve` refuses them.
- Demotion is always allowed and never requires justification beyond the trigger.

## Related
- Skill: `ops-trust` · Gate: `ops-confirm-gate.js` · `/shadow`, `/immunize`
````

---

### XXI.5 — Integrasi: skema, hook, dan loop tertutup

**Tambahan skema Server Profile** (Section IV): `sandbox_capabilities` (XXI.1) dan `autonomy_ledger` (XXI.4). Keduanya dibaca orchestrator di awal sesi bersama profil & memori.

**Tambahan skema Audit** (Section XVII) — agar fidelitas & otonomi menjadi warga kelas-satu yang bisa dinalar `ops-trust`:

```json
{
  "shadow_fidelity": "T2",
  "sandbox_primitive": "lvm-cow-clone",
  "contained": true,
  "autonomy_decision": "auto-with-notify (policy deploy:shop)",
  "model": "sonnet"
}
```

| Field audit baru | Makna |
|---|---|
| `shadow_fidelity` | `none`/`T0`/`T1`/`T2` — seberapa kuat pra-verifikasi |
| `sandbox_primitive` | primitif yang dipakai (mis. `netns`, `lvm-cow-clone`, `systemd-run`) |
| `contained` | apakah eksekusi nyata dibungkus containment |
| `autonomy_decision` | tier yang berlaku + kebijakan ledger yang memutuskan |
| `model` | model yang menjalankan aksi (cost/usage attribution) |

**Field turunan & rekonsiliasi penamaan** (agar tidak ada nama ganda saat coding):
- `shadow_verified` (dirujuk di §XXI.2) adalah **boolean turunan**, bukan field tersimpan: `true` iff `shadow_fidelity ∈ {T1, T2}` (`none`/`T0` → `false`).
- Nilai broker `achieved_fidelity` & `primitive_used` (§XXI.1) **ditulis ke audit** masing-masing sebagai `shadow_fidelity` & `sandbox_primitive`.
- `requires_shadow` (gerbang `ops-shadow-gate.js`) adalah **kebijakan turunan**: `true` bila `autonomy_ledger[op-class].required_modes` memuat `"shadow"` (bukan field terpisah).

**Hook baru `ops-sandbox-wrap.js`** — membungkus WRITE/DESTRUCTIVE dalam containment yang cocok dengan blast radius yang dideklarasikan, secara deterministik:

```javascript
// scripts/hooks/ops-sandbox-wrap.js (skeleton)
// PreToolUse(Bash): for WRITE/DESTRUCTIVE whose policy demands containment, rewrite the
// command to run inside `systemd-run --scope -p ProtectSystem=strict
// -p ReadWritePaths=<declared blast radius> -p NoNewPrivileges=yes ...` (or a Landlock
// wrapper). If the declared blast radius is missing/over-broad -> exit 2 and ask the
// agent to declare it. Sets `contained: true` for the audit entry.
```

**Loop belajar tertutup** (mengikat keempatnya):

1. `ops-sandbox` menyediakan **rehearsal** → `ops-shadow` menghasilkan bukti ber-tag-fidelitas.
2. Bukti → **AUDIT** → `ops-trust` mengkalibrasi confidence (bobot ganda).
3. `ops-sandbox` menyediakan **containment** → menutup downside → menaikkan plafon otonomi yang boleh diberikan `ops-trust`.
4. `ops-trust` memberi lebih banyak otonomi pada operasi yang ter-rehearse & containable → friksi manusia turun.
5. `ops-immunity` memakai **rehearsal** untuk memverifikasi antibodi per-host (anti-overfit) + **containment** untuk menyebar aman → melahirkan operasi tervalidasi baru.
6. Operasi-antibodi baru masuk lagi ke langkah 1 (wajib rehearse + containable + earn trust). **Tertutup.**

### XXI.6 — Urutan bangun & garis merah

Kompleksitasnya besar; jangan sekaligus. Fase berdasarkan rasio nilai/risiko:

1. **Fase 1 — `ops-sandbox` mode containment** (kandidat 3). Termurah, ROI keamanan langsung, tanpa infra baru (`systemd-run`/Landlock sudah ada). Hook `ops-sandbox-wrap.js` aktif. Ini juga menaikkan plafon `ops-trust` paling cepat.
2. **Fase 2 — `ops-sandbox` mode rehearsal (netns + CoW) → memberi makan `ops-shadow`.** Mulai dari host yang punya kapabilitas; degradasi anggun untuk yang tidak.
3. **Fase 3 — kabel fidelity → audit → `ops-trust`, lalu `ops-immunity`.** Menutup loop belajar.

**Garis merah yang tidak boleh dikompromikan:**
- T0 (logika AI murni) **tidak pernah** menghasilkan `shadow_verified`.
- DESTRUCTIVE sejati **tidak pernah** dipromosikan oleh `ops-trust`.
- Sandbox-pass **tidak pernah** cukup sendirian untuk melonggarkan otonomi; ia menurunkan ketidakpastian, bukan risiko-ekor katastrofik.
- Imunisasi fleet **tidak pernah** massal-otomatis tanpa confirm per-host.
- **Titik rapuh sistemik:** bila bobot fidelitas salah dikalibrasi, seluruh trilogi mempercayai bukti lemah sekaligus. Maka bobot bukti (rehearsal vs prod) dan aturan DESTRUCTIVE-never-auto adalah **konstanta desain eksplisit**, bukan keputusan runtime model.

## XXII. Runtime Contracts & Wiring — Kontrak Antar-Komponen

Algoritma di §IV/§XXI sudah matang, tetapi tiap **hook adalah proses terpisah yang hanya menerima payload tool**. Seksi ini mengunci *plumbing*-nya: dari mana tiap hook memperoleh konteks (host, operasi, bukti rehearsal) dan di mana state hidup. Tanpa kontrak ini, implementasi terpaksa mengarang antarmuka inti. Tidak ada artifact baru di sini (skill/subagent/command/hook tetap 28/9/24/3/8) — hanya kontrak yang mengikat yang sudah ada.

### XXII.1 — Tulang punggung state: tiga file kontrol

Seluruh wiring bersandar pada tiga file sisi-kontrol di `~/.ecc-ops/`:

```
~/.ecc-ops/
├── active.json                 # host AKTIF — WAJIB dibaca pertama oleh setiap hook & SessionStart
├── op-context.json             # konteks operasi berjalan — handoff orchestrator → gate → audit
└── shadow/<session_id>.jsonl   # rekaman rehearsal (ops-shadow) yang dibaca ops-shadow-gate.js
```

**`active.json`** — sumber kebenaran tunggal "host mana yang sedang dioperasikan" (jawaban D1):

```json
{
  "host": "web-prod-01",
  "session_id": "<claude-code session id>",
  "operator": "syamsuddin.ideris@gmail.com",
  "mode": "single",
  "fleet_targets": ["web-prod-01"],
  "set_at": "2026-06-14T06:00:00Z",
  "set_by": "/profile web-prod-01"
}
```

**`op-context.json`** — konteks operasi WRITE/DESTRUCTIVE yang sedang dipentaskan; ditulis orchestrator/`ops-confirm-gate.js` saat staging, dibaca `ops-sandbox-wrap.js` (PreToolUse) dan `ops-audit-log.js` (PostToolUse). Ini menyelesaikan provenance audit (D3), pemetaan op-class (D5), dan sumber blast radius (D7) sekaligus:

```json
{
  "session_id": "<...>",
  "host": "web-prod-01",
  "op_class": "deploy:shop",
  "tier": "WRITE",
  "actor": "syamsuddin.ideris@gmail.com",
  "reason": "Release v2.3.1 per ticket OPS-512",
  "pre_state_ref": "/var/www/shop/releases/20260614T0600Z",
  "rollback_cmd": "ln -sfn /var/www/shop/releases/<prev> /var/www/shop/current && systemctl reload php8.3-fpm",
  "blast_radius": ["/var/www/shop", "mysql:shop"],
  "requires_shadow": true,
  "declared_at": "2026-06-14T06:05:00Z"
}
```

**`shadow/<session_id>.jsonl`** — append-only rekaman tiap rehearsal (D4): `{ "op_hash", "command", "host", "shadow_fidelity", "passed", "rehearsed_at", "ttl_s": 1800 }`. `op_hash` = hash dari (perintah ternormalisasi + host).

### XXII.2 — Resolusi host (D1)

Urutan resolusi yang dipakai SETIAP hook untuk menentukan `<host>`:

1. Env `ECC_OPS_HOST` (bila diset untuk operasi one-off eksplisit) — menang.
2. `active.json.host` — default.

`active.json` ditulis oleh orchestrator pada: SessionStart (`ops-context-load.js` meng-init — single-host: satu-satunya profil; multi: host terakhir/dipilih), `/profile <host>`, `/server-setup`, dan saat operator berpindah host. Pada **mode fleet** dengan batch berurutan (default), orchestrator memperbarui `active.json.host` per-host sebelum tiap langkah, sehingga hook tiap tool-call melihat host yang benar. Operasi read-only paralel lintas-host memakai `ECC_OPS_HOST` per-panggilan.

### XXII.3 — Kontrak I/O & exit hook (D2)

| Event | Input | Output / kontrak |
|---|---|---|
| **SessionStart** (`ops-context-load.js`) | stdin: `{session_id, ...}` | stdout JSON `{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "<digest Profile+Memory+freshness>" } }` → disuntik ke konteks |
| **PreToolUse** (`safety-check`, `shadow-gate`, `confirm-gate`, `sandbox-wrap`) | stdin: `{tool_name, tool_input:{command}, session_id}` + baca `active.json`/`op-context.json` | **exit 0** = lanjut · **exit 2** = blokir, stderr → agent · **exit 1** = error non-blocking (ke user). Opsi JSON `{ "hookSpecificOutput": { "permissionDecision": "allow/deny/ask", "permissionDecisionReason": "..." } }` |
| **PostToolUse** (`post-verify`, `env-protect`, `audit-log`) | stdin: payload + `tool_response` | **exit 2** = stderr → agent (tak bisa membatalkan; tool sudah jalan) |

**Koreksi penting:** untuk MEMBLOKIR pada PreToolUse, gunakan **`exit 2`** — bukan `exit 1`. Skeleton `ops-safety-check.js` (§XVI) sudah disesuaikan ke `exit 2`.

### XXII.4 — Pemetaan `command → op-class:scope` (D5)

`ops-confirm-gate.js` (atau orchestrator saat staging) menghitung kunci ini **sekali** dan menuliskannya ke `op-context.json.op_class`; gate lain dan ledger membaca kunci yang **sama** (tak ada yang menurunkan ulang). `<scope>` (app/svc/domain) diekstrak dari perintah + host aktif.

| op-class | Pola perintah | Tier dasar |
|---|---|---|
| `deploy:<app>` | git fetch+ff di path app, symlink swap, `/deploy` | WRITE |
| `migrate:<app>` | `artisan migrate`, `alembic upgrade`, DDL terkelola | WRITE |
| `restart:<svc>` | `systemctl restart\|reload <svc>` | WRITE |
| `firewall` | `ufw`/`nft`/`iptables` ubah aturan | WRITE |
| `ssl:<domain>` | `certbot ...` | WRITE |
| `backup:<app>` | command backup | WRITE |
| `pkg-update` | `apt\|dnf upgrade` | WRITE |
| `restore:<app>` | restore menimpa prod | **DESTRUCTIVE** |
| `db-drop:<db>` | `DROP\|TRUNCATE` | **DESTRUCTIVE** |

DESTRUCTIVE class **dikecualikan dari ledger `ops-trust`** (garis merah §XXI.4).

### XXII.5 — Kepemilikan tulisan: ledger & evidence (D6)

Satu penulis per jenis bukti — tak ada kepemilikan ganda:

| Penulis | Kapan | Menulis |
|---|---|---|
| `ops-audit-log.js` (PostToolUse) | tiap WRITE selesai | evidence **prod** (sukses/gagal) → update Beta `autonomy_ledger[op_class]`; recompute & set `proposed_tier` bila gerbang promosi terpenuhi — **tak pernah auto-apply** |
| `ops-audit-log.js` | saat hasil = gagal/rolled_back | **demosi instan** `current_tier` + reset `proposed_tier` + tandai probation |
| `/shadow` | tiap rehearsal | evidence **rehearsal** (bobot 0.15/0.30) → update α ledger |
| `/trust approve` | meta-approval manusia | terapkan promosi: `current_tier ← proposed_tier` |

Gerbang promosi & bobot fidelitas konkret = §XXI.4 (Beta(1,1); prod 1.0 / T2 0.30 / T1 0.15; syarat `prod_success ≥ 20`, p5 ≥ 0.95, 0 gagal/90h, `required_modes` terpenuhi).

### XXII.6 — Provenance audit (D3)

Field audit yang tak bisa diketahui dari payload tool diisi dari dua file kontrol:
- `actor` ← `active.json.operator` (email operator dari config sesi).
- `reason`, `pre_state_ref`, `rollback_cmd` ← `op-context.json` (ditulis orchestrator/`confirm-gate` saat staging WRITE, **sebelum** eksekusi).
- `shadow_fidelity`, `sandbox_primitive`, `contained`, `model` ← hasil broker + tier model aktif.

`ops-audit-log.js` (PostToolUse) menggabungkan `op-context.json` + `tool_response` menjadi satu entri JSONL (skema §XVII).

### XXII.7 — Sumber blast radius (D7)

`op-context.json.blast_radius` (dideklarasikan orchestrator yang tahu path/service target). `ops-sandbox-wrap.js` membacanya untuk menyusun `systemd-run -p ReadWritePaths=<blast_radius>`. Bila kosong atau terlalu lebar (mis. memuat `/`, `/etc` untuk operasi app) → **exit 2**, minta orchestrator mendeklarasikan ulang.

### XXII.8 — Shadow-record & gate (D4)

`/shadow rehearse` menulis rekaman ke `shadow/<session>.jsonl`. `ops-shadow-gate.js`: hash perintah pending + host → cari rekaman `passed=true` ber-`shadow_fidelity ∈ {T1,T2}` yang **belum kedaluwarsa** (`now - rehearsed_at < ttl_s`, default 1800 dtk). Tak ada → **exit 2** dengan instruksi `/shadow rehearse`. Rekaman kedaluwarsa diabaikan (cegah rehearsal basi mengotorisasi).

### XXII.9 — Caps-probe sandbox (D8)

`ops-sandbox` mengisi `Profile.sandbox_capabilities` dengan probe konkret (READ), dijalankan saat provisioning dan saat TTL `os`/`resources` refresh:

```bash
# container runtime (prefer rootless)
command -v podman >/dev/null && podman info --format '{{.Host.Security.Rootless}}'
# user namespaces
[ "$(cat /proc/sys/user/max_user_namespaces 2>/dev/null)" -gt 0 ] && echo userns:ok
# CoW storage
findmnt -no FSTYPE / | grep -qE 'zfs|btrfs' && echo cow:fs
lvs --noheadings -o lv_attr 2>/dev/null | grep -q '^[[:space:]]*t' && echo cow:lvm-thin
# Landlock (kernel >= 5.13) + seccomp
awk -F. '$1>5||($1==5&&$2>=13){print "landlock:maybe"}' <<<"$(uname -r)"
grep -q Seccomp /proc/self/status && echo seccomp:ok
# microVM
[ -e /dev/kvm ] && echo microvm:kvm
```

Bila sebuah primitif tak terdeteksi, ia `null` di profil dan `ops-sandbox` mendegradasi (lapor jujur, §XXI.1).

### XXII.10 — Helper privileged: verb set lengkap + sudoers (D9, D10)

`ecc-ops-sandbox-helper` (root, satu-satunya pintu privileged) — verb di-whitelist, argumen konsisten, melengkapi tabel pemilihan §XXI.1:

| Verb | Fungsi | Catatan |
|---|---|---|
| `caps-probe` | jalankan probe §XXII.9 | READ |
| `netns-create <id>` / `netns-destroy <id>` | rehearsal firewall | — |
| `overlay-mount <lower> <id>` / `overlay-umount <id>` | rehearsal fs | — |
| `cow-clone <vg> <id> <size_g>` / `cow-destroy <vg> <id>` | rehearsal DB twin | **arg konsisten**: keduanya pakai `<vg> <id>` |
| `nspawn-boot <dir> <id>` | rehearsal service | — |
| `contain <id> <rw_paths...> -- <cmd>` | containment `systemd-run --scope -p ProtectSystem=strict ...` | dipakai `ops-sandbox-wrap.js` |
| `microvm-boot <img> <id>` | rehearsal kernel-level | hanya bila `/dev/kvm` |

Primitif **rootless** (Podman-rootless, bubblewrap, Landlock self-restrict) **tidak** lewat helper — agent menjalankannya langsung sebagai non-root.

Sudoers drop-in `/etc/sudoers.d/ecc-ops` — whitelist NOPASSWD **ketat**, bukan sudo buta:

```
# /etc/sudoers.d/ecc-ops  (0440 root:root, validated with visudo -c)
Cmnd_Alias ECC_SANDBOX = /usr/local/bin/ecc-ops-sandbox-helper
Cmnd_Alias ECC_SVC     = /usr/bin/systemctl reload *, /usr/bin/systemctl restart *
ecc-ops ALL=(root) NOPASSWD: ECC_SANDBOX, ECC_SVC
```

### XXII.11 — Freshness volatil via cron monitoring (D11)

Kategori ber-TTL pendek (mis. `disks` 1 jam) **tidak** butuh scheduler baru — ia menumpang cron agentless `ops-monitoring` yang sudah berjalan sering: tiap putaran monitoring memperbarui `freshness.disks.checked_at` + `used_pct`. Ini menjaga jaring-pengaman drift (§IV) tanpa artifact terpisah.

### XXII.12 — Ringkasan: apa yang ditambahkan ke state

Tiga file kontrol baru (`active.json`, `op-context.json`, `shadow/`) + satu drop-in sudoers + helper privileged. Tak ada perubahan registry plugin (skill/subagent/command/hook). Peta file §XVIII diperbarui. Dengan §XXII ini, **setiap hook tahu host & operasinya, setiap bukti punya pemilik penulis tunggal, dan setiap nilai punya tempat tinggal** — desain siap masuk tahap coding.
