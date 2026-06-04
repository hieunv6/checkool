#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PID_FILE="$APP_DIR/.app-api.pid"
WEB_PID_FILE="$APP_DIR/.app-web.pid"
API_LOG_FILE="$APP_DIR/.app-api.log"
WEB_LOG_FILE="$APP_DIR/.app-web.log"
APP_URL="http://localhost:5174/"
API_URL="http://127.0.0.1:8787/"

cd "$APP_DIR"

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && [[ -n "$(cat "$pid_file")" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

if is_running "$API_PID_FILE" && is_running "$WEB_PID_FILE"; then
  echo "App is already running."
  echo "Open: $APP_URL"
  exit 0
fi

for pid_file in "$API_PID_FILE" "$WEB_PID_FILE" "$APP_DIR/.app.pid"; do
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
    fi
  fi
done

if [[ ! -d "$APP_DIR/node_modules" ]]; then
  echo "node_modules not found. Installing dependencies..."
  npm install
fi

echo "Starting API server..."
nohup npm run dev:api > "$API_LOG_FILE" 2>&1 &
API_PID="$!"
echo "$API_PID" > "$API_PID_FILE"

echo "Starting web app..."
nohup npm run dev:web -- --host 127.0.0.1 --port 5174 --strictPort > "$WEB_LOG_FILE" 2>&1 &
WEB_PID="$!"
echo "$WEB_PID" > "$WEB_PID_FILE"

echo "Waiting for app to become ready..."
for _ in {1..40}; do
  if curl -fsS "$APP_URL" >/dev/null 2>&1 && curl -fsS "$API_URL" >/dev/null 2>&1; then
    echo "App started."
    echo "Open: $APP_URL"
    echo "API: $API_URL"
    echo "Web logs: $WEB_LOG_FILE"
    echo "API logs: $API_LOG_FILE"
    exit 0
  fi
  sleep 0.5
done

echo "App did not become ready in time."
echo "Web logs: $WEB_LOG_FILE"
echo "API logs: $API_LOG_FILE"
exit 1
