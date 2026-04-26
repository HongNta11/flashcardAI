# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Backend**
```bash
# Install dependencies
cd backend && uv sync --frozen

# Run dev server
cd backend && AUTH_TOKEN=dev-token BOOKS_DIR=../books uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# Run all tests
cd backend && uv run pytest tests/

# Run a single test file
cd backend && uv run pytest tests/test_books.py

# Run a single test
cd backend && uv run pytest tests/test_books.py::test_list_books
```

**Frontend**
```bash
# Serve frontend (no build step — pure ESM with CDN imports)
python -m http.server 5173 --bind 127.0.0.1
```

**Deploy**
```bash
./deploy.sh         # Pull master, uv sync, restart systemd service
./deploy-books.sh   # Push books/ to master
```

## Architecture

Full-stack flashcard study app: FastAPI backend + Preact SPA frontend + SQLite + JSON book files.

```
books/          JSON flashcard decks (one file per book)
backend/
  app/
    main.py     FastAPI app factory, lifespan init, CORS
    auth.py     HTTPBearer token auth (env AUTH_TOKEN; 403 invalid, 500 unconfigured)
    db.py       SQLite init + idempotent migration for session_id column
    books.py    GET /books (with per-user progress%), GET /books/{id}/cards
    progress.py POST /progress, GET /progress/{book_id}
  tests/        pytest suite; fixtures in conftest.py (in-memory SQLite, tmp books dir)
frontend/
  index.html    PWA manifest, Preact mount, API base URL (/api or localhost:8000 fallback)
  app.js        4-screen router: TokenGate → BookList → Quiz → EndScreen
  api.js        HTTP client (Authorization: Bearer token)
  idb.js        IndexedDB wrapper: card cache, offline progress queue, flush-on-reconnect
  sw.js         Service worker: static cache-first, /books + /progress network-first
scripts/        One-off data processing scripts (markdown → structured JSON)
```

**Data flow**: Frontend authenticates with a Bearer token stored in localStorage. The API uses that token as the per-user key in the `progress` table — there are no user accounts. Books are loaded from JSON files at startup; progress is tracked in SQLite with `(user_token, book_id, card_id, session_id)`.

**Quiz state model** (`app.js` `QuizComponent`): Parallel arrays (`selections`, `answeredFlags`, `optionsByIndex`) indexed by card position track per-card state. Each quiz session has a UUID. Two phases: `'playing'` (normal/review card flow) and `'end'` (results screen). Review mode skips already-answered cards. Options are Fisher-Yates shuffled once per session.

**Offline-first**: Quiz works fully offline. Progress writes are queued in IndexedDB (`queueProgress`) and flushed to the API on reconnect (`flushProgressQueue`).

**Book JSON format**:
```json
{
  "book": "book-id",
  "cards": [
    { "id": "uid", "section": "Chapter/Subtopic", "question": "...",
      "options": ["A","B","C","D"], "correct_answer": "A", "explanation": "..." }
  ]
}
```

**Environment variables**: `AUTH_TOKEN` (required), `BOOKS_DIR` (default `./books`), `DB_PATH` (default `./flashcards.db`).
