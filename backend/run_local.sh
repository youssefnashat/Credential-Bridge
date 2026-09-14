#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
# python3, not python: macOS often has no `python`. Override with PYTHON=python3.11 ./run_local.sh
[ -d .venv ] || "${PYTHON:-python3}" -m venv .venv
.venv/bin/python -m pip install -q -U pip && .venv/bin/python -m pip install -q -r requirements.txt
# backend/.env is loaded by app/api.py itself (python-dotenv); exported env vars override it
exec .venv/bin/python -m uvicorn app.api:app --reload --port 8000
