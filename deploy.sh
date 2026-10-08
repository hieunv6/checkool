#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/checkool}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "Pulling latest code from $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Building and restarting Docker container..."
docker compose build
docker compose up -d

echo "Deployment complete."
echo "App: https://checkool.online"
