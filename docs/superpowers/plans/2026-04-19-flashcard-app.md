# Flashcard App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal flashcard study system: a Claude Code skill reads `.md` books and writes companion `.json` card files; a FastAPI backend serves those files and stores per-card progress in SQLite; a Preact PWA lets you review cards on iOS with multiple-choice quizzes.

**Architecture:** `books/` folder holds `.md` source files and generated `.json` card files side-by-side. Backend reads JSON files from disk and stores progress in SQLite. Frontend is a no-build-step Preact PWA using HTM and CDN imports, caching cards in IndexedDB for offline use.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLite, Uvicorn; Preact 10 + HTM (CDN, no bundler), IndexedDB, Service Worker; Claude Code skill (`.claude/commands/` markdown file)

---

## File Structure

```
flashcard_ai/
├── .claude/
│   └── commands/
│       └── generate-flashcards.md    # Claude Code skill
├── books/
│   └── .gitkeep                      # .md books + generated .json live here
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app factory + CORS + lifespan
│   │   ├── auth.py                   # Bearer token dependency
│   │   ├── db.py                     # SQLite connection + schema init
│   │   ├── books.py                  # GET /books, GET /books/{id}/cards
│   │   └── progress.py               # POST /progress, GET /progress/{book_id}
│   └── tests/
│       ├── conftest.py               # tmp books dir, test DB, TestClient fixtures
│       ├── test_auth.py
│       ├── test_books.py
│       └── test_progress.py
└── frontend/
    ├── index.html                    # PWA entry, iOS meta tags
    ├── manifest.json                 # PWA manifest
    ├── sw.js                         # Service worker: cache assets, network-first API
    ├── api.js                        # fetch wrapper with bearer token
    ├── idb.js                        # IndexedDB: card cache + offline progress queue
    └── app.js                        # Preact app: router + BookList + Quiz + EndScreen
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `books/.gitkeep`
- Create: `.gitignore`
- Create: `backend/.env.example`

- [ ] **Step 1: Initialize git and directory structure**

```bash
cd /home/azureuser/pink/flashcard_ai
git init
mkdir -p books .claude/commands backend/app backend/tests frontend
touch books/.gitkeep
```

- [ ] **Step 2: Create .gitignore**

Create `/home/azureuser/pink/flashcard_ai/.gitignore`:
```
__pycache__/
*.pyc
.env
*.db
*.egg-info/
.venv/
```

- [ ] **Step 3: Create .env.example**

Create `/home/azureuser/pink/flashcard_ai/backend/.env.example`:
```
AUTH_TOKEN=change-me
BOOKS_DIR=../books
DB_PATH=./flashcards.db
```

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add .
git commit -m "chore: project scaffolding"
```

---

### Task 2: Backend package setup

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`

- [ ] **Step 1: Create pyproject.toml**

Create `/home/azureuser/pink/flashcard_ai/backend/pyproject.toml`:
```toml
[project]
name = "flashcard-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Create empty __init__.py**

Create `/home/azureuser/pink/flashcard_ai/backend/app/__init__.py` (empty file).

- [ ] **Step 3: Install dependencies**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Expected: packages install without errors.

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add backend/
git commit -m "chore: backend package setup"
```

---

### Task 3: Database module + conftest

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/tests/conftest.py`

The conftest also needs stub `books.py` and `main.py` so it can import them. Create those stubs here; Tasks 5 and 6 replace them with real implementations.

- [ ] **Step 1: Create db.py**

Create `/home/azureuser/pink/flashcard_ai/backend/app/db.py`:
```python
import os
import sqlite3
from typing import Generator


def get_db_path() -> str:
    return os.environ.get("DB_PATH", "./flashcards.db")


def init_db(db_path: str) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_token  TEXT NOT NULL,
                book_id     TEXT NOT NULL,
                card_id     TEXT NOT NULL,
                correct     INTEGER NOT NULL,
                reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_progress_book
            ON progress (user_token, book_id)
        """)
        conn.commit()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
```

- [ ] **Step 2: Create stub books.py**

Create `/home/azureuser/pink/flashcard_ai/backend/app/books.py`:
```python
import os
from pathlib import Path
from fastapi import APIRouter, Depends
from .auth import verify_token

router = APIRouter()


def get_books_dir() -> Path:
    return Path(os.environ.get("BOOKS_DIR", "./books"))


@router.get("/books")
def list_books(token: str = Depends(verify_token)):
    return {"books": []}
```

- [ ] **Step 3: Create stub auth.py**

Create `/home/azureuser/pink/flashcard_ai/backend/app/auth.py`:
```python
import os
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_security = HTTPBearer()


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> str:
    expected = os.environ.get("AUTH_TOKEN", "")
    if not expected or credentials.credentials != expected:
        raise HTTPException(status_code=403, detail="Invalid token")
    return credentials.credentials
```

- [ ] **Step 4: Create stub main.py**

Create `/home/azureuser/pink/flashcard_ai/backend/app/main.py`:
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db, get_db_path
from .books import router as books_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(get_db_path())
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Flashcard API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(books_router)
    return app


app = create_app()
```

- [ ] **Step 5: Create conftest.py**

Create `/home/azureuser/pink/flashcard_ai/backend/tests/conftest.py`:
```python
import json
import sqlite3
import pytest
from pathlib import Path
from starlette.testclient import TestClient


@pytest.fixture
def books_dir(tmp_path):
    d = tmp_path / "books"
    d.mkdir()
    return d


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def sample_book(books_dir):
    data = {
        "book": "test-book",
        "generated_at": "2026-01-01T00:00:00Z",
        "cards": [
            {
                "id": "tb-001",
                "question": "What is 2+2?",
                "options": ["3", "4", "5", "6"],
                "correct_answer": "4",
                "explanation": "Basic arithmetic.",
            },
            {
                "id": "tb-002",
                "question": "What color is the sky?",
                "options": ["Red", "Green", "Blue", "Yellow"],
                "correct_answer": "Blue",
                "explanation": "Rayleigh scattering.",
            },
        ],
    }
    (books_dir / "test-book.json").write_text(json.dumps(data))
    return books_dir


@pytest.fixture
def client(db_path, books_dir, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "test-token")

    from app.db import get_db, init_db
    from app.books import get_books_dir
    from app.main import app

    init_db(db_path)

    def _books_dir():
        return books_dir

    def _get_db():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_books_dir] = _books_dir
    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}
```

- [ ] **Step 6: Verify imports work**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
source .venv/bin/activate
python -c "from app.db import init_db, get_db; from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add backend/app/ backend/tests/conftest.py
git commit -m "feat: db schema, auth stub, and test fixtures"
```

---

### Task 4: Auth tests

**Files:**
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write tests**

Create `/home/azureuser/pink/flashcard_ai/backend/tests/test_auth.py`:
```python
def test_missing_token_returns_403(client):
    response = client.get("/books")
    assert response.status_code == 403


def test_wrong_token_returns_403(client):
    response = client.get("/books", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 403


def test_valid_token_returns_200(client, auth_headers):
    response = client.get("/books", headers=auth_headers)
    assert response.status_code == 200
```

- [ ] **Step 2: Run tests**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
source .venv/bin/activate
pytest tests/test_auth.py -v
```

Expected: all 3 PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add backend/tests/test_auth.py
git commit -m "test: bearer token auth"
```

---

### Task 5: Books endpoints (full implementation)

**Files:**
- Modify: `backend/app/books.py` (replace stub with real implementation)
- Create: `backend/tests/test_books.py`

- [ ] **Step 1: Write failing tests**

Create `/home/azureuser/pink/flashcard_ai/backend/tests/test_books.py`:
```python
import sqlite3


def test_list_books_empty(client, auth_headers):
    response = client.get("/books", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"books": []}


def test_list_books_returns_book(client, sample_book, auth_headers):
    response = client.get("/books", headers=auth_headers)
    assert response.status_code == 200
    books = response.json()["books"]
    assert len(books) == 1
    assert books[0]["id"] == "test-book"
    assert books[0]["card_count"] == 2
    assert books[0]["progress_pct"] == 0


def test_list_books_shows_progress(client, sample_book, db_path, auth_headers):
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)",
        ("test-token", "test-book", "tb-001", 1),
    )
    conn.commit()
    conn.close()

    response = client.get("/books", headers=auth_headers)
    books = response.json()["books"]
    assert books[0]["progress_pct"] == 50


def test_get_cards_returns_cards(client, sample_book, auth_headers):
    response = client.get("/books/test-book/cards", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["book"] == "test-book"
    assert len(data["cards"]) == 2
    assert data["cards"][0]["id"] == "tb-001"
    assert data["cards"][0]["correct_answer"] == "4"


def test_get_cards_404_unknown_book(client, auth_headers):
    response = client.get("/books/no-such-book/cards", headers=auth_headers)
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
source .venv/bin/activate
pytest tests/test_books.py -v
```

Expected: `test_list_books_empty` PASS (stub returns `[]`), others FAIL.

- [ ] **Step 3: Replace books.py with full implementation**

Replace `/home/azureuser/pink/flashcard_ai/backend/app/books.py`:
```python
import json
import os
import sqlite3
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from .auth import verify_token
from .db import get_db

router = APIRouter()


def get_books_dir() -> Path:
    return Path(os.environ.get("BOOKS_DIR", "./books"))


@router.get("/books")
def list_books(
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
    books_dir: Path = Depends(get_books_dir),
):
    books_dir.mkdir(parents=True, exist_ok=True)
    result = []
    for json_file in sorted(books_dir.glob("*.json")):
        book_id = json_file.stem
        data = json.loads(json_file.read_text())
        total = len(data["cards"])
        row = db.execute(
            "SELECT COUNT(DISTINCT card_id) AS reviewed FROM progress WHERE book_id = ?",
            (book_id,),
        ).fetchone()
        reviewed = row["reviewed"] if row else 0
        progress_pct = round(reviewed / total * 100) if total > 0 else 0
        result.append({
            "id": book_id,
            "title": book_id.replace("-", " ").title(),
            "card_count": total,
            "progress_pct": progress_pct,
        })
    return {"books": result}


@router.get("/books/{book_id}/cards")
def get_cards(
    book_id: str,
    token: str = Depends(verify_token),
    books_dir: Path = Depends(get_books_dir),
):
    json_file = books_dir / f"{book_id}.json"
    if not json_file.exists():
        raise HTTPException(status_code=404, detail="Book not found")
    return json.loads(json_file.read_text())
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
pytest tests/test_books.py -v
```

Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add backend/app/books.py backend/tests/test_books.py
git commit -m "feat: books endpoints with progress tracking"
```

---

### Task 6: Progress endpoints

**Files:**
- Create: `backend/app/progress.py`
- Modify: `backend/app/main.py` (add progress router)
- Create: `backend/tests/test_progress.py`

- [ ] **Step 1: Write failing tests**

Create `/home/azureuser/pink/flashcard_ai/backend/tests/test_progress.py`:
```python
import sqlite3


def test_save_progress_returns_201(client, auth_headers):
    response = client.post(
        "/progress",
        json={"book_id": "clean-code", "card_id": "cc-001", "correct": True},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json() == {"ok": True}


def test_save_progress_stores_entry(client, db_path, auth_headers):
    client.post(
        "/progress",
        json={"book_id": "clean-code", "card_id": "cc-001", "correct": False},
        headers=auth_headers,
    )
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT correct FROM progress WHERE book_id='clean-code' AND card_id='cc-001'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] == 0


def test_get_progress_returns_results(client, db_path, auth_headers):
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)",
        ("test-token", "clean-code", "cc-001", 1),
    )
    conn.commit()
    conn.close()

    response = client.get("/progress/clean-code", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["book_id"] == "clean-code"
    assert len(data["results"]) == 1
    assert data["results"][0]["card_id"] == "cc-001"
    assert data["results"][0]["correct"] == 1


def test_get_progress_empty_for_new_book(client, auth_headers):
    response = client.get("/progress/new-book", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["results"] == []
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
source .venv/bin/activate
pytest tests/test_progress.py -v
```

Expected: FAIL — 404 because the routes don't exist yet.

- [ ] **Step 3: Create progress.py**

Create `/home/azureuser/pink/flashcard_ai/backend/app/progress.py`:
```python
import sqlite3
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import verify_token
from .db import get_db

router = APIRouter()


class ProgressEntry(BaseModel):
    book_id: str
    card_id: str
    correct: bool


@router.post("/progress", status_code=201)
def save_progress(
    entry: ProgressEntry,
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)",
        (token, entry.book_id, entry.card_id, int(entry.correct)),
    )
    db.commit()
    return {"ok": True}


@router.get("/progress/{book_id}")
def get_progress(
    book_id: str,
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
):
    rows = db.execute(
        """SELECT card_id, correct, reviewed_at
           FROM progress
           WHERE user_token = ? AND book_id = ?
           ORDER BY reviewed_at DESC""",
        (token, book_id),
    ).fetchall()
    return {"book_id": book_id, "results": [dict(r) for r in rows]}
```

- [ ] **Step 4: Update main.py to include progress router**

Replace `/home/azureuser/pink/flashcard_ai/backend/app/main.py`:
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db, get_db_path
from .books import router as books_router
from .progress import router as progress_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(get_db_path())
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Flashcard API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(books_router)
    app.include_router(progress_router)
    return app


app = create_app()
```

- [ ] **Step 5: Run all backend tests**

```bash
pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add backend/app/progress.py backend/app/main.py backend/tests/test_progress.py
git commit -m "feat: progress endpoints"
```

---

### Task 7: Claude Code skill

**Files:**
- Create: `.claude/commands/generate-flashcards.md`
- Create: `books/sample.md` (test book)

- [ ] **Step 1: Create the skill file**

Create `/home/azureuser/pink/flashcard_ai/.claude/commands/generate-flashcards.md`:
```markdown
# Generate Flashcards

Generate multiple-choice flashcards from a Markdown book file and save them as JSON.

## Usage

`/generate-flashcards <book-filename.md>`

Run without arguments to list all `.md` files in the `books/` folder.

## Steps

1. If no argument provided: list all `.md` files in `books/` and stop.

2. Read `books/<filename>` from the project root.

3. Split content into sections by `##` headings. Skip sections shorter than 3 sentences.

4. For each section generate 3–5 multiple-choice flashcards. Each card:
   - `id`: `<book-slug>-<NNN>` (slug = filename without `.md`, NNN = zero-padded sequential integer starting at 001)
   - `question`: tests understanding of a concept in the section, not just wording recall
   - `options`: exactly 4 strings — 1 correct answer + 3 plausible distractors
   - `correct_answer`: exact text of the correct option (must match one entry in `options`)
   - `explanation`: 1–2 sentences explaining why the answer is correct and the others are not

5. Write output to `books/<book-slug>.json`:

```json
{
  "book": "<book-slug>",
  "generated_at": "<ISO 8601 UTC timestamp>",
  "cards": [ ... ]
}
```

6. Report: sections processed, total cards generated, output file path.

## Guidelines

- Questions test understanding, not rote recall of phrasing.
- Distractors are plausible but clearly wrong on reflection.
- Explanations teach, not just restate the answer.
- Never invent facts not present in the source text.
```

- [ ] **Step 2: Create sample book**

Create `/home/azureuser/pink/flashcard_ai/books/sample.md`:
```markdown
# Sample Book

## Chapter 1: Clean Functions

A function should do one thing and do it well. If a function does more than one thing, extract each concern into its own function. Small functions are easier to name, test, and understand.

Side effects are hidden actions a function takes beyond its stated purpose. A function named `checkPassword` that also initializes a session has a side effect. Prefer functions with no side effects when possible.

## Chapter 2: Meaningful Names

Names should reveal intent. A variable named `d` with a comment "elapsed time in days" should be renamed to `elapsedTimeInDays`. The name should make the comment unnecessary.

Avoid disinformation. Do not use names that mean something specific in programming (like `list` or `hp`) unless that is literally what they are. Misleading names cause subtle bugs.
```

- [ ] **Step 3: Run the skill to generate cards**

In a Claude Code session at `/home/azureuser/pink/flashcard_ai`:
```
/generate-flashcards sample.md
```

- [ ] **Step 4: Verify output**

```bash
cat /home/azureuser/pink/flashcard_ai/books/sample.json | python3 -m json.tool
```

Expected: valid JSON with `book: "sample"`, `generated_at`, and `cards` array where every card has `id`, `question`, `options` (4 items), `correct_answer` (matches one option), `explanation`.

- [ ] **Step 5: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add .claude/commands/generate-flashcards.md books/sample.md books/sample.json
git commit -m "feat: generate-flashcards Claude Code skill with sample book"
```

---

### Task 8: Frontend skeleton

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/manifest.json`

- [ ] **Step 1: Create manifest.json**

Create `/home/azureuser/pink/flashcard_ai/frontend/manifest.json`:
```json
{
  "name": "Flashcard Study",
  "short_name": "Flashcards",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#6c63ff",
  "icons": [
    {
      "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🃏</text></svg>",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Create index.html**

Create `/home/azureuser/pink/flashcard_ai/frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Flashcards" />
  <meta name="theme-color" content="#6c63ff" />
  <title>Flashcard Study</title>
  <link rel="manifest" href="/manifest.json" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --accent: #6c63ff;
      --text: #eaeaea;
      --text-muted: #8892b0;
      --correct: #4caf50;
      --wrong: #f44336;
      --radius: 12px;
    }
    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #app { min-height: 100%; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Verify it loads**

```bash
cd /home/azureuser/pink/flashcard_ai/frontend
python3 -m http.server 8080
```

Open `http://localhost:8080`. Expected: blank dark page, no console errors (404 for app.js is expected at this stage).

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/index.html frontend/manifest.json
git commit -m "feat: PWA skeleton with iOS meta tags"
```

---

### Task 9: API client

**Files:**
- Create: `frontend/api.js`

- [ ] **Step 1: Create api.js**

Create `/home/azureuser/pink/flashcard_ai/frontend/api.js`:
```js
const BASE = window.API_BASE || '';

export function getToken() {
  return localStorage.getItem('auth_token') || '';
}

export function setToken(token) {
  localStorage.setItem('auth_token', token);
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw Object.assign(new Error(res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  listBooks: () => request('/books'),
  getCards: (bookId) => request(`/books/${bookId}/cards`),
  saveProgress: (bookId, cardId, correct) =>
    request('/progress', {
      method: 'POST',
      body: JSON.stringify({ book_id: bookId, card_id: cardId, correct }),
    }),
  getProgress: (bookId) => request(`/progress/${bookId}`),
};
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/api.js
git commit -m "feat: API client with bearer token"
```

---

### Task 10: IndexedDB helpers

**Files:**
- Create: `frontend/idb.js`

Two object stores: `cards` (cached card JSON per book) and `progress_queue` (offline events to flush when back online).

- [ ] **Step 1: Create idb.js**

Create `/home/azureuser/pink/flashcard_ai/frontend/idb.js`:
```js
const DB_NAME = 'flashcards';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'book' });
      }
      if (!db.objectStoreNames.contains('progress_queue')) {
        db.createObjectStore('progress_queue', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheCards(bookData) {
  const db = await openDB();
  await idbRequest(db, 'cards', 'readwrite', (s) => s.put(bookData));
}

export async function getCachedCards(bookId) {
  const db = await openDB();
  return idbRequest(db, 'cards', 'readonly', (s) => s.get(bookId));
}

export async function queueProgress(entry) {
  const db = await openDB();
  await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.add(entry));
}

export async function flushProgressQueue(saveFn) {
  const db = await openDB();
  const entries = await idbRequest(db, 'progress_queue', 'readonly', (s) => s.getAll());
  const keys = await idbRequest(db, 'progress_queue', 'readonly', (s) => s.getAllKeys());
  for (let i = 0; i < entries.length; i++) {
    await saveFn(entries[i]);
    await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/idb.js
git commit -m "feat: IndexedDB helpers for card cache and offline queue"
```

---

### Task 11: App — router, token gate, book list

**Files:**
- Create: `frontend/app.js`

- [ ] **Step 1: Create app.js**

Create `/home/azureuser/pink/flashcard_ai/frontend/app.js`:
```js
import { h, render } from 'https://esm.sh/preact@10';
import { useState, useEffect } from 'https://esm.sh/preact@10/hooks';
import htm from 'https://esm.sh/htm@3';
import { api, getToken, setToken } from './api.js';
import { cacheCards, getCachedCards, queueProgress, flushProgressQueue } from './idb.js';

const html = htm.bind(h);

// ── Token Gate ────────────────────────────────────────────────────────────────
function TokenGate({ onAuth }) {
  const [value, setValue] = useState('');
  return html`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:24px">
      <div style="font-size:3rem">🃏</div>
      <h1 style="font-size:1.75rem">Flashcards</h1>
      <p style="color:var(--text-muted)">Enter your access token</p>
      <input
        type="password"
        placeholder="Token"
        value=${value}
        onInput=${(e) => setValue(e.target.value)}
        onKeyDown=${(e) => e.key === 'Enter' && (setToken(value), onAuth())}
        style="padding:12px 16px;border-radius:var(--radius);border:1px solid var(--accent);background:var(--surface);color:var(--text);font-size:1rem;width:100%;max-width:320px"
      />
      <button
        onClick=${() => { setToken(value); onAuth(); }}
        style="padding:12px 0;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:320px"
      >Enter</button>
    </div>
  `;
}

// ── Book List ─────────────────────────────────────────────────────────────────
function BookList({ onSelect }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listBooks()
      .then((data) => setBooks(data.books))
      .catch((e) => setError(e.status === 403 ? 'Invalid token' : 'Failed to load books'));
  }, []);

  if (error) return html`<p style="padding:24px;color:var(--wrong)">${error}</p>`;
  if (!books) return html`<p style="padding:24px;color:var(--text-muted)">Loading…</p>`;

  return html`
    <div style="padding:16px;max-width:600px;margin:0 auto">
      <h1 style="font-size:1.5rem;margin:env(safe-area-inset-top,16px) 0 24px">📚 Books</h1>
      ${books.length === 0 && html`
        <p style="color:var(--text-muted)">No books yet. Run /generate-flashcards to create one.</p>
      `}
      ${books.map((b) => html`
        <div
          key=${b.id}
          onClick=${() => onSelect(b)}
          style="background:var(--surface);border-radius:var(--radius);padding:16px 20px;margin-bottom:12px;cursor:pointer;border:1px solid transparent;transition:border-color 0.2s"
          onMouseEnter=${(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave=${(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <div style="font-size:1.1rem;font-weight:600;margin-bottom:4px">${b.title}</div>
          <div style="color:var(--text-muted);font-size:0.875rem;margin-bottom:10px">${b.card_count} cards</div>
          <div style="background:#0d1117;border-radius:4px;height:6px;overflow:hidden">
            <div style="height:100%;background:var(--accent);width:${b.progress_pct}%;transition:width 0.4s"></div>
          </div>
          <div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">${b.progress_pct}% reviewed</div>
        </div>
      `)}
    </div>
  `;
}

// ── Quiz ──────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Quiz({ book, onFinish }) {
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      let data = await getCachedCards(book.id);
      if (!data) {
        try {
          data = await api.getCards(book.id);
          await cacheCards(data);
        } catch (e) {
          setError('Failed to load cards. Check your connection.');
          return;
        }
      }
      setCards(shuffle(data.cards));
    }
    load();
  }, [book.id]);

  useEffect(() => {
    if (cards && cards[index]) {
      setShuffledOptions(shuffle(cards[index].options));
      setSelected(null);
    }
  }, [cards, index]);

  useEffect(() => {
    if (navigator.onLine) {
      flushProgressQueue(({ bookId, cardId, correct }) =>
        api.saveProgress(bookId, cardId, correct)
      ).catch(() => {});
    }
  }, []);

  if (error) return html`<p style="padding:24px;color:var(--wrong)">${error}</p>`;
  if (!cards) return html`<p style="padding:24px;color:var(--text-muted)">Loading cards…</p>`;

  const card = cards[index];
  const isAnswered = selected !== null;
  const isCorrect = selected === card.correct_answer;

  async function handleSelect(option) {
    if (isAnswered) return;
    setSelected(option);
    const correct = option === card.correct_answer;
    if (correct) setScore((s) => s + 1);
    const entry = { bookId: book.id, cardId: card.id, correct };
    if (navigator.onLine) {
      api.saveProgress(book.id, card.id, correct).catch(() => queueProgress(entry));
    } else {
      await queueProgress(entry);
    }
  }

  function optionStyle(opt) {
    if (!isAnswered) return 'background:var(--surface)';
    if (opt === card.correct_answer) return 'background:var(--correct);color:#fff';
    if (opt === selected) return 'background:var(--wrong);color:#fff';
    return 'background:var(--surface);opacity:0.5';
  }

  return html`
    <div style="padding:16px;max-width:600px;margin:0 auto">
      <div style="padding-top:env(safe-area-inset-top,16px);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:var(--text-muted);font-size:0.875rem">${book.title}</span>
          <span style="color:var(--text-muted);font-size:0.875rem">${index + 1} / ${cards.length}</span>
        </div>
        <div style="background:#0d1117;border-radius:4px;height:4px">
          <div style="height:100%;background:var(--accent);width:${((index + 1) / cards.length) * 100}%;transition:width 0.3s"></div>
        </div>
      </div>

      <div style="background:var(--surface);border-radius:var(--radius);padding:24px;margin-bottom:20px;min-height:100px">
        <p style="font-size:1.05rem;line-height:1.6">${card.question}</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px">
        ${shuffledOptions.map((opt) => html`
          <button
            key=${opt}
            onClick=${() => handleSelect(opt)}
            style="padding:14px 16px;border-radius:var(--radius);border:1px solid var(--accent);cursor:pointer;text-align:left;font-size:1rem;transition:all 0.2s;${optionStyle(opt)}"
          >${opt}</button>
        `)}
      </div>

      ${isAnswered && html`
        <div style="margin-top:20px;padding:16px;background:var(--surface);border-radius:var(--radius);border-left:3px solid ${isCorrect ? 'var(--correct)' : 'var(--wrong)'}">
          <p style="font-size:0.875rem;font-weight:600;margin-bottom:6px;color:${isCorrect ? 'var(--correct)' : 'var(--wrong)'}">${isCorrect ? '✓ Correct' : '✗ Incorrect'}</p>
          <p style="line-height:1.5;font-size:0.95rem">${card.explanation}</p>
        </div>
        <button
          onClick=${() => index + 1 < cards.length ? setIndex((i) => i + 1) : onFinish({ score, total: cards.length })}
          style="margin-top:16px;width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
        >${index + 1 < cards.length ? 'Next Card →' : 'See Results'}</button>
      `}
    </div>
  `;
}

// ── End Screen ────────────────────────────────────────────────────────────────
function EndScreen({ result, book, onReview, onBack }) {
  const pct = Math.round((result.score / result.total) * 100);
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📖';
  return html`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;gap:16px">
      <div style="font-size:4rem">${emoji}</div>
      <h2 style="font-size:2rem">${result.score} / ${result.total}</h2>
      <p style="color:var(--text-muted)">${pct}% correct on ${book.title}</p>
      <button
        onClick=${onReview}
        style="padding:14px 0;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:300px"
      >Review Again</button>
      <button
        onClick=${onBack}
        style="padding:14px 0;background:var(--surface);color:var(--text);border:1px solid var(--accent);border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:300px"
      >← Back to Books</button>
    </div>
  `;
}

// ── App Router ────────────────────────────────────────────────────────────────
function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [screen, setScreen] = useState('books');
  const [selectedBook, setSelectedBook] = useState(null);
  const [quizResult, setQuizResult] = useState(null);

  if (!authed) {
    return html`<${TokenGate} onAuth=${() => setAuthed(true)} />`;
  }

  if (screen === 'books') {
    return html`<${BookList} onSelect=${(book) => {
      setSelectedBook(book);
      setScreen('quiz');
    }} />`;
  }

  if (screen === 'quiz') {
    return html`<${Quiz}
      book=${selectedBook}
      onFinish=${(result) => { setQuizResult(result); setScreen('end'); }}
    />`;
  }

  if (screen === 'end') {
    return html`<${EndScreen}
      result=${quizResult}
      book=${selectedBook}
      onReview=${() => setScreen('quiz')}
      onBack=${() => { setSelectedBook(null); setScreen('books'); }}
    />`;
  }
}

render(html`<${App} />`, document.getElementById('app'));
```

- [ ] **Step 2: Manual test — full frontend flow**

With the dev server running at `http://localhost:8080` and the backend at port 8001 with a sample book:

1. Open `http://localhost:8080` — token gate appears
2. Enter `test` and click Enter — book list loads (or shows "No books yet" if backend isn't running)
3. If books appear, tap one — quiz screen shows with question and 4 option buttons
4. Select an answer — correct option turns green, explanation appears
5. Click Next Card — advances, progress bar updates
6. Complete all cards — end screen shows score with emoji
7. Click "Review Again" — quiz restarts with reshuffled cards
8. Click "Back to Books" — book list updates with new progress %

- [ ] **Step 3: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/app.js
git commit -m "feat: complete PWA with quiz, end screen, and offline support"
```

---

### Task 12: Service worker

**Files:**
- Create: `frontend/sw.js`

- [ ] **Step 1: Create sw.js**

Create `/home/azureuser/pink/flashcard_ai/frontend/sw.js`:
```js
const CACHE = 'flashcards-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/api.js', '/idb.js', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/books') || url.pathname.startsWith('/progress')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{"error":"offline"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
```

- [ ] **Step 2: Verify service worker in DevTools**

Open `http://localhost:8080` in Chrome. DevTools → Application → Service Workers.
Expected: service worker registered, status "activated and is running".

- [ ] **Step 3: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/sw.js
git commit -m "feat: service worker with asset caching and offline API fallback"
```

---

### Task 13: Deployment config

**Files:**
- Create: `backend/start.sh`
- Create: `deploy/flashcard-ai.service`
- Create: `deploy/nginx-flashcard-ai.conf`

- [ ] **Step 1: Create start.sh**

Create `/home/azureuser/pink/flashcard_ai/backend/start.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
exec uvicorn app.main:app --host 127.0.0.1 --port 8001
```

```bash
chmod +x /home/azureuser/pink/flashcard_ai/backend/start.sh
```

- [ ] **Step 2: Create .env file for the server**

Create `/home/azureuser/pink/flashcard_ai/backend/.env`:
```
AUTH_TOKEN=change-me-to-a-strong-random-token
BOOKS_DIR=/home/azureuser/pink/flashcard_ai/books
DB_PATH=/home/azureuser/pink/flashcard_ai/backend/flashcards.db
```

- [ ] **Step 3: Create systemd service**

```bash
mkdir -p /home/azureuser/pink/flashcard_ai/deploy
```

Create `/home/azureuser/pink/flashcard_ai/deploy/flashcard-ai.service`:
```ini
[Unit]
Description=Flashcard AI API
After=network.target

[Service]
Type=simple
User=azureuser
WorkingDirectory=/home/azureuser/pink/flashcard_ai/backend
EnvironmentFile=/home/azureuser/pink/flashcard_ai/backend/.env
ExecStart=/home/azureuser/pink/flashcard_ai/backend/start.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Create nginx config**

Create `/home/azureuser/pink/flashcard_ai/deploy/nginx-flashcard-ai.conf`:
```nginx
server {
    listen 80;
    server_name flashcards.yourdomain.com;

    root /home/azureuser/pink/flashcard_ai/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Note: when deploying with nginx, add `<script>window.API_BASE='/api'</script>` to `index.html` just before the `app.js` script tag so the frontend routes API calls through the nginx proxy.

- [ ] **Step 5: Run final full test suite**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
source .venv/bin/activate
pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add backend/start.sh deploy/ backend/.env.example
git commit -m "chore: deployment scripts for systemd and nginx"
```

---

### Task 14: End-to-end smoke test

**Files:** none — manual verification only.

- [ ] **Step 1: Start the backend**

```bash
cd /home/azureuser/pink/flashcard_ai/backend
source .venv/bin/activate
AUTH_TOKEN=smoke BOOKS_DIR=../books DB_PATH=./smoke.db uvicorn app.main:app --port 8001
```

- [ ] **Step 2: Generate sample flashcards (new terminal)**

In a Claude Code session at `/home/azureuser/pink/flashcard_ai`:
```
/generate-flashcards sample.md
```

Expected: `books/sample.json` created with cards.

- [ ] **Step 3: Test API endpoints**

```bash
# List books — should show sample
curl -s -H "Authorization: Bearer smoke" http://localhost:8001/books | python3 -m json.tool

# Get cards for sample
curl -s -H "Authorization: Bearer smoke" http://localhost:8001/books/sample/cards | python3 -m json.tool

# Save progress
curl -s -X POST \
  -H "Authorization: Bearer smoke" \
  -H "Content-Type: application/json" \
  -d '{"book_id":"sample","card_id":"sample-001","correct":true}' \
  http://localhost:8001/progress

# Check progress updated
curl -s -H "Authorization: Bearer smoke" http://localhost:8001/books | python3 -m json.tool
```

Expected: `progress_pct` > 0 on the last books call.

- [ ] **Step 4: Test the PWA**

```bash
cd /home/azureuser/pink/flashcard_ai/frontend
python3 -m http.server 8080
```

Open `http://localhost:8080`:
1. Enter token `smoke` → Book List shows "Sample"
2. Tap "Sample" → Quiz screen with questions
3. Answer all cards → End screen with score
4. "Back to Books" → progress bar reflects completed cards

- [ ] **Step 5: Clean up and final commit**

```bash
rm /home/azureuser/pink/flashcard_ai/backend/smoke.db
cd /home/azureuser/pink/flashcard_ai
git add -A
git commit -m "chore: smoke test complete"
```
