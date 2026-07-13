#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export PYTHONHASHSEED="${PYTHONHASHSEED:-0}"
exec python -m pytest -q backend/tests "$@"
