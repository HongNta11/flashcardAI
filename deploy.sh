#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Pulling latest master..."
git -C "$REPO_DIR" pull origin master

echo "==> Syncing backend dependencies (uv)..."
(cd "$REPO_DIR/backend" && uv sync --frozen --quiet)

echo "==> Restarting backend service..."
sudo systemctl restart flashcard-ai

echo "==> Waiting for service..."
sleep 2
sudo systemctl is-active --quiet flashcard-ai && echo "✓ Backend is running" || (echo "✗ Backend failed to start" && sudo journalctl -u flashcard-ai -n 10 && exit 1)

echo "==> Done. Live at http://learninghn.southeastasia.cloudapp.azure.com:8080"
