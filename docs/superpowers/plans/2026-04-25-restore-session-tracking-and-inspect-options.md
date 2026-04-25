# Restore Session Tracking + Inspect-Options UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the cohesive feature set lost during the rebase that cleaned up the chapter re-segmentation commit `d150b0e`: per-quiz-session UUID tracking on `progress` rows (backend + frontend) and a question-card UX that lets the user re-tap other options to inspect them on an already-answered card without rescoring.

**Architecture:** Backend gains a nullable `session_id TEXT` column on the `progress` table via an idempotent migration in `init_db`, plus a corresponding field on the `ProgressEntry` model and a 5-column `INSERT`. Frontend introduces two new `Quiz` component states — `sessionId` (UUID, regenerated on chapter switch) and `answered` (boolean, distinct from `selected`). The `handleSelect` handler is split: first tap scores and saves; subsequent taps just update `selected` for visual inspection.

**Tech Stack:** FastAPI + Pydantic v2 + SQLite (`sqlite3` stdlib) on backend with pytest 8 fixtures (`db_path`, `client`, `auth_headers`) defined in `backend/tests/conftest.py`. Preact 10 + `htm` ESM-from-CDN frontend with no build step or JS test framework — frontend verification is manual in a browser.

**Spec:** `docs/superpowers/specs/2026-04-25-restore-session-tracking-and-inspect-options-design.md`

**Branch:** `feature/restore-session-tracking` (spec already committed as `3edd03e`).

**Commit cadence note (Approach 1 from spec):** The spec specifies "single PR, single commit" so the user can review the change as one logical unit. The plan below uses TDD-per-task with multiple commits during implementation. Before pushing the PR, the implementer **must** squash these commits into one via `git rebase -i origin/master` or `git reset --soft origin/master && git commit`. The squash step is Task 7.

**Files touched:**

| File | Responsibility |
|---|---|
| `backend/app/db.py` | Idempotent `session_id` column migration in `init_db` |
| `backend/app/progress.py` | `ProgressEntry.session_id` field + 5-column `INSERT` |
| `backend/tests/test_progress.py` | 4 new tests: migration adds column, idempotent, stores value, stores NULL |
| `frontend/api.js` | `saveProgress(bookId, cardId, correct, sessionId)` |
| `frontend/app.js` | `sessionId` and `answered` state, updated `handleSelect`, styling switches to `answered`-driven, `← Question` button clears `selected` |

---

## Task 1: Backend migration — `session_id` column on `progress`

**Files:**
- Modify: `backend/app/db.py` (the `init_db` function body)
- Modify: `backend/tests/test_progress.py` (append two tests)

The migration is idempotent: it queries `PRAGMA table_info(progress)` and only adds the column if absent. Existing rows keep `NULL`. Two tests confirm the migration adds the column and is safe to call repeatedly.

- [ ] **Step 1: Read `backend/app/db.py` and locate `init_db`**

```bash
grep -n 'def init_db\|CREATE\|conn.commit' backend/app/db.py
```

Expected: `init_db` exists, contains `CREATE TABLE`/`CREATE INDEX` statements, and ends with `conn.commit()`. Confirm before editing.

- [ ] **Step 2: Append the failing migration tests**

Append these two tests to the **end** of `backend/tests/test_progress.py`. The file already imports `sqlite3` at the top; no new imports needed.

```python
def test_init_db_adds_session_id_column(db_path):
    from app.db import init_db
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
    conn.close()
    assert "session_id" in cols


def test_init_db_is_idempotent(db_path):
    from app.db import init_db
    init_db(db_path)
    init_db(db_path)  # second call must not raise
    conn = sqlite3.connect(db_path)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
    conn.close()
    assert "session_id" in cols
```

- [ ] **Step 3: Run the migration tests — confirm they FAIL**

```bash
cd backend && uv run pytest tests/test_progress.py::test_init_db_adds_session_id_column tests/test_progress.py::test_init_db_is_idempotent -v
```

Expected: both tests FAIL because the migration hasn't been added yet — `assert "session_id" in cols` will fail with `cols` containing `id`, `user_token`, `book_id`, `card_id`, `correct`, `created_at` (or whichever the existing schema has) but no `session_id`.

- [ ] **Step 4: Add the migration block to `init_db`**

Open `backend/app/db.py`. Inside `init_db`, after the existing `CREATE TABLE` and `CREATE INDEX` statements and **before** `conn.commit()`, add:

```python
        cols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
        if "session_id" not in cols:
            conn.execute("ALTER TABLE progress ADD COLUMN session_id TEXT")
```

(Indentation must match the surrounding `with` block — typically 8 spaces for code inside `with conn:` inside `init_db`.)

- [ ] **Step 5: Run the migration tests — confirm they PASS**

```bash
cd backend && uv run pytest tests/test_progress.py::test_init_db_adds_session_id_column tests/test_progress.py::test_init_db_is_idempotent -v
```

Expected: both tests PASS.

- [ ] **Step 6: Run the full `test_progress.py` suite — confirm no regression**

```bash
cd backend && uv run pytest tests/test_progress.py -v
```

Expected: all existing tests (`test_save_progress_returns_201`, `test_save_progress_stores_entry`, `test_get_progress_returns_results`, `test_get_progress_empty_for_new_book`) plus the two new ones all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/db.py backend/tests/test_progress.py
git commit -m "feat(backend): add idempotent session_id column migration to init_db"
```

---

## Task 2: Backend route — `ProgressEntry.session_id` + 5-column `INSERT`

**Files:**
- Modify: `backend/app/progress.py` (the `ProgressEntry` Pydantic model and the `save_progress` route body)
- Modify: `backend/tests/test_progress.py` (append two tests)

Pydantic field is optional (defaults to `None`) so existing clients without `session_id` continue to work — those rows store `NULL`.

- [ ] **Step 1: Read `backend/app/progress.py` and confirm current model + route shape**

```bash
sed -n '1,40p' backend/app/progress.py
```

Expected: `ProgressEntry(BaseModel)` with fields `book_id`, `card_id`, `correct`. `save_progress` runs an `INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)`.

- [ ] **Step 2: Append the failing route tests**

Append these two tests to the end of `backend/tests/test_progress.py` (after the migration tests from Task 1):

```python
def test_save_progress_stores_session_id(client, db_path, auth_headers):
    response = client.post(
        "/progress",
        json={
            "book_id": "clean-code",
            "card_id": "cc-001",
            "correct": True,
            "session_id": "sess-abc-123",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_id FROM progress WHERE card_id='cc-001'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] == "sess-abc-123"


def test_save_progress_without_session_id_stores_null(client, db_path, auth_headers):
    response = client.post(
        "/progress",
        json={"book_id": "clean-code", "card_id": "cc-002", "correct": True},
        headers=auth_headers,
    )
    assert response.status_code == 201
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_id FROM progress WHERE card_id='cc-002'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] is None
```

- [ ] **Step 3: Run the new route tests — confirm they FAIL**

```bash
cd backend && uv run pytest tests/test_progress.py::test_save_progress_stores_session_id tests/test_progress.py::test_save_progress_without_session_id_stores_null -v
```

Expected behaviour:
- `test_save_progress_stores_session_id` will FAIL — Pydantic's default extra-field handling depends on the model config, but even if the field is silently ignored, the SELECT will return `None` instead of `"sess-abc-123"`.
- `test_save_progress_without_session_id_stores_null` will FAIL with `OperationalError: no such column: session_id` if the migration test didn't run first, OR with `row[0] is None` mismatch if the SELECT returns no rows because the INSERT shape is wrong.

If the second test errors with "no such column" rather than failing the assertion, that confirms the route still uses the 4-column INSERT against a schema that now has 5 columns — not an issue, but expected.

- [ ] **Step 4: Update `ProgressEntry` to add `session_id`**

In `backend/app/progress.py`, locate the `ProgressEntry(BaseModel)` definition. Add the new field:

```python
class ProgressEntry(BaseModel):
    book_id: str
    card_id: str
    correct: bool
    session_id: str | None = None
```

- [ ] **Step 5: Update the `INSERT` in `save_progress` to write 5 columns**

In `backend/app/progress.py`, locate the `db.execute(...)` call inside `save_progress`. Replace it with:

```python
    db.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct, session_id) "
        "VALUES (?,?,?,?,?)",
        (token, entry.book_id, entry.card_id, int(entry.correct), entry.session_id),
    )
```

- [ ] **Step 6: Run the new route tests — confirm they PASS**

```bash
cd backend && uv run pytest tests/test_progress.py::test_save_progress_stores_session_id tests/test_progress.py::test_save_progress_without_session_id_stores_null -v
```

Expected: both tests PASS.

- [ ] **Step 7: Run the full `test_progress.py` suite — confirm no regression**

```bash
cd backend && uv run pytest tests/test_progress.py -v
```

Expected: 8 tests pass — the original 4, the 2 from Task 1, and the 2 from this task.

- [ ] **Step 8: Run the full backend test suite to confirm no other tests broke**

```bash
cd backend && uv run pytest -v
```

Expected: all backend tests pass, including `test_auth.py` and `test_books.py`.

- [ ] **Step 9: Commit**

```bash
git add backend/app/progress.py backend/tests/test_progress.py
git commit -m "feat(backend): persist session_id on progress entries"
```

---

## Task 3: Frontend API client — `saveProgress` accepts `sessionId`

**Files:**
- Modify: `frontend/api.js` (the `saveProgress` method on the `api` export)

No JS test framework, so no automated test for this task. Static check via Node's syntax parser confirms the file is valid.

- [ ] **Step 1: Read the current `saveProgress` definition**

```bash
grep -n -A 5 'saveProgress' frontend/api.js
```

Expected output: a method that takes `(bookId, cardId, correct)` and POSTs `{ book_id: bookId, card_id: cardId, correct }`.

- [ ] **Step 2: Replace `saveProgress` to take `sessionId`**

Open `frontend/api.js`. Find the `saveProgress: ...` method on the `api` export and replace it with:

```js
  saveProgress: (bookId, cardId, correct, sessionId) =>
    request('/progress', {
      method: 'POST',
      body: JSON.stringify({
        book_id: bookId,
        card_id: cardId,
        correct,
        session_id: sessionId,
      }),
    }),
```

When `sessionId` is `undefined`, the request body's `session_id` becomes `undefined`, which `JSON.stringify` omits. The backend then stores `NULL` for that row (covered by `test_save_progress_without_session_id_stores_null` from Task 2). This is intentional — preserves backward compatibility with any older queued offline entries that don't carry a `sessionId`.

- [ ] **Step 3: Static syntax check**

```bash
node --input-type=module --check < frontend/api.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Confirm callers are still consistent (will be updated in Tasks 4-5)**

```bash
grep -n 'saveProgress' frontend/app.js frontend/api.js frontend/idb.js
```

Expected output: callers in `frontend/app.js` (currently passing 3 args). They will be updated in Tasks 4 and 5 — for now, the 4th arg is `undefined` which behaves correctly per Step 2's note.

- [ ] **Step 5: Commit**

```bash
git add frontend/api.js
git commit -m "feat(api): saveProgress accepts sessionId, sends as session_id"
```

---

## Task 4: Frontend `Quiz` — `sessionId` state + plumbing through handlers

**Files:**
- Modify: `frontend/app.js` (the `Quiz` component)

This task adds `sessionId` state (a UUID) and threads it through the handlers and the offline queue. It does **not** add the `answered` state yet — that comes in Task 5. After this task, the app's behavior is unchanged from the user's perspective; the only difference is that progress POSTs now include a `session_id` field in the body.

- [ ] **Step 1: Read the current `Quiz` component shape**

```bash
sed -n '85,100p;145,200p' frontend/app.js
```

Expected: `Quiz({ book, onFinish, onBack })` declares state with `useState` for `cards`, `index`, `shuffledOptions`, `selected`, `flipped`, `score`, `error`, `selectedSections`, `pendingSections`, `showChapters`. `applyChapters` and `applyAll` reset state and call `setShowChapters(false)`. `handleSelect` checks `if (selected) return;` then sets selected, scores, calls `api.saveProgress(book.id, card.id, correct).catch(...)`.

- [ ] **Step 2: Add `sessionId` state declaration to `Quiz`**

In `frontend/app.js`, find the block of `useState` declarations near the top of the `Quiz` function. Add this line at the end of that block (right after the existing `const [showChapters, setShowChapters] = useState(false);` line):

```js
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
```

The lazy initializer (`() => crypto.randomUUID()`) ensures the UUID is only generated once at mount, not on every render.

- [ ] **Step 3: Update `handleSelect` to thread `sessionId` through `api.saveProgress` and the offline queue**

Locate `async function handleSelect(option)` inside `Quiz`. Replace its body with:

```js
  async function handleSelect(option) {
    if (selected) return;
    setSelected(option);
    const correct = option === card.correct_answer;
    if (correct) setScore((s) => s + 1);
    setTimeout(() => setFlipped(true), 120);
    const entry = { bookId: book.id, cardId: card.id, correct, sessionId };
    if (navigator.onLine) {
      api.saveProgress(book.id, card.id, correct, sessionId).catch(() => queueProgress(entry));
    } else {
      await queueProgress(entry);
    }
  }
```

Two changes from the master version: the `entry` literal includes `sessionId`, and `api.saveProgress` receives `sessionId` as its 4th argument.

- [ ] **Step 4: Update `flushProgressQueue` callback to forward queued `sessionId`**

Locate the `useEffect` that flushes the offline progress queue. It currently looks like:

```js
  useEffect(() => {
    if (navigator.onLine) {
      flushProgressQueue(({ bookId, cardId, correct }) =>
        api.saveProgress(bookId, cardId, correct)
      ).catch(() => {});
    }
  }, []);
```

Replace it with:

```js
  useEffect(() => {
    if (navigator.onLine) {
      flushProgressQueue(({ bookId, cardId, correct, sessionId: qSessionId }) =>
        api.saveProgress(bookId, cardId, correct, qSessionId)
      ).catch(() => {});
    }
  }, []);
```

Queued entries from before this rollout don't carry `sessionId`; `qSessionId` will be `undefined` for those, which the backend stores as `NULL` per Task 2's test.

- [ ] **Step 5: Add session UUID rotation to `applyChapters`**

Locate `function applyChapters()`. Add `setSessionId(crypto.randomUUID());` as the last line of the function body:

```js
  function applyChapters() {
    if (pendingSections !== null && pendingSections.length === 0) return;
    setSelectedSections(pendingSections);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(crypto.randomUUID());
  }
```

- [ ] **Step 6: Add session UUID rotation to `applyAll`**

Locate `function applyAll()`. Add the same `setSessionId(crypto.randomUUID());` line:

```js
  function applyAll() {
    setSelectedSections(null);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(crypto.randomUUID());
  }
```

- [ ] **Step 7: Static syntax check**

```bash
node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/app.js
git commit -m "feat(quiz): generate per-session UUID, send with progress, rotate on chapter switch"
```

---

## Task 5: Frontend `Quiz` — `answered` state + inspect-options UX

**Files:**
- Modify: `frontend/app.js` (the `Quiz` component)

This task adds the `answered` state and rewrites `handleSelect`, the options-shuffling effect, the apply handlers, the option-button styling, and the `← Question` back button. The semantic split: `selected` = which option the user is currently inspecting; `answered` = has this card already been scored.

- [ ] **Step 1: Add `answered` state declaration to `Quiz`**

In `frontend/app.js`, find the block of `useState` declarations near the top of the `Quiz` function. Add this line at the end of that block (right after the `sessionId` line added in Task 4):

```js
  const [answered, setAnswered] = useState(false);
```

- [ ] **Step 2: Add `setAnswered(false)` to the deck-based options-shuffling effect**

Locate the `useEffect` keyed on `[deck, index]` (introduced in PR #7). It currently resets three things: `setShuffledOptions`, `setSelected`, `setFlipped`. Add a fourth:

```js
  useEffect(() => {
    if (deck && deck[index]) {
      setShuffledOptions(shuffle(deck[index].options));
      setSelected(null);
      setFlipped(false);
      setAnswered(false);
    }
  }, [deck, index]);
```

- [ ] **Step 3: Add `setAnswered(false)` to `applyChapters` and `applyAll`**

Both functions also need to reset `answered`. Locate `function applyChapters()` and add `setAnswered(false);` after `setFlipped(false);`. Locate `function applyAll()` and do the same. Final shape of each:

```js
  function applyChapters() {
    if (pendingSections !== null && pendingSections.length === 0) return;
    setSelectedSections(pendingSections);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setAnswered(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(crypto.randomUUID());
  }

  function applyAll() {
    setSelectedSections(null);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setAnswered(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(crypto.randomUUID());
  }
```

- [ ] **Step 4: Rewrite `handleSelect` to split scoring from inspection**

Replace the body of `handleSelect` with:

```js
  async function handleSelect(option) {
    if (answered) {
      setSelected(option);
      return;
    }
    setAnswered(true);
    setSelected(option);
    const correct = option === card.correct_answer;
    if (correct) setScore((s) => s + 1);
    setTimeout(() => setFlipped(true), 120);
    const entry = { bookId: book.id, cardId: card.id, correct, sessionId };
    if (navigator.onLine) {
      api.saveProgress(book.id, card.id, correct, sessionId).catch(() => queueProgress(entry));
    } else {
      await queueProgress(entry);
    }
  }
```

The early-return path on `if (answered)` only updates `selected` — no rescoring, no second `api.saveProgress` call, no second offline-queue entry.

- [ ] **Step 5: Update option-button styling — switch from `selected`-driven to `answered`-driven**

Locate the `shuffledOptions.map((opt) => { ... })` block inside the question card-face. The current `isCorrectOpt` and `isWrongOpt` declarations read:

```js
const isCorrectOpt = selected && opt === card.correct_answer;
const isWrongOpt = selected && opt === selected && opt !== card.correct_answer;
```

Replace with:

```js
const isCorrectOpt = answered && opt === card.correct_answer;
const isWrongOpt = answered && opt === selected && opt !== card.correct_answer;
```

- [ ] **Step 6: Drop the conditional cursor on the option button**

In the same `shuffledOptions.map` block, the option `<button>` has a style string that includes `cursor:${selected ? 'default' : 'pointer'}`. Replace that fragment with `cursor:pointer` so re-tap is always possible. Concretely the style string should change from:

```
...border:1px solid ${...};cursor:${selected ? 'default' : 'pointer'};text-align:left;...
```

to:

```
...border:1px solid ${...};cursor:pointer;text-align:left;...
```

(Leave every other style declaration in that string unchanged.)

- [ ] **Step 7: Update the "← Question" back button to clear `selected`**

Locate the `<button>` on the back face of the card whose label is `← Question`. Its `onClick` is currently `${() => setFlipped(false)}`. Replace with:

```js
              onClick=${() => { setFlipped(false); setSelected(null); }}
```

This ensures the user returning to the question side starts with no option pre-highlighted; tapping any option then re-highlights via the `answered`-driven styling without rescoring.

- [ ] **Step 8: Verify no remaining `selected ? 'default'` or `if (selected) return` patterns**

```bash
grep -n "selected ? 'default'\|if (selected) return" frontend/app.js
```

Expected: empty (no matches).

- [ ] **Step 9: Static syntax check**

```bash
node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add frontend/app.js
git commit -m "feat(quiz): split answered/selected so re-tap inspects without rescoring"
```

---

## Task 6: Manual browser verification

**Files:** None modified. This is a verification gate.

Run the app locally however you normally do for development. Then perform each of the six checks from the spec's Verification section:

- [ ] **Step 1: Inspect-options UX**

Answer a card with a wrong option → red highlight on chosen, green on correct. Tap a different wrong option → previous red clears, new option goes red, correct stays green. Tap the correct option → green stays, no red.

- [ ] **Step 2: No rescore on re-tap**

Open DevTools Network panel. Answer a card. Confirm exactly one POST to `/progress`. Re-tap several other options. Confirm no further POSTs.

- [ ] **Step 3: Back-and-forward preserves answered**

Tap the **← Question** button on the back face. Re-enter the question side. Confirm no option is pre-highlighted. Tap any option. Confirm: red/green highlights apply (since `answered` is still true), no new POST to `/progress`.

- [ ] **Step 4: Chapter switch starts a new session**

Open DevTools Network panel. Answer a card. Note the `session_id` in the POST body. Open the chapter sheet, switch chapters, apply. Answer the first card on the new filter. Confirm the `session_id` in the new POST is a different UUID.

- [ ] **Step 5: Database row inspection**

After several sessions:

```bash
sqlite3 backend/flashcards.db "SELECT DISTINCT session_id FROM progress WHERE session_id IS NOT NULL"
```

Expected: one UUID per study session listed.

- [ ] **Step 6: Backward compatibility check**

Confirm the deck-progress percentage on the book list page still computes correctly (this calls `GET /progress/{book_id}` which reads `card_id`, not `session_id`, so should be unaffected). Existing rows with `NULL` `session_id` remain in the table and continue to count toward "reviewed" cards.

- [ ] **Step 7: Stop here on any failure**

If any step fails, do not proceed to Task 7. Investigate and fix; re-run the failing step. Only proceed once all 6 steps pass.

---

## Task 7: Squash to single commit per spec's Approach 1

**Files:** None directly modified. This is a git history operation per the spec's "single commit" requirement.

- [ ] **Step 1: Confirm we have the expected commits to squash**

```bash
git log --oneline origin/master..HEAD
```

Expected output (5 commits beyond `origin/master` plus the spec):

```
<sha7> feat(quiz): split answered/selected so re-tap inspects without rescoring
<sha6> feat(quiz): generate per-session UUID, send with progress, rotate on chapter switch
<sha5> feat(api): saveProgress accepts sessionId, sends as session_id
<sha4> feat(backend): persist session_id on progress entries
<sha3> feat(backend): add idempotent session_id column migration to init_db
3edd03e docs: add spec to restore session tracking and inspect-options UX
```

If you see a different set, stop and investigate.

- [ ] **Step 2: Soft-reset to `origin/master` to stage all changes for one commit**

```bash
git reset --soft origin/master
```

This moves `HEAD` back to `origin/master` while keeping every change in the index — so a single `git commit` will produce one commit containing all 6 files' worth of work plus the spec.

- [ ] **Step 3: Create the single commit**

```bash
git commit -m "$(cat <<'EOF'
feat: restore session tracking and inspect-options UX

Adds idempotent session_id migration on the progress table, threads a
per-quiz-session UUID through the progress POST and offline queue (rotated
on chapter switch), and splits answered from selected so the user can
re-tap other options on an answered card to inspect them without
rescoring or re-saving progress.

Spec: docs/superpowers/specs/2026-04-25-restore-session-tracking-and-inspect-options-design.md
Plan: docs/superpowers/plans/2026-04-25-restore-session-tracking-and-inspect-options.md
EOF
)"
```

- [ ] **Step 4: Confirm the squash produced one commit ahead of `origin/master`**

```bash
git log --oneline origin/master..HEAD
```

Expected: a single line showing the new squashed commit's SHA + the message above's first line.

- [ ] **Step 5: Final full-test sanity pass**

```bash
cd backend && uv run pytest -v
```

Expected: every backend test passes — `test_auth.py`, `test_books.py`, and all 8 tests in `test_progress.py`.

```bash
node --input-type=module --check < frontend/api.js && node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0 for both.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feature/restore-session-tracking
```

If the GitHub credential issue from PR #7 returns (Enterprise Managed User can't create PRs), the push itself should still succeed — only the `gh pr create` step is blocked. Open the PR via the web UI at:

`https://github.com/HongNta11/flashcardAI/compare/master...feature/restore-session-tracking?expand=1`

Use this PR body:

```markdown
## Summary

Restores the cohesive feature set lost during the cleanup of `d150b0e`:

- **Session tracking:** Idempotent migration adds `session_id TEXT` to the `progress` table. Frontend generates a UUID per quiz session (rotated on chapter switch) and sends it with every progress POST. Existing rows keep `NULL`. Four new backend tests cover the migration and route.
- **Inspect-options UX:** New `answered` state, distinct from `selected`. After scoring a card, tapping other options updates only the highlight — no rescore, no re-save. The `← Question` back button clears `selected` so re-entering the question face is clean.

Spec: [docs/superpowers/specs/2026-04-25-restore-session-tracking-and-inspect-options-design.md](docs/superpowers/specs/2026-04-25-restore-session-tracking-and-inspect-options-design.md)
Plan: [docs/superpowers/plans/2026-04-25-restore-session-tracking-and-inspect-options.md](docs/superpowers/plans/2026-04-25-restore-session-tracking-and-inspect-options.md)

## Test plan

- [x] `cd backend && uv run pytest -v` — all backend tests pass (4 original + 4 new in `test_progress.py`)
- [x] `node --input-type=module --check < frontend/api.js` — passes
- [x] `node --input-type=module --check < frontend/app.js` — passes
- [x] Manual browser verification (6 checks per spec): inspect-options UX, no rescore on re-tap, back-and-forward preserves answered, chapter switch new session UUID, DB inspection shows distinct UUIDs, deck progress % unchanged for legacy NULL rows
```

---

## Self-Review

**Spec coverage** — every requirement in the spec maps to a task:

- Spec § Goals (1) — session tracking → Tasks 1, 2, 3, 4
- Spec § Goals (2) — inspect-options UX → Task 5
- Spec § Backend `db.py` migration → Task 1, Steps 4-7
- Spec § Backend `progress.py` model + INSERT → Task 2, Steps 4-9
- Spec § Backend tests (4 tests) → Task 1 (2) + Task 2 (2)
- Spec § Frontend `api.js` `saveProgress` → Task 3
- Spec § Frontend `app.js` `sessionId` state + apply rotations + handleSelect plumb + flushProgressQueue → Task 4
- Spec § Frontend `app.js` `answered` state + handleSelect rewrite + styling + ← Question → Task 5
- Spec § Verification → Task 6 (six checks, one-to-one)
- Spec § Approach 1 ("single commit") → Task 7

No spec requirement lacks a task.

**Placeholder scan** — no TBD/TODO/"implement later" anywhere in the plan. Every code block is the actual code; every shell command is a real command with a stated expected output.

**Type/name consistency** — `sessionId` (frontend variable), `session_id` (backend field/column/JSON), `setSessionId`, `setAnswered`, `answered`, `selected`, `setSelected`, `setShuffledOptions`, `deck`, `q_sessionId`/`qSessionId` (the destructured queued sessionId in the flush callback) — all consistent across tasks. The handleSelect rewrite in Task 4 (Step 3) is a stepping-stone that gets fully replaced in Task 5 (Step 4); both versions are shown in full so the implementer doesn't have to diff them mentally.

**Risk note for the executor:** Tasks 1 and 2 add tests that depend on each other transitively — Task 2's tests will fail with `OperationalError: no such column: session_id` if the migration from Task 1 isn't merged in first. The plan executes them in order, so this is fine. If you re-execute Task 2 in isolation against a stale DB, drop `flashcards.db` first or use `pytest tmp_path` (which is what the `db_path` fixture uses, so the conftest already isolates each test run).

---

Plan complete and saved to `docs/superpowers/plans/2026-04-25-restore-session-tracking-and-inspect-options.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
