#!/usr/bin/env bash
# Menjalankan Generator Soal SD lalu membuka browser ke http://127.0.0.1:5055
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv && .venv/bin/pip install -q anthropic flask python-docx pillow
fi
exec .venv/bin/python app.py
