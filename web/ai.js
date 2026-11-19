// Pemanggilan AI (Claude / Gemini / OpenAI) langsung dari browser.
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.5.0/+esm";

export const BENTUK = {
  pg: "Pilihan Ganda",
  pg_kompleks: "Pilihan Ganda Kompleks",
  benar_salah: "Benar-Salah",
  menjodohkan: "Menjodohkan",
  isian: "Isian Singkat",
  uraian: "Uraian",
};

export const MAPEL = {
  matematika: "Matematika",
  bahasa_indonesia: "Bahasa Indonesia",
  ipa: "IPA (Ilmu Pengetahuan Alam)",
  ips: "IPS (Ilmu Pengetahuan Sosial)",
};

export const fase = (kelas) => (kelas <= 2 ? "A" : kelas <= 4 ? "B" : "C");

export const PROVIDERS = {
  gemini: { nama: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", defaultModel: "gemini-2.5-flash" },
  claude: { nama: "Anthropic Claude", keyUrl: "https://console.anthropic.com/settings/keys", defaultModel: "claude-opus-5-5" },
  openai: { nama: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", defaultModel: "gpt-5" },
};

const obj = (props, req = Object.keys(props)) => ({ type: "object", additionalProperties: false, required: req, properties: props });
const str = { type: "string" };

export const SCHEMA = obj({
  capaian_pembelajaran: str,
  tujuan_pembelajaran: {
    type: "array",
    items: obj({ kode: str, elemen: str, deskripsi: str, kktp: { type: "array", items: str } }),
  },
  soal: {
    type: "array",
    items: obj({
      bentuk: { type: "string", enum: Object.keys(BENTUK) },
      kode_tp: str,
      indikator_soal: str,
      level_kognitif: { type: "string", enum: ["C1", "C2", "C3", "C4", "C5", "C6"] },
      tingkat_kesulitan: { type: "string", enum: ["mudah", "sedang", "sulit"] },
      stimulus: str,
      pertanyaan: str,
      opsi: { type: "array", items: str },
      opsi_kanan: { type: "array", items: str },
      kunci: { type: "array", items: str },
      pembahasan: str,
      rubrik: { type: "array", items: obj({ kriteria: str, skor: { type: "integer" } }) },
      skor_maks: { type: "integer" },
      perlu_gambar: { type: "boolean" },
      deskripsi_gambar: str,
    }),
  },
});

const SYSTEM_SOAL = `Anda adalah guru SD berpengalaman dan pengembang asesmen Kurikulum Merdeka (Capaian Pembelajaran sesuai Keputusan Kepala BSKAP No. 032/H/KR/2024). Tugas Anda menyusun perangkat asesmen tertulis yang siap dipakai di kelas.

Pembagian fase: Fase A = kelas 1–2, Fase B = kelas 3–4, Fase C = kelas 5–6.
Pada Kurikulum Merdeka, IPA dan IPS diajarkan sebagai IPAS mulai kelas 3. Jika diminta IPA atau IPS, gunakan elemen dan CP IPAS yang relevan dengan bagian IPA atau IPS saja. Untuk kelas 1–2 (Fase A) IPAS belum menjadi mata pelajaran tersendiri; susun TP dari muatan IPA/IPS yang sesuai usia (tubuh, makhluk hidup dan lingkungan sekitar, keluarga, rumah, sekolah, dsb.) dan sebutkan hal itu secara singkat di capaian_pembelajaran.

Ketentuan isi:
- capaian_pembelajaran: ringkasan CP fase tersebut yang relevan dengan materi yang diujikan (1 paragraf).
- tujuan_pembelajaran: 2–6 TP yang diturunkan dari CP dan materi. Setiap TP punya kode (TP1, TP2, ...), elemen CP, rumusan TP (kompetensi + konten), serta KKTP berupa 2–4 kriteria ketercapaian yang konkret dan dapat diamati.
- soal: setiap soal merujuk ke satu kode_tp; indikator_soal dirumuskan operasional ("Disajikan ..., peserta didik dapat ..."). Sebarkan level kognitif dan tingkat kesulitan secara wajar sesuai kelas.
- Bahasa harus sesuai usia: kalimat pendek dan kosakata sederhana untuk Fase A; bisa lebih kompleks untuk Fase C. Gunakan konteks kehidupan sehari-hari anak Indonesia. Hindari SARA, kekerasan, dan merek dagang.
- stimulus: teks bacaan/tabel/situasi bila diperlukan (kosongkan "" bila tidak perlu). Untuk Bahasa Indonesia, soal pemahaman bacaan wajib memuat teks bacaan di stimulus. Beberapa soal boleh berbagi stimulus yang sama; tulis stimulus itu hanya di soal pertama yang memakainya, lalu di soal berikutnya isi stimulus "" dan sebut "Berdasarkan teks di atas, ..." di pertanyaan.

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

Pastikan jumlah soal untuk setiap bentuk tepat sesuai permintaan, dan setiap kunci jawaban benar secara isi (periksa ulang hitungan matematika). Keluarkan hasil dalam format JSON sesuai skema.`;

const SYSTEM_GAMBAR_MTK = `Anda ilustrator soal matematika SD. Buat SATU gambar SVG yang bersih dan presisi.
Aturan wajib:
- Hitam-putih saja: garis hitam (stroke="#000"), isian putih atau tanpa isian; arsiran boleh memakai pola garis hitam atau abu-abu (#bbb). Tidak ada warna lain.
- Hanya garis, bangun (shapes), dan teks label. Tidak ada gradien, bayangan, atau gambar fotorealistik.
- stroke-width 2–3, teks font-family="Arial, sans-serif" ukuran 16–22, mudah dibaca saat dicetak.
- Ukuran dan proporsi harus sesuai angka di deskripsi; label harus persis seperti diminta.
- Gunakan atribut xmlns dan viewBox, latar putih (rect putih penuh), beri ruang tepi cukup agar tidak ada yang terpotong.
Keluarkan HANYA kode SVG lengkap (<svg ...>...</svg>), tanpa penjelasan dan tanpa code fence.`;

const SYSTEM_GAMBAR_UMUM = `Anda ilustrator buku pelajaran SD. Buat SATU ilustrasi SVG bergaya flat, sederhana, ramah anak, dan jelas saat dicetak.
Aturan wajib:
- Warna cerah tetapi tidak berlebihan, kontras cukup agar tetap terbaca bila dicetak hitam-putih; garis tepi gelap.
- Bentuk sederhana dari path/shape SVG; tanpa gambar raster, tanpa font eksternal.
- Teks/label hanya jika diminta di deskripsi, font-family="Arial, sans-serif" ukuran 16–22.
- Gunakan atribut xmlns dan viewBox, latar putih (rect putih penuh), beri ruang tepi cukup agar tidak ada yang terpotong.
- Jangan menuliskan jawaban soal pada gambar.
Keluarkan HANYA kode SVG lengkap (<svg ...>...</svg>), tanpa penjelasan dan tanpa code fence.`;

// ---------------- penyedia ----------------
class AIError extends Error {}

function pesanHttp(status, detail) {
  if (status === 401 || status === 403) return "API key ditolak. Periksa kembali API key Anda.";
  if (status === 429) return "Batas pemakaian/kuota API tercapai. Tunggu sebentar lalu coba lagi, atau periksa saldo/kuota akun.";
  if (status === 404) return `Model tidak ditemukan. Pilih model lain di Pengaturan AI. (${detail})`;
  return `Kesalahan API (${status}): ${detail}`;
}

const CLAUDE_FALLBACK = /^claude-(opus-5-5|opus-5|fable-5-[12]|sonnet-5-5)$/;
const CLAUDE_EFFORT = /^claude-(opus-5|fable|mythos|sonnet-5|haiku-5|opus-4-[678])/;

async function claude({ key, model, system, user, schema, effort }) {
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const params = {
    model,
    max_tokens: 64000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: {},
  };
  if (CLAUDE_EFFORT.test(model)) {
    params.thinking = { type: "adaptive" };
    params.output_config.effort = effort;
  }
  if (schema) params.output_config.format = { type: "json_schema", schema };
  if (CLAUDE_FALLBACK.test(model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  if (!Object.keys(params.output_config).length) delete params.output_config;
  try {
    const msg = await client.beta.messages.stream(params).finalMessage();
    if (msg.stop_reason === "refusal") throw new AIError("Permintaan ditolak oleh filter keamanan model. Coba ubah materi/topik.");
    if (msg.stop_reason === "max_tokens") throw new AIError("Jawaban model terpotong. Kurangi jumlah soal lalu coba lagi.");
    return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.APIError && e.status) throw new AIError(pesanHttp(e.status, e.message));
    if (e instanceof Anthropic.APIConnectionError) throw new AIError("Tidak dapat terhubung ke server AI. Periksa koneksi internet.");
    throw e;
  }
}

// Gemini memakai subset OpenAPI: tanpa additionalProperties.
function geminiSchema(s) {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (s && typeof s === "object") {
    const o = {};
    for (const [k, v] of Object.entries(s)) if (k !== "additionalProperties") o[k] = geminiSchema(v);
    if (o.type === "object" && o.properties) o.propertyOrdering = Object.keys(o.properties);
    return o;
  }
  return s;
}

async function gemini({ key, model, system, user, schema }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: schema ? { responseMimeType: "application/json", responseSchema: geminiSchema(schema) } : {},
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AIError(pesanHttp(r.status, j.error?.message || r.statusText));
  const cand = j.candidates?.[0];
  if (!cand) throw new AIError("Permintaan ditolak oleh model (" + (j.promptFeedback?.blockReason || "tanpa jawaban") + "). Coba ubah materi/topik.");
  if (cand.finishReason === "MAX_TOKENS") throw new AIError("Jawaban model terpotong. Kurangi jumlah soal lalu coba lagi.");
  if (cand.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(cand.finishReason))
    throw new AIError("Jawaban dihentikan oleh model (" + cand.finishReason + "). Coba ubah materi/topik.");
  return (cand.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
}

async function openai({ key, model, system, user, schema }) {
  const body = {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  if (schema) body.response_format = { type: "json_schema", json_schema: { name: "perangkat_asesmen", strict: true, schema } };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AIError(pesanHttp(r.status, j.error?.message || r.statusText));
  const c = j.choices?.[0];
  if (c?.message?.refusal) throw new AIError("Permintaan ditolak oleh model. Coba ubah materi/topik.");
  if (c?.finish_reason === "length") throw new AIError("Jawaban model terpotong. Kurangi jumlah soal lalu coba lagi.");
  return c?.message?.content || "";
}

const CALL = { claude, gemini, openai };

// Daftar model dari akun pengguna (untuk dropdown).
export async function daftarModel(provider, key) {
  try {
    if (provider === "gemini") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
      const j = await r.json();
      return (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /^gemini-/.test(n) && !/(tts|image|embedding|live|audio|vision)/.test(n));
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      const j = await r.json();
      return (j.data || []).map((m) => m.id).filter((n) => /^(gpt-|o\d)/.test(n) && !/(audio|realtime|transcribe|tts|image|search|instruct)/.test(n)).sort();
    }
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const out = [];
    for await (const m of client.models.list()) out.push(m.id);
    return out;
  } catch {
    return [];
  }
}

// Pilih model bawaan terbaik dari daftar yang tersedia.
export function modelBawaan(provider, list) {
  const d = PROVIDERS[provider].defaultModel;
  if (!list.length || list.includes(d)) return d;
  const ver = (n) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const pick = (re) => list.filter((n) => re.test(n)).sort((a, b) => ver(b) - ver(a))[0];
  if (provider === "gemini") return pick(/^gemini-[\d.]+-flash$/) || pick(/^gemini-[\d.]+-pro$/) || list[0];
  if (provider === "openai") return pick(/^gpt-[\d.]+$/) || list[0];
  return list[0];
}

// ---------------- alur utama ----------------
export async function buatSoal(cfg, params, log) {
  const kelas = +params.kelas;
  const rincian = Object.entries(params.jumlah).filter(([, v]) => v > 0).map(([k, v]) => `- ${BENTUK[k]} (${k}): ${v} soal`).join("\n");
  const materi = params.materi?.trim() || `Pilih materi yang lazim diajarkan pada semester ${params.semester} kelas ${kelas} sesuai CP fase ${fase(kelas)}.`;
  const user = `Susun perangkat asesmen berikut.

Mata pelajaran: ${MAPEL[params.mapel]}
Kelas / Fase: ${kelas} / ${fase(kelas)}
Semester: ${params.semester}
Jenis asesmen: ${params.jenis_asesmen}
Materi/topik: ${materi}
Sebaran kesulitan: ${params.kesulitan}

Jumlah soal per bentuk (harus tepat):
${rincian}

Catatan tambahan dari guru: ${params.catatan?.trim() || "-"}`;

  log(`Menyusun TP, KKTP, dan soal dengan ${PROVIDERS[cfg.provider].nama} (${cfg.model})… bisa 1–4 menit`);
  const teks = await CALL[cfg.provider]({ key: cfg.key, model: cfg.model, system: SYSTEM_SOAL, user, schema: SCHEMA, effort: "high" });
  let data;
  try {
    data = JSON.parse(teks.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new AIError("Jawaban AI bukan JSON yang valid. Coba lagi atau pilih model lain.");
  }
  const urutan = Object.keys(BENTUK).filter((k) => params.jumlah[k] > 0);
  const idx = (b) => (urutan.includes(b) ? urutan.indexOf(b) : 99);
  data.soal.sort((a, b) => idx(a.bentuk) - idx(b.bentuk));
  data.soal.forEach((s, i) => (s.nomor = i + 1));

  const hasil = {};
  data.soal.forEach((s) => (hasil[s.bentuk] = (hasil[s.bentuk] || 0) + 1));
  const beda = Object.entries(params.jumlah).filter(([k, v]) => v && (hasil[k] || 0) !== v).map(([k, v]) => `${BENTUK[k]}: diminta ${v}, didapat ${hasil[k] || 0}`);
  if (beda.length) log("Peringatan jumlah soal — " + beda.join("; "));
  log(`Selesai: ${data.tujuan_pembelajaran.length} TP, ${data.soal.length} soal.`);
  return data;
}

export async function buatGambar(cfg, data, mapel, log, onProgress = () => {}) {
  const perlu = data.soal.filter((s) => s.perlu_gambar && s.deskripsi_gambar.trim());
  if (!perlu.length) return;
  let selesai = 0;
  onProgress(0, perlu.length);
  log(`Membuat ${perlu.length} gambar…`);
  const system = mapel === "matematika" ? SYSTEM_GAMBAR_MTK : SYSTEM_GAMBAR_UMUM;
  const antre = [...perlu];
  const kerja = async () => {
    for (let s; (s = antre.shift()); ) {
      try {
        const user = `Deskripsi gambar:\n${s.deskripsi_gambar}\n\nKonteks soal (jangan tulis jawabannya):\n${s.pertanyaan}`;
        const teks = await CALL[cfg.provider]({ key: cfg.key, model: cfg.model, system, user, effort: "medium" });
        s.svg = (teks.match(/<svg\b[\s\S]*?<\/svg>/i) || [null])[0];
        log(s.svg ? `Gambar soal no. ${s.nomor} selesai.` : `Gambar soal no. ${s.nomor} gagal (bukan SVG).`);
      } catch (e) {
        s.svg = null;
        log(`Gambar soal no. ${s.nomor} gagal dibuat: ${e.message}`);
      }
      onProgress(++selesai, perlu.length);
    }
  };
  await Promise.all(Array.from({ length: cfg.provider === "gemini" ? 2 : 4 }, kerja));
}
