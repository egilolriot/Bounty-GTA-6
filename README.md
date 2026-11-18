# Porto Sol

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-gta6--01-orange)](https://make.fun/bounty/gta6-01)
[![make.fun leaderboard](https://img.shields.io/badge/make.fun-leaderboard-gta6--01-blue)](https://make.fun/bounty/gta6-01)
[![make.fun entry](https://img.shields.io/badge/make.fun-entry-gta6--01-green)](https://make.fun/bounty/gta6-01)

**Bounty:** [gta6-01 — Porto Sol](https://make.fun/bounty/gta6-01)
**Referral:** `zegsd6t5` — https://make.fun/r/zegsd6t5

## Deskripsi

**Porto Sol** adalah game open-world bergaya GTA yang berjalan langsung di browser. Kamu bermain sebagai **Jax Marlowe**, yang baru keluar dari penjara dan kembali ke kota pelabuhan Porto Sol — kota 720 × 720 meter yang hidup dengan lalu lintas, pejalan kaki, dan patroli polisi. Bersama **Mara Voss**, Jax harus menyelesaikan satu pekerjaan terakhir: lima misi yang makin berbahaya, dari sekadar menjemput paket sampai merampok konvoi di pelabuhan.

Jelajahi kota dengan berjalan kaki atau curi mobil di jalan, hindari kejaran polisi saat bintang wanted naik, dan jaga nyawamu — kalau kesehatanmu habis, permainan berakhir. Semua misi, kota, lalu lintas, dan pejalan kaki dibuat prosedural dengan seed tetap (`1337`), jadi setiap permainan dimulai dari kota yang sama.

Dibangun dengan Three.js (ES modules, tanpa dependensi jaringan) dan bisa dimainkan offline setelah file game disajikan secara lokal.

## Kontrol

| Tombol | Aksi |
| --- | --- |
| W / A / S / D | Bergerak / mengemudi |
| Shift | Lari |
| E | Masuk / keluar mobil |
| F atau klik mouse | Tembak |
| P atau Esc | Pause |
| R | Restart |
| M | Mute |

HUD menampilkan nyawa, uang, skor, bintang wanted, misi aktif, pesan, kecepatan, dan minimap kota.

## Misi

Selesaikan kelima misi bersama Mara untuk memenangkan permainan. Setiap misi memberi hadiah uang tunai:

1. **First Wheels** — Curi mobil, lalu antar ke garasi Mara. Hadiah: **$500**.
2. **Harbor Lights** — Ambil paket di pelabuhan dan antar ke dermaga utara. Hadiah: **$800**.
3. **Street Heat** — Kabur dari kejaran polisi saat wanted naik ke 2 bintang. Hadiah: **$1.200**.
4. **The Exchange** — Antar koper ke titik tukar selagi wanted. Hadiah: **$2.500**.
5. **Sunset Run** — Capai mercusuar dengan wanted 3 bintang, lalu lolos. Hadiah: **$5.000**.

Total hadiah misi: **$10.000**. Semakin tinggi bintang wanted, semakin banyak mobil polisi yang mengejarmu — selesaikan misi secepat dan sebersih mungkin.

## Cara menjalankan

```bash
# Sajikan game secara lokal (port 8080)
node --experimental-strip-types serve.ts
# lalu buka http://localhost:8080/
```

Atau sajikan folder `game/` dengan server statis apa pun dan buka `index.html`.

## Build dossier (make.fun)

```bash
MAKEFUN_OUTPUT_DIR=/output node --experimental-strip-types main.ts
```

Perintah di atas menyalin `game/` (dan `screenshots/` bila ada) ke output, lalu membangun `dossier.json` dengan helper dari starter kit (`vendor/makefun-game.ts`).

## Teknologi

- Three.js (ES modules, file lokal di `game/vendor/`)
- JavaScript + TypeScript (Node 22, stdlib saja untuk `main.ts` dan `serve.ts`)
- Tanpa request jaringan saat bermain: semua aset dimuat dari file lokal
