"""Pemanggilan Claude untuk menyusun soal dan menggambar ilustrasi (SVG)."""
import json
import re
from concurrent.futures import ThreadPoolExecutor

import anthropic

MODEL = "claude-opus-5-5"
BETAS = ["server-side-fallback-2026-07-01"]

BENTUK = {
    "pg": "Pilihan Ganda",
    "pg_kompleks": "Pilihan Ganda Kompleks",
    "benar_salah": "Benar-Salah",
    "menjodohkan": "Menjodohkan",
    "isian": "Isian Singkat",
    "uraian": "Uraian",
}

MAPEL = {
    "matematika": "Matematika",
    "bahasa_indonesia": "Bahasa Indonesia",
    "ipa": "IPA (Ilmu Pengetahuan Alam)",
    "ips": "IPS (Ilmu Pengetahuan Sosial)",
}


def fase_dari_kelas(kelas: int) -> str:
    return "A" if kelas <= 2 else ("B" if kelas <= 4 else "C")


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["capaian_pembelajaran", "tujuan_pembelajaran", "soal"],
    "properties": {
        "capaian_pembelajaran": {"type": "string"},
        "tujuan_pembelajaran": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kode", "elemen", "deskripsi", "kktp"],
                "properties": {
                    "kode": {"type": "string"},
                    "elemen": {"type": "string"},
                    "deskripsi": {"type": "string"},
                    "kktp": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "soal": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "bentuk", "kode_tp", "indikator_soal", "level_kognitif",
                    "tingkat_kesulitan", "stimulus", "pertanyaan", "opsi",
                    "opsi_kanan", "kunci", "pembahasan", "rubrik", "skor_maks",
                    "perlu_gambar", "deskripsi_gambar",
                ],
                "properties": {
                    "bentuk": {"type": "string", "enum": list(BENTUK)},
                    "kode_tp": {"type": "string"},
                    "indikator_soal": {"type": "string"},
                    "level_kognitif": {"type": "string", "enum": ["C1", "C2", "C3", "C4", "C5", "C6"]},
                    "tingkat_kesulitan": {"type": "string", "enum": ["mudah", "sedang", "sulit"]},
                    "stimulus": {"type": "string"},
                    "pertanyaan": {"type": "string"},
                    "opsi": {"type": "array", "items": {"type": "string"}},
                    "opsi_kanan": {"type": "array", "items": {"type": "string"}},
                    "kunci": {"type": "array", "items": {"type": "string"}},
                    "pembahasan": {"type": "string"},
                    "rubrik": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["kriteria", "skor"],
                            "properties": {
                                "kriteria": {"type": "string"},
                                "skor": {"type": "integer"},
                            },
                        },
                    },
                    "skor_maks": {"type": "integer"},
                    "perlu_gambar": {"type": "boolean"},
                    "deskripsi_gambar": {"type": "string"},
                },
            },
        },
    },
}

SYSTEM_SOAL = """Anda adalah guru SD berpengalaman dan pengembang asesmen Kurikulum Merdeka (Capaian Pembelajaran sesuai Keputusan Kepala BSKAP No. 032/H/KR/2024). Tugas Anda menyusun perangkat asesmen tertulis yang siap dipakai di kelas.

Pembagian fase: Fase A = kelas 1–2, Fase B = kelas 3–4, Fase C = kelas 5–6.
Pada Kurikulum Merdeka, IPA dan IPS diajarkan sebagai IPAS mulai kelas 3. Jika diminta IPA atau IPS, gunakan elemen dan CP IPAS yang relevan dengan bagian IPA atau IPS saja. Untuk kelas 1–2 (Fase A) IPAS belum menjadi mata pelajaran tersendiri; susun TP dari muatan IPA/IPS yang sesuai usia (tubuh, makhluk hidup dan lingkungan sekitar, keluarga, rumah, sekolah, dsb.) dan sebutkan hal itu secara singkat di capaian_pembelajaran.

Ketentuan isi:
- capaian_pembelajaran: ringkasan CP fase tersebut yang relevan dengan materi yang diujikan (1 paragraf).
- tujuan_pembelajaran: 2–6 TP yang diturunkan dari CP dan materi. Setiap TP punya kode (TP1, TP2, ...), elemen CP, rumusan TP (kompetensi + konten), serta KKTP berupa 2–4 kriteria ketercapaian yang konkret dan dapat diamati.
- soal: setiap soal merujuk ke satu kode_tp; indikator_soal dirumuskan operasional ("Disajikan ..., peserta didik dapat ..."). Sebarkan level kognitif dan tingkat kesulitan secara wajar sesuai kelas.
- Bahasa harus sesuai usia: kalimat pendek dan kosakata sederhana untuk Fase A; bisa lebih kompleks untuk Fase C. Gunakan konteks kehidupan sehari-hari anak Indonesia. Hindari SARA, kekerasan, dan merek dagang.
- stimulus: teks bacaan/tabel/situasi bila diperlukan (kosongkan "" bila tidak perlu). Untuk Bahasa Indonesia, soal pemahaman bacaan wajib memuat teks bacaan di stimulus. Beberapa soal boleh berbagi stimulus yang sama; tulis ulang stimulus itu hanya di soal pertama yang memakainya, lalu di soal berikutnya isi stimulus "" dan sebut "Berdasarkan teks di atas, ..." di pertanyaan.

Aturan per bentuk soal (isi field yang tidak dipakai dengan array kosong []):
- pg: opsi berisi tepat 4 pilihan (teks saja, tanpa huruf A/B/C/D). kunci = satu huruf, mis. ["C"]. Pengecoh harus masuk akal; jangan memakai "semua benar"/"semua salah". Posisi kunci jawaban bervariasi.
- pg_kompleks: opsi berisi 4–5 pernyataan; jawaban benar lebih dari satu. kunci = huruf-huruf yang benar, mis. ["A","C"]. Pertanyaan menyebut "Pilihlah jawaban yang benar! (jawaban lebih dari satu)".
- benar_salah: opsi berisi 3–5 pernyataan. kunci berisi "B" atau "S" untuk tiap pernyataan, berurutan.
- menjodohkan: opsi berisi 3–5 pernyataan lajur kiri; opsi_kanan berisi pilihan lajur kanan (boleh 1 lebih banyak sebagai pengecoh) dengan urutan diacak. kunci berformat "1-C", "2-A", dst. (angka = urutan lajur kiri, huruf = urutan lajur kanan).
- isian: kunci berisi jawaban yang diterima (boleh beberapa variasi yang setara).
- uraian: kunci berisi poin-poin jawaban yang diharapkan; rubrik berisi 2–5 kriteria dengan skor masing-masing yang jumlahnya = skor_maks.
- pembahasan: penjelasan singkat mengapa kunci benar.
- skor_maks: pg = 1; pg_kompleks = 2; benar_salah = jumlah pernyataan; menjodohkan = jumlah pasangan; isian = 2; uraian = 4–10 sesuai kompleksitas. Untuk selain uraian, rubrik berisi kriteria penskoran singkat (mis. {"kriteria":"Jawaban benar","skor":1}).

Aturan gambar:
- Tetapkan perlu_gambar = true HANYA jika soal benar-benar memerlukan gambar untuk dijawab atau sangat terbantu olehnya (mis. bangun datar, pecahan berbentuk arsiran, jam, garis bilangan, diagram/piktogram, bagian tubuh tumbuhan, siklus air, peta sederhana, kegiatan ekonomi). Tidak semua soal perlu gambar; usahakan maksimal sekitar seperempat jumlah soal.
- deskripsi_gambar: instruksi menggambar yang sangat rinci dan presisi untuk ilustrator (objek, jumlah, ukuran/angka, label huruf/angka yang harus tertulis, tata letak). Gambar tidak boleh membocorkan kunci jawaban. Jika tidak perlu gambar, isi "".
- Pertanyaan yang memakai gambar harus merujuk "Perhatikan gambar berikut!" atau sejenisnya.

Pastikan jumlah soal untuk setiap bentuk tepat sesuai permintaan, dan setiap kunci jawaban benar secara isi (periksa ulang hitungan matematika)."""


def _client(api_key: str | None):
    return anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()


def _final_text(msg) -> str:
    if msg.stop_reason == "refusal":
        raise RuntimeError("Permintaan ditolak oleh filter keamanan model. Coba ubah materi/topik.")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("Jawaban model terpotong (terlalu panjang). Kurangi jumlah soal lalu coba lagi.")
    return "".join(b.text for b in msg.content if b.type == "text")


def buat_soal(params: dict, api_key: str | None, log) -> dict:
    kelas = int(params["kelas"])
    fase = fase_dari_kelas(kelas)
    rincian = "\n".join(f"- {BENTUK[k]} ({k}): {v} soal" for k, v in params["jumlah"].items() if v > 0)
    materi = params.get("materi", "").strip() or (
        f"Pilih materi yang lazim diajarkan pada semester {params['semester']} kelas {kelas} sesuai CP fase {fase}."
    )
    user = f"""Susun perangkat asesmen berikut.

Mata pelajaran: {MAPEL[params['mapel']]}
Kelas / Fase: {kelas} / {fase}
Semester: {params['semester']}
Jenis asesmen: {params['jenis_asesmen']}
Materi/topik: {materi}
Sebaran kesulitan: {params.get('kesulitan', 'seimbang (mudah 30%, sedang 50%, sulit 20%)')}

Jumlah soal per bentuk (harus tepat):
{rincian}

Catatan tambahan dari guru: {params.get('catatan', '').strip() or '-'}"""

    log("Menyusun TP, KKTP, dan soal dengan Claude… (bisa 1–4 menit)")
    client = _client(api_key)
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=64000,
        betas=BETAS,
        fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM_SOAL,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        msg = stream.get_final_message()
    data = json.loads(_final_text(msg))

    # Urutkan per bentuk sesuai urutan permintaan, lalu beri nomor global.
    urutan = [k for k in BENTUK if params["jumlah"].get(k, 0) > 0]
    data["soal"].sort(key=lambda s: urutan.index(s["bentuk"]) if s["bentuk"] in urutan else 99)
    for i, s in enumerate(data["soal"], 1):
        s["nomor"] = i

    hasil = {}
    for s in data["soal"]:
        hasil[s["bentuk"]] = hasil.get(s["bentuk"], 0) + 1
    beda = [f"{BENTUK[k]}: diminta {v}, didapat {hasil.get(k, 0)}"
            for k, v in params["jumlah"].items() if v and hasil.get(k, 0) != v]
    if beda:
        log("Peringatan jumlah soal — " + "; ".join(beda))
    log(f"Selesai: {len(data['tujuan_pembelajaran'])} TP, {len(data['soal'])} soal.")
    return data


SYSTEM_GAMBAR_MTK = """Anda ilustrator soal matematika SD. Buat SATU gambar SVG yang bersih dan presisi.
Aturan wajib:
- Hitam-putih saja: garis hitam (stroke="#000"), isian putih atau tanpa isian; arsiran boleh memakai pola garis hitam atau abu-abu (#bbb). Tidak ada warna lain.
- Hanya garis, bangun (shapes), dan teks label. Tidak ada gradien, bayangan, atau gambar fotorealistik.
- stroke-width 2–3, teks font-family="Arial, sans-serif" ukuran 16–22, mudah dibaca saat dicetak.
- Ukuran dan proporsi harus sesuai angka di deskripsi; label harus persis seperti diminta.
- Gunakan viewBox, latar putih (rect putih penuh), beri ruang tepi cukup agar tidak ada yang terpotong.
Keluarkan HANYA kode SVG lengkap (<svg ...>...</svg>), tanpa penjelasan dan tanpa code fence."""

SYSTEM_GAMBAR_UMUM = """Anda ilustrator buku pelajaran SD. Buat SATU ilustrasi SVG bergaya flat, sederhana, ramah anak, dan jelas saat dicetak.
Aturan wajib:
- Warna cerah tetapi tidak berlebihan, kontras cukup agar tetap terbaca bila dicetak hitam-putih; garis tepi gelap.
- Bentuk sederhana dari path/shape SVG; tanpa gambar raster, tanpa font eksternal.
- Teks/label hanya jika diminta di deskripsi, font-family="Arial, sans-serif" ukuran 16–22.
- Gunakan viewBox, latar putih (rect putih penuh), beri ruang tepi cukup agar tidak ada yang terpotong.
- Jangan menuliskan jawaban soal pada gambar.
Keluarkan HANYA kode SVG lengkap (<svg ...>...</svg>), tanpa penjelasan dan tanpa code fence."""


def _gambar_satu(client, mapel: str, soal: dict) -> str | None:
    system = SYSTEM_GAMBAR_MTK if mapel == "matematika" else SYSTEM_GAMBAR_UMUM
    user = (f"Deskripsi gambar:\n{soal['deskripsi_gambar']}\n\n"
            f"Konteks soal (jangan tulis jawabannya):\n{soal['pertanyaan']}")
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=32000,
        betas=BETAS,
        fallbacks="default",
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        msg = stream.get_final_message()
    m = re.search(r"<svg\b.*?</svg>", _final_text(msg), re.S | re.I)
    return m.group(0) if m else None


def buat_gambar(data: dict, mapel: str, api_key: str | None, log) -> None:
    perlu = [s for s in data["soal"] if s["perlu_gambar"] and s["deskripsi_gambar"].strip()]
    if not perlu:
        return
    log(f"Membuat {len(perlu)} gambar…")
    client = _client(api_key)

    def kerja(s):
        try:
            s["svg"] = _gambar_satu(client, mapel, s)
        except Exception as e:  # satu gambar gagal tidak menggagalkan semuanya
            s["svg"] = None
            log(f"Gambar soal no. {s['nomor']} gagal dibuat: {e}")
        else:
            log(f"Gambar soal no. {s['nomor']} selesai.")

    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(kerja, perlu))
