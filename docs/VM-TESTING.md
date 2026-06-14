# LOGEN — Panduan Uji di VM Throwaway

`npm test` (42) dan `npm run dry-run` (18) sudah membuktikan **logika** hook/lib di mesin mana pun. Tapi sebagian perilaku LOGEN hanya bisa dibuktikan di **Linux nyata dengan systemd**:

- validator native (`nginx -t`, `sshd -t`) benar-benar jalan → `ops-shadow` T1 PASS/FAIL asli;
- **containment `systemd-run` yang benar-benar mengurung** (ProtectSystem=strict + ReadWritePaths);
- `caps-probe` mendeteksi primitif (namespaces, seccomp, Landlock, CoW);
- pipeline melawan `systemctl` & service hidup.

> ⚠️ **Wajib VM ber-systemd asli** (Multipass / Lima / cloud VM). **Bukan** container Docker biasa (tak ada systemd). Dan **jangan** pakai server produksi — ini host sekali-pakai.

---

## 1. Prasyarat (di Mac)

[Multipass](https://multipass.run) — VM Ubuntu ringan dengan systemd, paling mudah di macOS:

```bash
brew install --cask multipass
```

*(Alternatif: Lima, Vagrant+VirtualBox, atau VM cloud throwaway — apa pun yang memberi Ubuntu/Debian + systemd + akses sudo.)*

## 2. Quick start — uji otomatis (host-side)

```bash
# 2a. Buat VM throwaway
multipass launch 24.04 --name logen-test --cpus 2 --memory 2G --disk 10G
multipass shell logen-test

# 2b. (DI DALAM VM) — clone, bootstrap, uji
git clone https://github.com/Syamsuddin/ECC-OPS.git ~/logen
bash ~/logen/tools/vm-bootstrap.sh      # node + nginx + helper
bash ~/logen/tools/vm-test.sh           # validasi host-side (A–E)
exit

# 2c. (KEMBALI DI MAC) — bongkar
multipass delete logen-test && multipass purge
```

**Menguji perubahan lokal yang belum di-push?** Ganti langkah clone dengan transfer dari Mac:

```bash
multipass transfer -r /Users/syams/PROJECTS/ECC-OPS logen-test:logen
# lalu di dalam VM: bash ~/logen/tools/vm-bootstrap.sh ~/logen && bash ~/logen/tools/vm-test.sh ~/logen
```

### Yang divalidasi `vm-test.sh`

| Seksi | Membuktikan |
|---|---|
| **A** Native validators | `ops-shadow` rehearse menjalankan `nginx -t` asli → **T1 PASS** (config valid) / **T1 FAIL** (config rusak) |
| **B** caps-probe | `lib/sandbox` + helper mendeteksi primitif Linux nyata |
| **C** Containment | `logen-sandbox-helper contain`: tulis ke path **diizinkan** sukses, tulis ke `/etc` **DIBLOKIR** oleh `ProtectSystem=strict`, dan helper **menolak `rw=/`** meski dipanggil langsung sebagai root |
| **D** Pipeline service | `ops-post-verify` diam saat nginx aktif, **WARNING** saat service tak aktif |
| **E** Cross-platform | `npm test` (42) + `npm run dry-run` (18) hijau di Linux |

Output diakhiri `N passed, 0 failed`. Bila ada `✗`, pesannya menunjuk file `/tmp/lg-*` untuk detail.

---

## 3. Uji penuh interaktif via Claude Code (lapisan terdalam — opsional)

Validasi otomatis di atas menutup kode host-side. Untuk menguji **skill & command prosa** (`/server-setup`, `/deploy`, dst.) secara nyata, jalankan Claude Code dengan plugin LOGEN **menargetkan VM throwaway** ini (aman — VM sekali-pakai, jadi operasi WRITE/DESTRUCTIVE pun boleh dijalankan sungguhan).

**Opsi A — Claude Code di dalam VM** (paling sederhana; agent & host sama):

```bash
# di dalam VM: pasang Claude Code, autentikasi, lalu tambahkan plugin LOGEN
#   (arahkan Claude Code ke ~/logen — skills/agents/commands/rules/hooks ditemukan otomatis)
# kemudian, dalam sesi Claude Code:
/profile vm01            # discovery localhost → Server Profile terisi
/server-setup            # provisioning baseline di VM ini (aman)
/dns-setup · /ssl-setup  # bila menguji domain (butuh DNS nyata)
/deploy                  # deploy sample app; amati tier + audit + rollback
/health-check · /security-audit · /ops-doctor
```

**Opsi B — Claude Code di Mac, target VM via SSH** (mode kontrol-jarak-jauh): konfigurasi LOGEN/agent untuk menjalankan perintah di VM lewat SSH (`multipass info logen-test` memberi IP; tambahkan ke `~/.ssh/config`). Cocok untuk meniru topologi fleet.

**Checklist verifikasi manual saat sesi interaktif:**

- [ ] SessionStart menyuntik ringkasan host + memori (cek konteks awal).
- [ ] Operasi READ jalan otomatis; WRITE minta konfirmasi + tampilkan rollback; DESTRUCTIVE minta token + bukti backup.
- [ ] `~/.logen/audit/<host>.jsonl` bertambah tiap WRITE (who/what/when/why + rollback).
- [ ] `/deploy` gagal → **auto-rollback** + health kembali hijau.
- [ ] `/shadow rehearse` menghasilkan T1 PASS untuk perubahan config; `ops-shadow-gate` memblok op `requires_shadow` tanpa rehearsal.
- [ ] Promosi `/trust` butuh persetujuan; DESTRUCTIVE ditolak.
- [ ] `.env` otomatis jadi `640`; perintah katastrofik (`rm -rf /*`, `ufw disable`) diblok keras.

---

## 4. Teardown & keamanan

```bash
multipass delete logen-test && multipass purge      # hapus VM sepenuhnya
```

- VM ini **sekali-pakai** — boleh dirusak; jangan pasang data nyata.
- Jangan pernah arahkan uji interaktif ke server produksi (mis. SIMURU). Gunakan VM/klon staging.
- Setelah lulus uji VM, LOGEN siap dipakai pada host nyata dengan keyakinan bahwa lapisan host-dependent (validator, containment, pipeline) berfungsi sebagaimana dirancang.
