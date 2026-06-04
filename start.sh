#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/.app.pid"
LOG_FILE="$APP_DIR/.app.log"

cd "$APP_DIR"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "App is already running with PID $EXISTING_PID."
    echo "Open: http://localhost:5174/"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "node_modules not found. Installing dependencies..."
  npm install
fi

echo "Starting app..."
nohup npm run dev > "$LOG_FILE" 2>&1 &
APP_PID="$!"
echo "$APP_PID" > "$PID_FILE"

echo "App started with PID $APP_PID."
echo "Open: http://localhost:5174/"
echo "Logs: $LOG_FILE"
