#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILES=("$APP_DIR/.app-web.pid" "$APP_DIR/.app-api.pid" "$APP_DIR/.app.pid")

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

STOPPED=0

for pid_file in "${PID_FILES[@]}"; do
  if [[ ! -f "$pid_file" ]]; then
    continue
  fi

  app_pid="$(cat "$pid_file")"
  if [[ -z "$app_pid" ]] || ! kill -0 "$app_pid" 2>/dev/null; then
    rm -f "$pid_file"
    continue
  fi

  echo "Stopping PID $app_pid..."
  kill_tree "$app_pid"
  STOPPED=1
  rm -f "$pid_file"
done

sleep 1

if [[ "$STOPPED" -eq 0 ]]; then
  echo "No running app process found."
else
  echo "App stopped."
fi
