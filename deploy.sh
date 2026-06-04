#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/checkool}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "Pulling latest code from $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Installing dependencies..."
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "Building frontend..."
npm run build

mkdir -p "$APP_DIR/logs"

echo "Reloading PM2 app..."
if pm2 describe checkool >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo "Deployment complete."
echo "App: https://checkool.online"
