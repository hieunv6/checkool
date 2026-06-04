#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/.app.pid"

kill_tree() {
  local pid="$1"
  local child

  while IFS= read -r child; do
    if [[ -n "$child" ]]; then
      kill_tree "$child"
    fi
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill "$pid" 2>/dev/null || true
}

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file found. App does not look like it was started by start.sh."
  exit 0
fi

APP_PID="$(cat "$PID_FILE")"
if [[ -z "$APP_PID" ]] || ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "Stored PID is not running. Cleaning up PID file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping app with PID $APP_PID..."
kill_tree "$APP_PID"
sleep 1

if kill -0 "$APP_PID" 2>/dev/null; then
  kill -9 "$APP_PID" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "App stopped."
