#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)

echo "==> Pushing books/ to master..."
git -C "$REPO_DIR" checkout master
git -C "$REPO_DIR" pull origin master
git -C "$REPO_DIR" checkout "$CURRENT" -- books/
git -C "$REPO_DIR" add books/
git -C "$REPO_DIR" diff --cached --quiet && echo "No changes in books/ to deploy." && git checkout "$CURRENT" && exit 0
git -C "$REPO_DIR" commit -m "books: sync flashcard data"
git -C "$REPO_DIR" push origin master
git -C "$REPO_DIR" checkout "$CURRENT"

echo "==> Done. books/ is live on master (no restart needed)."
