#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED_ROOT="${SHARED_UI_ROOT:-/opt/shared-ui-components}"
SHARED_REPO="${SHARED_UI_REPO:-https://github.com/gnakij/shared-ui-components.git}"
LINK_PATH="$PROJECT_ROOT/src/components/ui"
TARGET_PATH="$SHARED_ROOT/react/src"

if [ ! -d "$SHARED_ROOT/.git" ]; then
  mkdir -p "$(dirname "$SHARED_ROOT")"
  git clone "$SHARED_REPO" "$SHARED_ROOT"
else
  git -C "$SHARED_ROOT" fetch --all --prune
fi

if [ ! -d "$TARGET_PATH" ]; then
  echo "Shared UI target not found: $TARGET_PATH" >&2
  exit 1
fi

if [ -e "$LINK_PATH" ] && [ ! -L "$LINK_PATH" ]; then
  echo "Refusing to replace non-symlink path: $LINK_PATH" >&2
  exit 1
fi

ln -sfn "$TARGET_PATH" "$LINK_PATH"
echo "Shared UI linked: $LINK_PATH -> $TARGET_PATH"
