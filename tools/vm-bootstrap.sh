#!/usr/bin/env bash
# LOGEN VM bootstrap — run INSIDE a fresh throwaway Ubuntu/Debian VM (one with systemd).
# Installs Node.js + nginx (for real native validators & the pipeline test) + the privileged helper.
# Usage:  bash tools/vm-bootstrap.sh [repo-dir]
set -euo pipefail
ROOT="${1:-$HOME/logen}"
export DEBIAN_FRONTEND=noninteractive

echo "[bootstrap] installing deps (nodejs, npm, git, nginx)…"
sudo apt-get update -qq
sudo apt-get install -y -qq nodejs npm git nginx >/dev/null

if [ ! -d "$ROOT" ]; then
  echo "[bootstrap] cloning LOGEN → $ROOT"
  git clone --depth 1 https://github.com/Syamsuddin/ECC-OPS.git "$ROOT"
fi

echo "[bootstrap] installing privileged helper → /usr/local/bin/logen-sandbox-helper"
sudo install -m 0755 "$ROOT/tools/logen-sandbox-helper" /usr/local/bin/logen-sandbox-helper

echo "[bootstrap] starting nginx (for the pipeline test)…"
sudo systemctl enable --now nginx >/dev/null 2>&1 || true

echo "[bootstrap] OK — node $(node -v), $(nginx -v 2>&1)"
echo "Next:  bash $ROOT/tools/vm-test.sh"
