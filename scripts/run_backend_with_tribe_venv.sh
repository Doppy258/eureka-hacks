#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="$REPO_ROOT/new-test/tribev2/.venv/bin/python"

if [[ ! -x "$PY" ]]; then
  echo "Expected TRIBE venv python at: $PY" >&2
  echo "Create it first under new-test/tribev2/.venv" >&2
  exit 1
fi

export PYTHONPATH="$REPO_ROOT"

# Run with cwd = new-test/tribev2 so TRIBE's official defaults like cache_folder="./cache" work.
TRIBE_ROOT="$REPO_ROOT/new-test/tribev2"
cd "$TRIBE_ROOT"

# Match the TRIBE v2 demo defaults.
export TRIBE_CACHE="${TRIBE_CACHE:-./cache}"
export TRIBE_UPLOAD_DIR="${TRIBE_UPLOAD_DIR:-./uploads}"
export TRIBE_HARDCODED_VIDEO="${TRIBE_HARDCODED_VIDEO:-./IMG_2225.mp4}"

# Run the FastAPI app from repo root, but keep cwd anchored in TRIBE_ROOT.
exec "$PY" -m uvicorn backend.main:app --app-dir "$REPO_ROOT" --host 0.0.0.0 --port 8000

