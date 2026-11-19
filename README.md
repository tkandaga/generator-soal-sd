# Generator Soal SD

Pembuat perangkat asesmen SD (Kurikulum Merdeka, kelas 1–6) untuk Matematika, Bahasa Indonesia, IPA, dan IPS.
Hasilnya 3 file DOCX: **kisi-kisi** (elemen/fase, TP, KKTP, indikator, nomor soal), **naskah soal** (kop, identitas, soal + gambar), dan **kunci jawaban & rubrik penilaian**.

## Versi web (`web/`)
Berjalan sepenuhnya di browser — tanpa server. AI dipanggil langsung dengan API key milik pengguna
(Google Gemini, Anthropic Claude, atau OpenAI); key hanya tersimpan di browser pengguna.
Situs di-deploy otomatis ke GitHub Pages setiap ada perubahan di folder `web/`.

## Versi lokal (Python)
`./jalankan.sh` lalu buka http://127.0.0.1:5055 (khusus Claude, butuh `rsvg-convert`).
