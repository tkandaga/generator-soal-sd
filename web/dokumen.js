// Penyusun 3 file DOCX di browser: kisi-kisi, naskah soal, kunci & rubrik.
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, WidthType,
} from "https://cdn.jsdelivr.net/npm/docx@9.8.1/+esm";
import { BENTUK, MAPEL, fase } from "./ai.js";

const HURUF = "ABCDEFGH";
const cm = (x) => Math.round(x * 567);
const C = AlignmentType.CENTER;

const PETUNJUK = {
  pg: "Berilah tanda silang (X) pada huruf A, B, C, atau D di depan jawaban yang paling tepat!",
  pg_kompleks: "Berilah tanda centang (✓) pada semua jawaban yang benar! Jawaban dapat lebih dari satu.",
  benar_salah: "Berilah tanda centang (✓) pada kolom B jika pernyataan benar atau kolom S jika pernyataan salah!",
  menjodohkan: "Pasangkan pernyataan di lajur kiri dengan jawaban yang tepat di lajur kanan!",
  isian: "Isilah titik-titik di bawah ini dengan jawaban yang tepat!",
  uraian: "Jawablah pertanyaan-pertanyaan berikut dengan jelas dan benar!",
};

// ---------- utilitas ----------
function P(text = "", o = {}) {
  return new Paragraph({
    alignment: o.align,
    spacing: { after: o.after != null ? o.after * 20 : 40, before: o.before ? o.before * 20 : undefined },
    indent: o.indent,
    tabStops: o.tabs?.map((t) => ({ type: TabStopType.LEFT, position: cm(t) })),
    border: o.rule ? { bottom: { style: BorderStyle.THICK_THIN_SMALL_GAP, size: 18, space: 1, color: "000000" } } : undefined,
    children: o.runs || (text ? [new TextRun({ text, bold: o.bold, italics: o.italic, size: o.size ? o.size * 2 : undefined })] : []),
  });
}

function sel(text, w, o = {}) {
  const lines = String(text ?? "").split("\n");
  return new TableCell({
    width: { size: cm(w), type: WidthType.DXA },
    rowSpan: o.rowSpan,
    shading: o.shade ? { type: ShadingType.CLEAR, color: "auto", fill: "D9E2F3" } : undefined,
    borders: o.noBorder ? NO_BORDERS : undefined,
    children: o.children || lines.map((l) => P(l, { bold: o.bold, align: o.align, size: o.size, after: 0 })),
  });
}

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const NO_TABLE_BORDERS = { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE };

function tabel(widths, rows, o = {}) {
  return new Table({
    width: { size: cm(widths.reduce((a, b) => a + b, 0)), type: WidthType.DXA },
    columnWidths: widths.map(cm),
    layout: TableLayoutType.FIXED,
    borders: o.noBorder ? NO_TABLE_BORDERS : undefined,
    rows,
  });
}

const header = (labels, widths, size) =>
  new TableRow({ tableHeader: true, children: labels.map((l, i) => sel(l, widths[i], { bold: true, align: C, shade: true, size })) });

function identitas(rows, widths = [4.5, 0.5, 12]) {
  return tabel(widths, rows.map(([k, v]) => new TableRow({ children: [sel(k, widths[0]), sel(":", widths[1]), sel(v, widths[2])] })), { noBorder: true });
}

function ttd(info, total = 17) {
  const w = total / 2;
  const kiri = "Mengetahui,\nKepala Sekolah\n\n\n\n" + (info.kepsek || "(....................................)") + (info.nip_kepsek ? "\nNIP. " + info.nip_kepsek : "");
  const kanan = (info.tempat_tanggal || "...................., ....................") + "\nGuru Kelas/Mata Pelajaran\n\n\n\n" +
    (info.guru || "(....................................)") + (info.nip_guru ? "\nNIP. " + info.nip_guru : "");
  return tabel([w, w], [new TableRow({ children: [sel(kiri, w), sel(kanan, w)] })], { noBorder: true });
}

const infoUmum = (info) => [
  ["Satuan Pendidikan", info.nama_sekolah],
  ["Mata Pelajaran", MAPEL[info.mapel]],
  ["Kelas / Fase", `${info.kelas} / ${fase(+info.kelas)}`],
  ["Semester", info.semester],
  ["Tahun Pelajaran", info.tahun_ajaran],
];

const bentukDipakai = (data) => [...new Set(data.soal.map((s) => s.bentuk))];

function dokumen(children, landscape = false) {
  return new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{
      properties: {
        page: {
          size: landscape
            ? { orientation: PageOrientation.LANDSCAPE, width: cm(21), height: cm(29.7) }
            : { width: cm(21), height: cm(29.7) },
          margin: { top: cm(2), bottom: cm(2), left: cm(2), right: cm(2) },
        },
      },
      children,
    }],
  });
}

// SVG -> PNG lewat canvas
async function svgKePng(svg, lebarPx = 900) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const el = doc.documentElement;
  if (el.nodeName.toLowerCase() !== "svg") return null;
  if (!el.getAttribute("xmlns")) el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  let vb = (el.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(isNaN)) {
    const w = parseFloat(el.getAttribute("width")) || 400, h = parseFloat(el.getAttribute("height")) || 300;
    vb = [0, 0, w, h];
    el.setAttribute("viewBox", vb.join(" "));
  }
  const tinggiPx = Math.round((lebarPx * vb[3]) / vb[2]);
  el.setAttribute("width", lebarPx);
  el.setAttribute("height", tinggiPx);
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el));
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = lebarPx; cv.height = tinggiPx;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
  return { data: new Uint8Array(await blob.arrayBuffer()), w: lebarPx, h: tinggiPx };
}

function gambar(data, type, w, h, lebarCm, o = {}) {
  const px = lebarCm * 37.8;
  return new ImageRun({ type, data, transformation: { width: px, height: (px * h) / w }, ...o });
}

// ---------- 1. Kisi-kisi ----------
function kisiKisi(data, info) {
  const ch = [];
  ch.push(P(`KISI-KISI ${info.jenis_asesmen.toUpperCase()}`, { bold: true, size: 13, align: C, after: 0 }));
  ch.push(P(`TAHUN PELAJARAN ${info.tahun_ajaran}`, { bold: true, size: 12, align: C, after: 8 }));
  ch.push(identitas([...infoUmum(info), ["Jumlah Soal", `${data.soal.length} butir`], ["Bentuk Soal", bentukDipakai(data).map((b) => BENTUK[b]).join(", ")]], [5, 0.5, 20.2]));
  ch.push(P("", { after: 4 }));
  ch.push(P("Capaian Pembelajaran", { bold: true, after: 2 }));
  ch.push(P(data.capaian_pembelajaran, { align: AlignmentType.JUSTIFIED, after: 8 }));

  const W = [1, 3, 4.5, 4.5, 5.6, 1.9, 2.7, 1.5];
  const rows = [header(["No", "Elemen / Fase", "Tujuan Pembelajaran", "KKTP", "Indikator Soal", "Level Kognitif", "Bentuk Soal", "No. Soal"], W, 10)];
  const f = fase(+info.kelas);
  const kode = new Set(data.tujuan_pembelajaran.map((t) => t.kode));
  let no = 0;
  for (const tp of data.tujuan_pembelajaran) {
    const st = data.soal.filter((s) => s.kode_tp === tp.kode);
    if (!st.length) continue;
    no++;
    st.forEach((s, i) => {
      const kanan = [
        sel(s.indikator_soal, W[4], { size: 10 }),
        sel(s.level_kognitif, W[5], { size: 10, align: C }),
        sel(BENTUK[s.bentuk], W[6], { size: 10, align: C }),
        sel(String(s.nomor), W[7], { size: 10, align: C }),
      ];
      const kiri = i === 0 ? [
        sel(String(no), W[0], { size: 10, align: C, rowSpan: st.length }),
        sel(`${tp.elemen}\n(Fase ${f})`, W[1], { size: 10, rowSpan: st.length }),
        sel(`${tp.kode}. ${tp.deskripsi}`, W[2], { size: 10, rowSpan: st.length }),
        sel(tp.kktp.map((k) => "• " + k).join("\n"), W[3], { size: 10, rowSpan: st.length }),
      ] : [];
      rows.push(new TableRow({ children: [...kiri, ...kanan] }));
    });
  }
  for (const s of data.soal.filter((s) => !kode.has(s.kode_tp))) {
    rows.push(new TableRow({ children: [sel("", W[0]), sel("", W[1]), sel(s.kode_tp, W[2], { size: 10 }), sel("", W[3]),
      sel(s.indikator_soal, W[4], { size: 10 }), sel(s.level_kognitif, W[5], { size: 10 }), sel(BENTUK[s.bentuk], W[6], { size: 10 }), sel(String(s.nomor), W[7], { size: 10 })] }));
  }
  ch.push(tabel(W, rows));
  ch.push(P("", { after: 10 }));
  ch.push(ttd(info, 25.6));
  return dokumen(ch, true);
}

// ---------- 2. Naskah soal ----------
async function naskahSoal(data, info) {
  const ch = [];
  // kop
  const kopTeks = [];
  for (const l of (info.instansi || "").split("\n").filter((x) => x.trim()))
    kopTeks.push(P(l.trim().toUpperCase(), { bold: true, size: 12, align: C, after: 0 }));
  kopTeks.push(P(info.nama_sekolah.toUpperCase(), { bold: true, size: 15, align: C, after: 0 }));
  if (info.alamat) kopTeks.push(P(info.alamat, { size: 9, align: C, after: 0 }));
  const logoChildren = [];
  if (info.logo) {
    try {
      logoChildren.push(new Paragraph({ children: [gambar(info.logo.data, info.logo.type, info.logo.w, info.logo.h, 2.3)] }));
    } catch { /* abaikan logo rusak */ }
  }
  ch.push(tabel([2.8, 14.2], [new TableRow({ children: [
    sel("", 2.8, { children: logoChildren.length ? logoChildren : [P()] }),
    sel("", 14.2, { children: kopTeks }),
  ] })], { noBorder: true }));
  ch.push(P("", { rule: true, after: 6 }));

  ch.push(P(info.jenis_asesmen.toUpperCase(), { bold: true, size: 13, align: C, after: 0 }));
  ch.push(P(`TAHUN PELAJARAN ${info.tahun_ajaran}`, { bold: true, size: 12, align: C, after: 8 }));
  const W = [3.6, 0.4, 4.3, 2.9, 0.4, 5.4];
  const kiri = [["Mata Pelajaran", MAPEL[info.mapel]], ["Kelas / Semester", `${info.kelas} (${fase(+info.kelas)}) / ${info.semester}`], ["Waktu", info.waktu ? `${info.waktu} menit` : "...... menit"]];
  const kanan = [["Nama", "...................................."], ["No. Absen", "........"], ["Hari, Tanggal", "...................................."]];
  ch.push(tabel(W, [0, 1, 2].map((i) => new TableRow({ children: [
    sel(kiri[i][0], W[0]), sel(":", W[1]), sel(kiri[i][1], W[2]), sel(kanan[i][0], W[3]), sel(":", W[4]), sel(kanan[i][1], W[5]),
  ] })), { noBorder: true }));
  ch.push(P("", { rule: true, after: 6 }));

  let bagian = 0;
  for (const b of bentukDipakai(data)) {
    ch.push(P(`${HURUF[bagian++]}. ${BENTUK[b].toUpperCase()}`, { bold: true, after: 0 }));
    ch.push(P(PETUNJUK[b], { italic: true, after: 6 }));
    for (const s of data.soal.filter((x) => x.bentuk === b)) ch.push(...(await tulisSoal(s)));
  }
  ch.push(P("— Selamat Mengerjakan —", { bold: true, align: C, before: 12 }));
  return dokumen(ch);
}

async function tulisSoal(s) {
  const out = [];
  const ind = { left: cm(0.75) };
  for (const para of (s.stimulus || "").trim().split("\n").filter((x) => x.trim()))
    out.push(P(para.trim(), { indent: ind, align: AlignmentType.JUSTIFIED, after: 2 }));
  out.push(P(`${s.nomor}.\t${s.pertanyaan}`, { indent: { left: cm(0.75), hanging: cm(0.75) }, tabs: [0.75], after: 2 }));

  if (s.svg) {
    try {
      const png = await svgKePng(s.svg);
      if (png) out.push(new Paragraph({ indent: ind, children: [gambar(png.data, "png", png.w, png.h, 7.5)] }));
    } catch { /* gambar gagal dirender: lewati */ }
  }

  if (s.bentuk === "pg" || s.bentuk === "pg_kompleks") {
    const tanda = s.bentuk === "pg" ? "" : "☐ ";
    s.opsi.forEach((o, i) => out.push(P(`${tanda}${HURUF[i]}.\t${o}`, { indent: { left: cm(1.6), hanging: cm(0.85) }, tabs: [1.6], after: 0 })));
  } else if (s.bentuk === "benar_salah") {
    const W = [1, 13, 1.2, 1.2];
    out.push(tabel(W, [header(["No", "Pernyataan", "B", "S"], W),
      ...s.opsi.map((o, i) => new TableRow({ children: [sel(String(i + 1), W[0], { align: C }), sel(o, W[1]), sel("", W[2]), sel("", W[3])] }))]));
  } else if (s.bentuk === "menjodohkan") {
    const W = [1, 7.7, 1.2, 6.5];
    const n = Math.max(s.opsi.length, s.opsi_kanan.length);
    const rows = [header(["No", "Lajur Kiri", "Kode", "Lajur Kanan"], W)];
    for (let i = 0; i < n; i++) rows.push(new TableRow({ children: [
      sel(i < s.opsi.length ? String(i + 1) : "", W[0], { align: C }),
      sel(i < s.opsi.length ? s.opsi[i] + "   ( ..... )" : "", W[1]),
      sel(i < s.opsi_kanan.length ? HURUF[i] : "", W[2], { align: C }),
      sel(s.opsi_kanan[i] || "", W[3]),
    ] }));
    out.push(tabel(W, rows));
  } else if (s.bentuk === "isian") {
    if (!s.pertanyaan.includes("...")) out.push(P("Jawab: ..........................................................", { indent: ind, after: 0 }));
  } else if (s.bentuk === "uraian") {
    for (let i = 0; i < 3; i++) out.push(P(".".repeat(102), { indent: ind, after: 0 }));
  }
  out.push(P("", { after: 4 }));
  return out;
}

// ---------- 3. Kunci & rubrik ----------
const ATURAN = {
  pg: "Skor: jawaban benar = 1, salah/kosong = 0.",
  pg_kompleks: "Skor: semua pilihan benar = 2; sebagian benar tanpa pilihan salah = 1; lainnya = 0.",
  benar_salah: "Skor: setiap pernyataan yang dijawab benar = 1.",
  menjodohkan: "Skor: setiap pasangan yang benar = 1.",
  isian: "Skor: jawaban benar dan lengkap = 2; kurang tepat/kurang lengkap = 1; salah/kosong = 0.",
};

function formatKunci(s) {
  if (s.bentuk === "benar_salah") return s.kunci.map((k, i) => `${i + 1}. ${k}`).join("\n");
  if (s.bentuk === "isian") return s.kunci.join(" / ");
  return s.kunci.join(", ") || "-";
}

function kunciRubrik(data, info) {
  const ch = [];
  ch.push(P("KUNCI JAWABAN DAN RUBRIK PENILAIAN", { bold: true, size: 13, align: C, after: 0 }));
  ch.push(P(info.jenis_asesmen.toUpperCase(), { bold: true, size: 12, align: C, after: 8 }));
  ch.push(identitas(infoUmum(info)));
  ch.push(P("", { after: 4 }));
  const total = data.soal.reduce((a, s) => a + s.skor_maks, 0);
  let bagian = 0;
  for (const b of bentukDipakai(data)) {
    const sb = data.soal.filter((x) => x.bentuk === b);
    ch.push(P(`${HURUF[bagian++]}. ${BENTUK[b].toUpperCase()}`, { bold: true, after: 4 }));
    if (b !== "uraian") {
      const W = [1.1, 4.4, 9.2, 2.3];
      ch.push(tabel(W, [header(["No", "Kunci Jawaban", "Pembahasan", "Skor"], W),
        ...sb.map((s) => new TableRow({ children: [sel(String(s.nomor), W[0], { align: C }), sel(formatKunci(s), W[1]), sel(s.pembahasan, W[2]), sel(String(s.skor_maks), W[3], { align: C })] }))]));
      ch.push(P(ATURAN[b], { italic: true, size: 9, after: 8 }));
    } else {
      for (const s of sb) {
        ch.push(P(`Soal nomor ${s.nomor} (skor maksimal ${s.skor_maks})`, { bold: true, after: 2 }));
        ch.push(P("Kunci / poin jawaban yang diharapkan:", { after: 0 }));
        s.kunci.forEach((k) => ch.push(P("• " + k, { indent: { left: cm(0.75) }, after: 0 })));
        if (s.pembahasan.trim()) ch.push(P("Pembahasan: " + s.pembahasan, { italic: true, after: 2 }));
        const W = [1.1, 13.6, 2.3];
        ch.push(tabel(W, [header(["No", "Kriteria Penilaian", "Skor"], W),
          ...s.rubrik.map((r, i) => new TableRow({ children: [sel(String(i + 1), W[0], { align: C }), sel(r.kriteria, W[1]), sel(String(r.skor), W[2], { align: C })] })),
          new TableRow({ children: [sel("", W[0]), sel("Skor maksimal", W[1], { bold: true }), sel(String(s.skor_maks), W[2], { bold: true, align: C })] })]));
        ch.push(P("", { after: 8 }));
      }
    }
  }

  ch.push(P("PEDOMAN PENSKORAN", { bold: true, after: 4 }));
  let W = [5.5, 3.5, 3.5, 4.5];
  const rows = [header(["Bentuk Soal", "Nomor Soal", "Jumlah Soal", "Skor Maksimal"], W)];
  for (const b of bentukDipakai(data)) {
    const sb = data.soal.filter((x) => x.bentuk === b);
    rows.push(new TableRow({ children: [sel(BENTUK[b], W[0]), sel(sb.length > 1 ? `${sb[0].nomor}–${sb.at(-1).nomor}` : String(sb[0].nomor), W[1], { align: C }),
      sel(String(sb.length), W[2], { align: C }), sel(String(sb.reduce((a, s) => a + s.skor_maks, 0)), W[3], { align: C })] }));
  }
  rows.push(new TableRow({ children: [sel("Jumlah", W[0], { bold: true }), sel("", W[1]), sel(String(data.soal.length), W[2], { bold: true, align: C }), sel(String(total), W[3], { bold: true, align: C })] }));
  ch.push(tabel(W, rows));
  ch.push(P("", { after: 4 }));
  ch.push(P(`Nilai Akhir = (Jumlah skor yang diperoleh ÷ ${total}) × 100`, { bold: true, after: 8 }));

  ch.push(P("Ketercapaian Tujuan Pembelajaran (KKTP)", { bold: true, after: 4 }));
  W = [6.5, 8, 2.5];
  ch.push(tabel(W, [header(["Tujuan Pembelajaran", "Kriteria Ketercapaian", "Nomor Soal"], W),
    ...data.tujuan_pembelajaran.map((tp) => new TableRow({ children: [
      sel(`${tp.kode}. ${tp.deskripsi}`, W[0]), sel(tp.kktp.map((k) => "• " + k).join("\n"), W[1]),
      sel(data.soal.filter((s) => s.kode_tp === tp.kode).map((s) => s.nomor).join(", ") || "-", W[2], { align: C }),
    ] }))]));
  ch.push(P("", { after: 4 }));
  W = [4, 13];
  ch.push(tabel(W, [header(["Rentang Nilai", "Interpretasi"], W), ...[
    ["0 – 60", "Belum mencapai; perlu bimbingan/remedial pada seluruh TP"],
    ["61 – 70", "Belum mencapai sepenuhnya; perlu remedial pada sebagian TP"],
    ["71 – 80", "Sudah mencapai; tidak perlu remedial"],
    ["81 – 100", "Sudah mencapai dengan sangat baik; perlu pengayaan"],
  ].map(([a, b]) => new TableRow({ children: [sel(a, W[0], { align: C }), sel(b, W[1])] }))]));
  ch.push(P("Rentang interpretasi dapat disesuaikan dengan kebijakan satuan pendidikan.", { italic: true, size: 9, after: 10 }));
  ch.push(ttd(info));
  return dokumen(ch);
}

export async function buatSemua(data, info, prefix, log) {
  log("Menyusun file kisi-kisi…");
  const a = await Packer.toBlob(kisiKisi(data, info));
  log("Menyusun file soal…");
  const b = await Packer.toBlob(await naskahSoal(data, info));
  log("Menyusun file kunci jawaban & rubrik…");
  const c = await Packer.toBlob(kunciRubrik(data, info));
  return [
    { nama: `${prefix} - 1 Kisi-kisi.docx`, blob: a },
    { nama: `${prefix} - 2 Soal.docx`, blob: b },
    { nama: `${prefix} - 3 Kunci dan Rubrik.docx`, blob: c },
  ];
}

export { svgKePng };
