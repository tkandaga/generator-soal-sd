"""Penyusun 3 file DOCX: kisi-kisi, naskah soal, kunci & rubrik."""
import os
import subprocess
import tempfile

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

from ai import BENTUK, MAPEL, fase_dari_kelas

HURUF = "ABCDEFGH"

PETUNJUK = {
    "pg": "Berilah tanda silang (X) pada huruf A, B, C, atau D di depan jawaban yang paling tepat!",
    "pg_kompleks": "Berilah tanda centang (✓) pada semua jawaban yang benar! Jawaban dapat lebih dari satu.",
    "benar_salah": "Berilah tanda centang (✓) pada kolom B jika pernyataan benar atau kolom S jika pernyataan salah!",
    "menjodohkan": "Pasangkan pernyataan di lajur kiri dengan jawaban yang tepat di lajur kanan!",
    "isian": "Isilah titik-titik di bawah ini dengan jawaban yang tepat!",
    "uraian": "Jawablah pertanyaan-pertanyaan berikut dengan jelas dan benar!",
}


# ---------- utilitas ----------
def _doc(landscape=False):
    d = Document()
    sec = d.sections[0]
    sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
    if landscape:
        sec.page_height, sec.page_width = sec.page_width, sec.page_height
        sec.orientation = 1
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(sec, side, Cm(2))
    st = d.styles["Normal"]
    st.font.name = "Arial"
    st.font.size = Pt(11)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    st.paragraph_format.space_after = Pt(2)
    st.paragraph_format.line_spacing = 1.15
    return d


def _p(container, text="", bold=False, size=None, align=None, italic=False, after=None):
    p = container.add_paragraph()
    if text:
        r = p.add_run(text)
        r.bold, r.italic = bold, italic
        if size:
            r.font.size = Pt(size)
    if align:
        p.alignment = align
    if after is not None:
        p.paragraph_format.space_after = Pt(after)
    return p


def _cell(cell, text, bold=False, align=None, size=None):
    cell.text = ""
    lines = str(text).split("\n")
    p = cell.paragraphs[0]
    for i, line in enumerate(lines):
        if i:
            p = cell.add_paragraph()
        r = p.add_run(line)
        r.bold = bold
        if size:
            r.font.size = Pt(size)
        if align:
            p.alignment = align
        p.paragraph_format.space_after = Pt(0)


def _shade(cell, hexcolor="D9E2F3"):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hexcolor)
    tcPr.append(shd)


def _header_row(table, labels, size=None):
    for c, lab in zip(table.rows[0].cells, labels):
        _cell(c, lab, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, size=size)
        _shade(c)


def _widths(table, cms):
    table.autofit = False
    tblPr = table._tbl.tblPr
    lay = OxmlElement("w:tblLayout")
    lay.set(qn("w:type"), "fixed")
    tblPr.append(lay)
    for gc, w in zip(table._tbl.tblGrid.findall(qn("w:gridCol")), cms):
        gc.set(qn("w:w"), str(int(w * 567)))
    for row in table.rows:
        for c, w in zip(row.cells, cms):
            c.width = Cm(w)


def _no_borders(table):
    tblPr = table._tbl.tblPr
    b = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        e = OxmlElement(f"w:{edge}")
        e.set(qn("w:val"), "nil")
        b.append(e)
    tblPr.append(b)


def _bottom_rule(p):
    pPr = p._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bot = OxmlElement("w:bottom")
    bot.set(qn("w:val"), "thickThinSmallGap")
    bot.set(qn("w:sz"), "18")
    bot.set(qn("w:space"), "1")
    bot.set(qn("w:color"), "000000")
    bdr.append(bot)
    pPr.append(bdr)


def _kop(d, info):
    t = d.add_table(rows=1, cols=2)
    _no_borders(t)
    logo_cell, teks = t.rows[0].cells
    if info.get("logo_path") and os.path.exists(info["logo_path"]):
        try:
            logo_cell.paragraphs[0].add_run().add_picture(info["logo_path"], width=Cm(2.3))
        except Exception:
            pass
    teks.text = ""
    first = True
    for line in [x for x in info.get("instansi", "").split("\n") if x.strip()]:
        p = teks.paragraphs[0] if first else teks.add_paragraph()
        first = False
        r = p.add_run(line.strip().upper())
        r.bold, r.font.size = True, Pt(12)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
    p = teks.paragraphs[0] if first else teks.add_paragraph()
    r = p.add_run(info["nama_sekolah"].upper())
    r.bold, r.font.size = True, Pt(15)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    if info.get("alamat"):
        p = teks.add_paragraph()
        r = p.add_run(info["alamat"])
        r.font.size = Pt(9)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _widths(t, [2.8, 14.2])
    rule = _p(d, after=6)
    _bottom_rule(rule)


def _identitas(d, rows, widths=(4.5, 0.5, 12)):
    t = d.add_table(rows=0, cols=3)
    _no_borders(t)
    for k, v in rows:
        c = t.add_row().cells
        _cell(c[0], k)
        _cell(c[1], ":")
        _cell(c[2], v)
    _widths(t, widths)
    _p(d, after=4)


def _ttd(d, info):
    t = d.add_table(rows=1, cols=2)
    _no_borders(t)
    kiri, kanan = t.rows[0].cells
    _cell(kiri, "Mengetahui,\nKepala Sekolah\n\n\n\n" + (info.get("kepsek") or "(....................................)")
          + ("\nNIP. " + info["nip_kepsek"] if info.get("nip_kepsek") else ""))
    tempat = info.get("tempat_tanggal") or "...................., ...................."
    _cell(kanan, tempat + "\nGuru Kelas/Mata Pelajaran\n\n\n\n" + (info.get("guru") or "(....................................)")
          + ("\nNIP. " + info["nip_guru"] if info.get("nip_guru") else ""))


def _info_umum(info):
    kelas = int(info["kelas"])
    return [
        ("Satuan Pendidikan", info["nama_sekolah"]),
        ("Mata Pelajaran", MAPEL[info["mapel"]]),
        ("Kelas / Fase", f"{kelas} / {fase_dari_kelas(kelas)}"),
        ("Semester", info["semester"]),
        ("Tahun Pelajaran", info["tahun_ajaran"]),
    ]


def _svg_ke_png(svg: str, folder: str, nama: str) -> str | None:
    src = os.path.join(folder, nama + ".svg")
    out = os.path.join(folder, nama + ".png")
    with open(src, "w", encoding="utf-8") as f:
        f.write(svg)
    try:
        subprocess.run(["rsvg-convert", "-w", "900", "-b", "white", src, "-o", out],
                       check=True, capture_output=True, timeout=60)
        return out
    except Exception:
        return None


def _bentuk_dipakai(data):
    seen = []
    for s in data["soal"]:
        if s["bentuk"] not in seen:
            seen.append(s["bentuk"])
    return seen


# ---------- 1. Kisi-kisi ----------
def kisi_kisi(data, info, path):
    d = _doc(landscape=True)
    _p(d, f"KISI-KISI {info['jenis_asesmen'].upper()}", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER)
    _p(d, f"TAHUN PELAJARAN {info['tahun_ajaran']}", bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, after=8)
    jumlah = len(data["soal"])
    bentuk = ", ".join(BENTUK[b] for b in _bentuk_dipakai(data))
    _identitas(d, _info_umum(info) + [("Jumlah Soal", f"{jumlah} butir"), ("Bentuk Soal", bentuk)],
               widths=(5, 0.5, 20.2))

    _p(d, "Capaian Pembelajaran", bold=True)
    _p(d, data["capaian_pembelajaran"], after=8).alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    heads = ["No", "Elemen / Fase", "Tujuan Pembelajaran", "KKTP", "Indikator Soal",
             "Level Kognitif", "Bentuk Soal", "No. Soal"]
    t = d.add_table(rows=1, cols=len(heads))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    _header_row(t, heads, size=10)
    fase = fase_dari_kelas(int(info["kelas"]))
    tps = {tp["kode"]: tp for tp in data["tujuan_pembelajaran"]}
    no = 0
    for kode, tp in tps.items():
        soal_tp = [s for s in data["soal"] if s["kode_tp"] == kode]
        if not soal_tp:
            continue
        no += 1
        start = len(t.rows)
        for s in soal_tp:
            c = t.add_row().cells
            _cell(c[4], s["indikator_soal"], size=10)
            _cell(c[5], s["level_kognitif"], align=WD_ALIGN_PARAGRAPH.CENTER, size=10)
            _cell(c[6], BENTUK[s["bentuk"]], align=WD_ALIGN_PARAGRAPH.CENTER, size=10)
            _cell(c[7], str(s["nomor"]), align=WD_ALIGN_PARAGRAPH.CENTER, size=10)
        end = len(t.rows) - 1
        isi = [str(no), f"{tp['elemen']}\n(Fase {fase})", f"{kode}. {tp['deskripsi']}",
               "\n".join(f"• {k}" for k in tp["kktp"])]
        for col, txt in enumerate(isi):
            cell = t.cell(start, col).merge(t.cell(end, col)) if end > start else t.cell(start, col)
            _cell(cell, txt, size=10, align=WD_ALIGN_PARAGRAPH.CENTER if col == 0 else None)
    # soal dengan kode TP yang tidak terdaftar (jaga-jaga)
    for s in data["soal"]:
        if s["kode_tp"] not in tps:
            c = t.add_row().cells
            _cell(c[2], s["kode_tp"], size=10)
            _cell(c[4], s["indikator_soal"], size=10)
            _cell(c[5], s["level_kognitif"], size=10)
            _cell(c[6], BENTUK[s["bentuk"]], size=10)
            _cell(c[7], str(s["nomor"]), size=10)
    _widths(t, [1, 3, 4.6, 4.6, 5.8, 1.7, 2.6, 1.5])
    _p(d, after=10)
    _ttd(d, info)
    d.save(path)


# ---------- 2. Naskah soal ----------
def naskah_soal(data, info, path, img_dir):
    d = _doc()
    _kop(d, info)
    _p(d, info["jenis_asesmen"].upper(), bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER, after=0)
    _p(d, f"TAHUN PELAJARAN {info['tahun_ajaran']}", bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, after=8)
    kelas = int(info["kelas"])
    t = d.add_table(rows=3, cols=6)
    _no_borders(t)
    kiri = [("Mata Pelajaran", MAPEL[info["mapel"]]),
            ("Kelas / Semester", f"{kelas} ({fase_dari_kelas(kelas)}) / {info['semester']}"),
            ("Waktu", f"{info['waktu']} menit" if info.get("waktu") else "...... menit")]
    kanan = [("Nama", "...................................."),
             ("No. Absen", "........"),
             ("Hari, Tanggal", "....................................")]
    for i in range(3):
        c = t.rows[i].cells
        for j, (k, v) in enumerate((kiri[i], kanan[i])):
            _cell(c[j * 3], k)
            _cell(c[j * 3 + 1], ":")
            _cell(c[j * 3 + 2], v)
    _widths(t, [3.6, 0.4, 4.3, 2.9, 0.4, 5.4])
    rule = _p(d, after=6)
    _bottom_rule(rule)

    bagian = 0
    for b in _bentuk_dipakai(data):
        bagian += 1
        _p(d, f"{HURUF[bagian - 1]}. {BENTUK[b].upper()}", bold=True, after=0)
        _p(d, PETUNJUK[b], italic=True, after=6)
        for s in [x for x in data["soal"] if x["bentuk"] == b]:
            _tulis_soal(d, s, img_dir)
    _p(d, "— Selamat Mengerjakan —", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER).paragraph_format.space_before = Pt(12)
    d.save(path)


def _indent(p, cm=0.75, hanging=True):
    p.paragraph_format.left_indent = Cm(cm)
    if hanging:
        p.paragraph_format.first_line_indent = Cm(-cm)


def _tulis_soal(d, s, img_dir):
    if s["stimulus"].strip():
        for para in s["stimulus"].strip().split("\n"):
            if para.strip():
                p = _p(d, para.strip(), after=2)
                p.paragraph_format.left_indent = Cm(0.75)
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p = _p(d, f"{s['nomor']}.\t{s['pertanyaan']}", after=2)
    _indent(p)
    p.paragraph_format.tab_stops.add_tab_stop(Cm(0.75))

    if s.get("svg"):
        png = _svg_ke_png(s["svg"], img_dir, f"soal_{s['nomor']}")
        if png:
            gp = d.add_paragraph()
            gp.paragraph_format.left_indent = Cm(0.75)
            gp.add_run().add_picture(png, width=Cm(7.5))

    if s["bentuk"] in ("pg", "pg_kompleks"):
        tanda = "" if s["bentuk"] == "pg" else "☐ "
        for i, o in enumerate(s["opsi"]):
            op = _p(d, f"{tanda}{HURUF[i]}.\t{o}", after=0)
            op.paragraph_format.left_indent = Cm(1.5)
            op.paragraph_format.first_line_indent = Cm(-0.75)
            op.paragraph_format.tab_stops.add_tab_stop(Cm(1.5))
    elif s["bentuk"] == "benar_salah":
        t = d.add_table(rows=1, cols=4)
        t.style = "Table Grid"
        _header_row(t, ["No", "Pernyataan", "B", "S"])
        for i, o in enumerate(s["opsi"], 1):
            c = t.add_row().cells
            _cell(c[0], str(i), align=WD_ALIGN_PARAGRAPH.CENTER)
            _cell(c[1], o)
        _widths(t, [1, 13, 1.2, 1.2])
    elif s["bentuk"] == "menjodohkan":
        n = max(len(s["opsi"]), len(s["opsi_kanan"]))
        t = d.add_table(rows=1, cols=4)
        t.style = "Table Grid"
        _header_row(t, ["No", "Lajur Kiri", "Kode", "Lajur Kanan"])
        for i in range(n):
            c = t.add_row().cells
            if i < len(s["opsi"]):
                _cell(c[0], f"{i + 1}", align=WD_ALIGN_PARAGRAPH.CENTER)
                _cell(c[1], s["opsi"][i] + "   ( ..... )")
            if i < len(s["opsi_kanan"]):
                _cell(c[2], HURUF[i], align=WD_ALIGN_PARAGRAPH.CENTER)
                _cell(c[3], s["opsi_kanan"][i])
        _widths(t, [1, 7.7, 1.2, 6.5])
    elif s["bentuk"] == "isian":
        if "..." not in s["pertanyaan"]:
            jp = _p(d, "Jawab: ..........................................................", after=0)
            jp.paragraph_format.left_indent = Cm(0.75)
    elif s["bentuk"] == "uraian":
        for _ in range(3):
            jp = _p(d, "......................................................................................................", after=0)
            jp.paragraph_format.left_indent = Cm(0.75)
    _p(d, after=4)


# ---------- 3. Kunci & rubrik ----------
def kunci_rubrik(data, info, path):
    d = _doc()
    _p(d, "KUNCI JAWABAN DAN RUBRIK PENILAIAN", bold=True, size=13, align=WD_ALIGN_PARAGRAPH.CENTER, after=0)
    _p(d, info["jenis_asesmen"].upper(), bold=True, size=12, align=WD_ALIGN_PARAGRAPH.CENTER, after=8)
    _identitas(d, _info_umum(info))

    total = sum(s["skor_maks"] for s in data["soal"])
    bagian = 0
    for b in _bentuk_dipakai(data):
        bagian += 1
        soal_b = [x for x in data["soal"] if x["bentuk"] == b]
        _p(d, f"{HURUF[bagian - 1]}. {BENTUK[b].upper()}", bold=True, after=4)
        if b in ("pg", "pg_kompleks", "benar_salah", "menjodohkan", "isian"):
            t = d.add_table(rows=1, cols=4)
            t.style = "Table Grid"
            _header_row(t, ["No", "Kunci Jawaban", "Pembahasan", "Skor"])
            for s in soal_b:
                c = t.add_row().cells
                _cell(c[0], str(s["nomor"]), align=WD_ALIGN_PARAGRAPH.CENTER)
                _cell(c[1], _format_kunci(s))
                _cell(c[2], s["pembahasan"])
                _cell(c[3], _format_skor(s), align=WD_ALIGN_PARAGRAPH.CENTER)
            _widths(t, [1.1, 4.4, 9.2, 2.3])
            _p(d, _aturan_skor(b), italic=True, size=9, after=8)
        else:  # uraian
            for s in soal_b:
                _p(d, f"Soal nomor {s['nomor']} (skor maksimal {s['skor_maks']})", bold=True, after=2)
                _p(d, "Kunci / poin jawaban yang diharapkan:", after=0)
                for k in s["kunci"]:
                    kp = _p(d, f"• {k}", after=0)
                    kp.paragraph_format.left_indent = Cm(0.75)
                if s["pembahasan"].strip():
                    _p(d, f"Pembahasan: {s['pembahasan']}", italic=True, after=2)
                t = d.add_table(rows=1, cols=3)
                t.style = "Table Grid"
                _header_row(t, ["No", "Kriteria Penilaian", "Skor"])
                for i, r in enumerate(s["rubrik"], 1):
                    c = t.add_row().cells
                    _cell(c[0], str(i), align=WD_ALIGN_PARAGRAPH.CENTER)
                    _cell(c[1], r["kriteria"])
                    _cell(c[2], str(r["skor"]), align=WD_ALIGN_PARAGRAPH.CENTER)
                c = t.add_row().cells
                _cell(c[1], "Skor maksimal", bold=True)
                _cell(c[2], str(s["skor_maks"]), bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
                _widths(t, [1.1, 13.6, 2.3])
                _p(d, after=8)

    _p(d, "PEDOMAN PENSKORAN", bold=True, after=4)
    t = d.add_table(rows=1, cols=4)
    t.style = "Table Grid"
    _header_row(t, ["Bentuk Soal", "Nomor Soal", "Jumlah Soal", "Skor Maksimal"])
    for b in _bentuk_dipakai(data):
        soal_b = [x for x in data["soal"] if x["bentuk"] == b]
        c = t.add_row().cells
        _cell(c[0], BENTUK[b])
        _cell(c[1], f"{soal_b[0]['nomor']}–{soal_b[-1]['nomor']}" if len(soal_b) > 1 else str(soal_b[0]["nomor"]),
              align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell(c[2], str(len(soal_b)), align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell(c[3], str(sum(x["skor_maks"] for x in soal_b)), align=WD_ALIGN_PARAGRAPH.CENTER)
    c = t.add_row().cells
    _cell(c[0], "Jumlah", bold=True)
    _cell(c[2], str(len(data["soal"])), bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    _cell(c[3], str(total), bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    _widths(t, [5.5, 3.5, 3.5, 4.5])
    _p(d, after=4)
    _p(d, f"Nilai Akhir = (Jumlah skor yang diperoleh ÷ {total}) × 100", bold=True, after=8)

    _p(d, "Ketercapaian Tujuan Pembelajaran (KKTP)", bold=True, after=4)
    t = d.add_table(rows=1, cols=3)
    t.style = "Table Grid"
    _header_row(t, ["Tujuan Pembelajaran", "Kriteria Ketercapaian", "Nomor Soal"])
    for tp in data["tujuan_pembelajaran"]:
        nomor = [str(s["nomor"]) for s in data["soal"] if s["kode_tp"] == tp["kode"]]
        c = t.add_row().cells
        _cell(c[0], f"{tp['kode']}. {tp['deskripsi']}")
        _cell(c[1], "\n".join(f"• {k}" for k in tp["kktp"]))
        _cell(c[2], ", ".join(nomor) or "-", align=WD_ALIGN_PARAGRAPH.CENTER)
    _widths(t, [6.5, 8, 2.5])
    _p(d, after=4)
    t = d.add_table(rows=1, cols=2)
    t.style = "Table Grid"
    _header_row(t, ["Rentang Nilai", "Interpretasi"])
    for a, b in [("0 – 60", "Belum mencapai; perlu bimbingan/remedial pada seluruh TP"),
                 ("61 – 70", "Belum mencapai sepenuhnya; perlu remedial pada sebagian TP"),
                 ("71 – 80", "Sudah mencapai; tidak perlu remedial"),
                 ("81 – 100", "Sudah mencapai dengan sangat baik; perlu pengayaan")]:
        c = t.add_row().cells
        _cell(c[0], a, align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell(c[1], b)
    _widths(t, [4, 13])
    _p(d, "Rentang interpretasi dapat disesuaikan dengan kebijakan satuan pendidikan.", italic=True, size=9, after=10)
    _ttd(d, info)
    d.save(path)


def _format_kunci(s):
    b = s["bentuk"]
    if b == "benar_salah":
        return "\n".join(f"{i}. {k}" for i, k in enumerate(s["kunci"], 1))
    if b == "menjodohkan":
        return ", ".join(s["kunci"])
    if b == "pg":
        return s["kunci"][0] if s["kunci"] else "-"
    if b == "pg_kompleks":
        return ", ".join(s["kunci"])
    return " / ".join(s["kunci"])


def _format_skor(s):
    return str(s["skor_maks"])


def _aturan_skor(b):
    return {
        "pg": "Skor: jawaban benar = 1, salah/kosong = 0.",
        "pg_kompleks": "Skor: semua pilihan benar = 2; sebagian benar tanpa pilihan salah = 1; lainnya = 0.",
        "benar_salah": "Skor: setiap pernyataan yang dijawab benar = 1.",
        "menjodohkan": "Skor: setiap pasangan yang benar = 1.",
        "isian": "Skor: jawaban benar dan lengkap = 2; kurang tepat/kurang lengkap = 1; salah/kosong = 0.",
    }[b]


def buat_semua(data, info, folder, prefix, log):
    os.makedirs(folder, exist_ok=True)

    def unik(nama):
        p = os.path.join(folder, nama + ".docx")
        i = 2
        while os.path.exists(p):
            p = os.path.join(folder, f"{nama} ({i}).docx")
            i += 1
        return p

    paths = [unik(f"{prefix} - 1 Kisi-kisi"), unik(f"{prefix} - 2 Soal"), unik(f"{prefix} - 3 Kunci dan Rubrik")]
    log("Menyusun file kisi-kisi…")
    kisi_kisi(data, info, paths[0])
    log("Menyusun file soal…")
    with tempfile.TemporaryDirectory() as img_dir:
        naskah_soal(data, info, paths[1], img_dir)
    log("Menyusun file kunci jawaban & rubrik…")
    kunci_rubrik(data, info, paths[2])
    return paths
