#!/usr/bin/env bash
# Purpose: double-click launcher for the Breadcrumb dev app. If an instance is already
# running it raises the existing window instead of starting a second one (the Vite dev
# port is single-instance). Started from the .desktop shortcut in the repo root.
set -u
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Only treat an instance on THIS display as "already running" — invisible test instances
# on Xvfb (:99) must not swallow the launch (2026-08-14).
existing_pid=""
for pid in $(pgrep -f "target/debug/breadcrumb-desktop" || true); do
  pid_display="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | grep '^DISPLAY=' | cut -d= -f2 || true)"
  if [ "$pid_display" = "${DISPLAY:-}" ]; then
    existing_pid="$pid"
    break
  fi
done
if [ -n "$existing_pid" ]; then
  win="$(xdotool search --pid "$existing_pid" 2>/dev/null | tail -1 || true)"
  if [ -n "$win" ]; then
    xdotool windowactivate "$win"
    exit 0
  fi
fi

cd "$REPO_DIR/apps/desktop"
exec pnpm tauri dev
