"""Generator Soal SD — server lokal (Flask)."""
import json
import os
import re
import shutil
import subprocess
import threading
import traceback
import uuid
import webbrowser

import anthropic
from flask import Flask, jsonify, request, send_from_directory

import ai
import docx_builder

BASE = os.path.dirname(os.path.abspath(__file__))
CONF_DIR = os.path.expanduser("~/.config/generator-soal-sd")
CONF = os.path.join(CONF_DIR, "config.json")
RIWAYAT = os.path.join(BASE, "riwayat")

app = Flask(__name__, static_folder="static")
jobs: dict[str, dict] = {}


def load_conf() -> dict:
    try:
        with open(CONF, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_conf(conf: dict) -> None:
    os.makedirs(CONF_DIR, exist_ok=True)
    with open(CONF, "w", encoding="utf-8") as f:
        json.dump(conf, f, ensure_ascii=False, indent=2)
    os.chmod(CONF, 0o600)


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


@app.get("/api/config")
def get_conf():
    c = load_conf()
    out = {k: v for k, v in c.items() if k not in ("api_key", "logo_path")}
    out["punya_api_key"] = bool(c.get("api_key") or os.environ.get("ANTHROPIC_API_KEY"))
    out["punya_logo"] = bool(c.get("logo_path") and os.path.exists(c["logo_path"]))
    out.setdefault("folder", os.path.expanduser("~/Documents"))
    return jsonify(out)


@app.post("/api/api-key")
def set_key():
    key = (request.json or {}).get("api_key", "").strip()
    c = load_conf()
    c["api_key"] = key
    save_conf(c)
    return jsonify(ok=True)


@app.post("/api/pilih-folder")
def pilih_folder():
    awal = (request.json or {}).get("folder") or os.path.expanduser("~")
    if not shutil.which("zenity"):
        return jsonify(error="Dialog folder tidak tersedia; ketik path folder secara manual."), 400
    r = subprocess.run(
        ["zenity", "--file-selection", "--directory", "--title=Pilih folder penyimpanan",
         f"--filename={awal.rstrip('/')}/"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        return jsonify(folder=None)
    return jsonify(folder=r.stdout.strip())


def _int(v, d=0):
    try:
        return max(0, int(v))
    except (TypeError, ValueError):
        return d


@app.post("/api/generate")
def generate():
    f = request.form
    conf = load_conf()
    api_key = conf.get("api_key") or None
    if not (api_key or os.environ.get("ANTHROPIC_API_KEY")):
        return jsonify(error="API key Anthropic belum diisi (bagian Pengaturan)."), 400

    bentuk = f.get("bentuk", "pg")
    if bentuk == "campuran":
        jumlah = {k: _int(f.get(f"jml_{k}")) for k in ai.BENTUK}
    else:
        jumlah = {k: (_int(f.get("jumlah"), 10) if k == bentuk else 0) for k in ai.BENTUK}
    if sum(jumlah.values()) == 0:
        return jsonify(error="Jumlah soal masih 0."), 400
    if sum(jumlah.values()) > 60:
        return jsonify(error="Maksimal 60 soal sekali buat."), 400

    folder = os.path.expanduser(f.get("folder", "").strip())
    if not folder:
        return jsonify(error="Folder penyimpanan belum dipilih."), 400

    # logo: pakai yang baru diunggah, atau logo tersimpan sebelumnya
    logo_path = conf.get("logo_path")
    up = request.files.get("logo")
    if up and up.filename:
        os.makedirs(CONF_DIR, exist_ok=True)
        ext = os.path.splitext(up.filename)[1].lower() or ".png"
        logo_path = os.path.join(CONF_DIR, "logo" + ext)
        up.save(logo_path)
    if f.get("hapus_logo") == "1":
        logo_path = None

    info = {k: f.get(k, "").strip() for k in (
        "instansi", "nama_sekolah", "alamat", "jenis_asesmen", "tahun_ajaran", "semester",
        "mapel", "kelas", "waktu", "guru", "nip_guru", "kepsek", "nip_kepsek", "tempat_tanggal",
        "materi", "catatan", "kesulitan")}
    info["logo_path"] = logo_path
    if info["mapel"] not in ai.MAPEL or not info["kelas"].isdigit():
        return jsonify(error="Mata pelajaran/kelas tidak valid."), 400

    # simpan isian identitas sekolah untuk lain kali
    for k in ("instansi", "nama_sekolah", "alamat", "tahun_ajaran", "guru", "nip_guru",
              "kepsek", "nip_kepsek", "tempat_tanggal"):
        conf[k] = info[k]
    conf["folder"] = folder
    conf["logo_path"] = logo_path
    save_conf(conf)

    params = dict(info, jumlah=jumlah)
    job_id = uuid.uuid4().hex[:10]
    jobs[job_id] = {"status": "jalan", "log": [], "files": [], "error": None}
    threading.Thread(target=_kerja, args=(job_id, params, info, folder, api_key), daemon=True).start()
    return jsonify(job_id=job_id)


def _kerja(job_id, params, info, folder, api_key):
    job = jobs[job_id]
    log = job["log"].append
    try:
        data = ai.buat_soal(params, api_key, log)
        ai.buat_gambar(data, params["mapel"], api_key, log)
        os.makedirs(RIWAYAT, exist_ok=True)
        with open(os.path.join(RIWAYAT, f"{job_id}.json"), "w", encoding="utf-8") as fh:
            json.dump({"info": info, "data": data}, fh, ensure_ascii=False, indent=1)
        singkat = re.sub(r"[^\w\s-]", "", info["jenis_asesmen"]).strip()
        prefix = f"{ai.MAPEL[info['mapel']].split(' (')[0]} Kelas {info['kelas']} - {singkat}"
        prefix = re.sub(r"\s+", " ", prefix)[:90]
        job["files"] = docx_builder.buat_semua(data, info, folder, prefix, log)
        log("Semua file tersimpan.")
        job["status"] = "selesai"
    except anthropic.AuthenticationError:
        job.update(status="gagal", error="API key ditolak. Periksa kembali API key di Pengaturan.")
    except anthropic.RateLimitError:
        job.update(status="gagal", error="Batas pemakaian API tercapai. Tunggu sebentar lalu coba lagi.")
    except anthropic.APIConnectionError:
        job.update(status="gagal", error="Tidak dapat terhubung ke server AI. Periksa koneksi internet.")
    except anthropic.APIStatusError as e:
        job.update(status="gagal", error=f"Kesalahan API ({e.status_code}): {e.message}")
    except Exception as e:
        traceback.print_exc()
        job.update(status="gagal", error=str(e))


@app.get("/api/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify(error="Tugas tidak ditemukan."), 404
    return jsonify(job)


@app.post("/api/buka-folder")
def buka_folder():
    folder = (request.json or {}).get("folder", "")
    if os.path.isdir(folder):
        subprocess.Popen(["xdg-open", folder])
    return jsonify(ok=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5055))
    if not os.environ.get("NO_BROWSER"):
        threading.Timer(1.2, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    app.run(host="127.0.0.1", port=port, debug=False)
