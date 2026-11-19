import { BENTUK, MAPEL, PROVIDERS, buatGambar, buatSoal, daftarModel, pilihanModel } from "./ai.js";
import { buatSemua } from "./dokumen.js";

const $ = (s) => document.querySelector(s);
const f = $("#f");
const BK = Object.keys(BENTUK);
const IDENT = ["instansi", "nama_sekolah", "alamat", "tahun_ajaran", "guru", "nip_guru", "kepsek", "nip_kepsek", "tempat_tanggal"];

// ---------- penyimpanan lokal (aman bila diblokir) ----------
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* abaikan */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* abaikan */ } },
};

// ---------- tampilan form ----------
function updBentuk() {
  const camp = $("#bentuk").value === "campuran";
  $("#mix").classList.toggle("hide", !camp);
  $("#jmlTunggal").classList.toggle("hide", camp);
  const tot = camp ? BK.reduce((a, k) => a + (+f["jml_" + k].value || 0), 0) : +f.jumlah.value || 0;
  $("#total").textContent = `Total ${tot} soal` + (tot > 60 ? " — maksimal 60" : "");
}
function updIpas() {
  const m = $("#mapel").value, k = +$("#kelas").value;
  $("#ipasHint").textContent = m === "ipa" || m === "ips"
    ? (k <= 2 ? "Catatan: di Fase A (kelas 1–2) IPAS belum menjadi mapel tersendiri; soal disusun dari muatan IPA/IPS yang sesuai usia."
      : "Di Kurikulum Merdeka, IPA dan IPS tergabung dalam IPAS; soal diambil dari bagian " + (m === "ipa" ? "IPA" : "IPS") + " pada CP IPAS.")
    : "";
}
$("#bentuk").onchange = updBentuk;
f.addEventListener("input", updBentuk);
$("#mapel").onchange = updIpas;
$("#kelas").onchange = updIpas;
$("#jenis").onchange = () => $("#jenisLain").classList.toggle("hide", $("#jenis").value !== "__lain");

// ---------- identitas & logo ----------
const ident = ls.get("identitas", {});
IDENT.forEach((k) => { if (ident[k]) f[k].value = ident[k]; });
if (!ident.nama_sekolah) $("#sekolah").open = true;

function tampilLogo() {
  const l = ls.get("logo");
  $("#logoPrev").innerHTML = l ? `<img src="${l.url}" alt="Logo sekolah"> <button type="button" id="hapusLogo">Hapus logo</button>` : "";
  if (l) $("#hapusLogo").onclick = () => { ls.del("logo"); tampilLogo(); };
}
f.logo.onchange = async () => {
  const file = f.logo.files[0];
  if (!file) return;
  const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); });
  const img = new Image();
  await new Promise((ok) => { img.onload = ok; img.src = url; });
  // perkecil supaya muat di penyimpanan browser
  const s = Math.min(1, 300 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  ls.set("logo", { url: cv.toDataURL("image/png"), w: cv.width, h: cv.height });
  f.logo.value = "";
  tampilLogo();
};
tampilLogo();

async function logoUntukDocx() {
  const l = ls.get("logo");
  if (!l) return null;
  const data = new Uint8Array(await (await fetch(l.url)).arrayBuffer());
  return { data, type: "png", w: l.w, h: l.h };
}

// ---------- pengaturan AI ----------
const ai = ls.get("ai", { provider: "gemini", keys: {}, models: {} });
// model lama yang sudah dihentikan Google
if (/^gemini-(1\.|2\.0|2\.5)/.test(ai.models.gemini || "")) delete ai.models.gemini;
const provSel = $("#provider");
provSel.innerHTML = Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${p.nama}</option>`).join("");
provSel.value = ai.provider;

ai.pilihan = ai.pilihan || {};
function isiDropdownModel(p) {
  const opsi = ai.pilihan[p] || pilihanModel(p);
  if (!opsi.some((o) => o.id === ai.models[p])) ai.models[p] = opsi[0].id;
  $("#model").innerHTML = opsi.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  $("#model").value = ai.models[p];
}
function tampilAI() {
  const p = provSel.value;
  $("#apiKey").value = ai.keys[p] || "";
  isiDropdownModel(p);
  $("#keyLink").href = PROVIDERS[p].keyUrl;
  $("#keyLink").textContent = PROVIDERS[p].keyUrl.replace("https://", "");
  $("#keyPill").textContent = ai.keys[ai.provider] ? `${PROVIDERS[ai.provider].nama} siap` : "API key belum diisi";
  $("#gratisHint").classList.toggle("hide", p !== "gemini");
}
function simpanAI() {
  const p = provSel.value;
  ai.provider = p;
  ai.keys[p] = $("#apiKey").value.trim();
  ai.models[p] = $("#model").value;
  ls.set("ai", ai);
  tampilAI();
}
async function muatModel() {
  const p = provSel.value, key = $("#apiKey").value.trim();
  if (!key) return;
  $("#modelHint").textContent = "Memeriksa model yang tersedia…";
  const list = await daftarModel(p, key);
  if (list.length) {
    ai.pilihan[p] = pilihanModel(p, list);
    $("#modelHint").textContent = "Pilihan pertama paling direkomendasikan.";
  } else {
    $("#modelHint").textContent = "Daftar model tidak dapat dimuat — periksa API key.";
  }
  isiDropdownModel(p);
  simpanAI();
}
provSel.onchange = () => { tampilAI(); $("#modelHint").textContent = ""; if (ai.keys[provSel.value] && !ai.pilihan[provSel.value]) muatModel(); };
$("#btnKey").onclick = async () => { simpanAI(); await muatModel(); };
$("#model").onchange = simpanAI;
tampilAI();
if (!ai.keys[ai.provider]) $("#pengaturan").open = true;
else if (!ai.pilihan[ai.provider]) muatModel();

// ---------- folder simpan ----------
let folder = null;
const bisaPilihFolder = "showDirectoryPicker" in window;
function tampilFolder() {
  $("#folderNama").textContent = folder ? `📁 ${folder.name}` : bisaPilihFolder ? "Belum dipilih — file akan diunduh ke folder Download." : "Browser ini tidak mendukung pilih folder; file akan diunduh ke folder Download.";
}
$("#btnFolder").classList.toggle("hide", !bisaPilihFolder);
$("#btnFolder").onclick = async () => {
  try { folder = await window.showDirectoryPicker({ id: "soal-sd", mode: "readwrite" }); } catch { /* batal */ }
  tampilFolder();
};
tampilFolder();

async function simpanKeFolder(dir, nama, blob) {
  const dot = nama.lastIndexOf(".");
  let n = nama, i = 2;
  for (;;) {
    try { await dir.getFileHandle(n); n = `${nama.slice(0, dot)} (${i++})${nama.slice(dot)}`; } catch { break; }
  }
  const fh = await dir.getFileHandle(n, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
  return n;
}

// ---------- proses ----------
const logEl = $("#log");
const log = (m) => { logEl.textContent += (logEl.textContent ? "\n" : "") + m; };

// Loading bar: tahap yang lamanya tak pasti dianimasikan mendekati batas atasnya.
const progres = {
  timer: null, mulai: 0, p: 0, dari: 0, ke: 0, est: 1, t0: 0,
  reset() {
    clearInterval(this.timer);
    $("#prog").className = "prog";
    this.mulai = Date.now();
    this.p = 0;
    this.render();
    this.timer = setInterval(() => this.tick(), 250);
  },
  tahap(label, dari, ke, estDetik) {
    $("#progTahap").textContent = label;
    Object.assign(this, { dari: Math.max(dari, this.p), ke, est: estDetik, t0: Date.now() });
  },
  tick() {
    const t = (Date.now() - this.t0) / 1000;
    const target = this.dari + (this.ke - this.dari) * 0.95 * (1 - Math.exp((-3 * t) / this.est));
    this.p = Math.max(this.p, target);
    this.render();
  },
  render() {
    const pct = Math.floor(this.p);
    $("#barFill").style.width = this.p + "%";
    $("#bar").setAttribute("aria-valuenow", pct);
    $("#progPersen").textContent = pct + "%";
    const d = Math.floor((Date.now() - this.mulai) / 1000);
    $("#progWaktu").textContent = `Waktu berjalan ${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
  },
  akhir(ok) {
    clearInterval(this.timer);
    if (ok) { this.p = 100; $("#progTahap").textContent = "Selesai"; }
    else $("#progTahap").textContent = "Gagal";
    $("#prog").className = "prog " + (ok ? "selesai" : "gagal");
    this.render();
  },
};

f.onsubmit = async (e) => {
  e.preventDefault();
  simpanAI();
  const cfg = { provider: ai.provider, key: ai.keys[ai.provider], model: ai.models[ai.provider] || PROVIDERS[ai.provider].defaultModel };
  const fd = Object.fromEntries(new FormData(f));
  const bentuk = fd.bentuk;
  const jumlah = Object.fromEntries(BK.map((k) => [k, bentuk === "campuran" ? Math.max(0, +fd["jml_" + k] || 0) : k === bentuk ? Math.max(0, +fd.jumlah || 0) : 0]));
  const tot = Object.values(jumlah).reduce((a, b) => a + b, 0);

  $("#hasil").classList.remove("hide");
  logEl.textContent = ""; $("#files").innerHTML = ""; $("#statusLine").textContent = "";
  const gagal = (m) => { $("#statusLine").innerHTML = `<span class="err"></span>`; $("#statusLine .err").textContent = m; };
  $("#prog").classList.add("hide");
  if (!cfg.key) { $("#pengaturan").open = true; return gagal("API key belum diisi (bagian Pengaturan AI)."); }
  if (!tot) return gagal("Jumlah soal masih 0.");
  if (tot > 60) return gagal("Maksimal 60 soal sekali buat.");

  const info = Object.fromEntries(IDENT.map((k) => [k, (fd[k] || "").trim()]));
  ls.set("identitas", info);
  Object.assign(info, {
    mapel: fd.mapel, kelas: fd.kelas, semester: fd.semester, waktu: fd.waktu, kesulitan: fd.kesulitan,
    materi: fd.materi, catatan: fd.catatan,
    jenis_asesmen: $("#jenis").value === "__lain" ? ($("#jenisLain").value.trim() || "Asesmen Sumatif") : $("#jenis").value,
  });

  const btn = $("#btnGo");
  btn.disabled = true; btn.textContent = "Sedang membuat…";
  $("#hasil").scrollIntoView({ behavior: "smooth" });
  progres.reset();
  try {
    progres.tahap("Menyusun TP, KKTP, dan soal…", 2, 60, 30 + 4 * tot);
    const data = await buatSoal(cfg, { ...info, jumlah }, log);
    const nGambar = data.soal.filter((s) => s.perlu_gambar && s.deskripsi_gambar.trim()).length;
    if (nGambar) progres.tahap(`Membuat gambar (0/${nGambar})…`, 60, 60 + 30 / nGambar, 30);
    await buatGambar(cfg, data, info.mapel, log, (selesai, n) =>
      progres.tahap(`Membuat gambar (${selesai}/${n})…`, 60 + (30 * selesai) / n, 60 + (30 * Math.min(n, selesai + 1)) / n, 30));
    progres.tahap("Menyusun file DOCX…", 90, 99, 4);
    info.logo = await logoUntukDocx();
    const singkat = info.jenis_asesmen.replace(/[^\w\s-]/g, "").trim();
    const prefix = `${MAPEL[info.mapel].split(" (")[0]} Kelas ${info.kelas} - ${singkat}`.replace(/\s+/g, " ").slice(0, 90);
    const files = await buatSemua(data, info, prefix, log);

    let disimpan = false;
    if (folder) {
      try {
        if ((await folder.queryPermission({ mode: "readwrite" })) === "granted") {
          for (const x of files) x.nama = await simpanKeFolder(folder, x.nama, x.blob);
          disimpan = true;
          log(`Semua file tersimpan di folder "${folder.name}".`);
        }
      } catch (err) { log("Gagal menyimpan ke folder: " + err.message); }
    }
    $("#files").innerHTML = files.map((x, i) => `<div>📄 <a href="#" data-i="${i}">${x.nama}</a></div>`).join("") +
      `<p class="hint">${disimpan ? "Klik nama file untuk mengunduh salinannya." : "Klik nama file untuk mengunduh."}</p>`;
    $("#files").querySelectorAll("a").forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); unduh(files[+a.dataset.i]); }));
    if (!disimpan) { for (const x of files) unduh(x); log("File diunduh ke folder Download."); }
    ls.set("terakhir", { info: { ...info, logo: null }, data });
    progres.akhir(true);
    $("#statusLine").innerHTML = '<span class="ok">Selesai ✓</span>';
  } catch (err) {
    console.error(err);
    progres.akhir(false);
    gagal(err.message || String(err));
  } finally {
    btn.disabled = false; btn.textContent = "Buat Soal";
  }
};

function unduh({ nama, blob }) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

updBentuk();
updIpas();
