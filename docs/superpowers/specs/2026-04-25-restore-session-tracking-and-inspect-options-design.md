# Restore Session Tracking + Inspect-Options UX — Design Spec

**Date:** 2026-04-25
**Scope:** Backend (`backend/app/db.py`, `backend/app/progress.py`, `backend/tests/test_progress.py`) and frontend (`frontend/api.js`, `frontend/app.js`).
**Origin:** Reinstating work from the recovery branch `recovery/d150b0e-dropped-extras` (commit `d150b0e`), which was dropped during the 2026-04-25 rebase that cleaned up the chapter re-segmentation commit. The work is one cohesive change set covering two related features.
**Approach:** Single PR, single commit. Both features ship together.

---

## Goals

1. **Per-session tracking.** Persist a `session_id` UUID with each `progress` row so the backend can distinguish "user reviewed this card 5 times in 5 study sessions" from "user reviewed it 5 times in one rapid-fire session". Without this, progress reporting muddles repeat study and the deck progress percentage becomes inaccurate.

2. **Inspect-other-options UX on the answered card.** After the user answers a card, allow them to tap other options to inspect their state without rescoring or re-saving progress. Replaces the current "lock the card after answering" behavior.

These features ship together because the backend changes (1) and the frontend handler rewrite (2) both touch `frontend/app.js` in adjacent regions, so splitting into two PRs would force a contrived sequencing.

---

## Out of scope

- Any user-facing reporting endpoint that queries per-session data (`/progress/{book}/sessions`, etc.). The backend stores `session_id`; surfacing it is future work.
- Backfill of existing `progress` rows. They stay `NULL` for `session_id`.
- Page references on flashcards (separate paused brainstorm).
- Tag-filter redesign with topic dimensions (separate paused brainstorm).
- Any change to the `Quiz`-screen `useMemo`-based `deck` already on master from PR #7.

---

## Backend changes

### `backend/app/db.py` — idempotent migration

Add the following block inside `init_db`, after the existing `CREATE TABLE` / `CREATE INDEX` statements and before `conn.commit()`:

```python
cols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
if "session_id" not in cols:
    conn.execute("ALTER TABLE progress ADD COLUMN session_id TEXT")
```

**Behavior:** On a fresh DB the migration adds the column. On an existing DB the column is added on first boot after upgrade. On every subsequent boot the `if "session_id" not in cols` check is false and the migration is a no-op. Existing rows keep `NULL` for the new column.

**SQLite specifics:** `ALTER TABLE ... ADD COLUMN` is supported and atomic. The column is `TEXT` and nullable, so the migration cannot fail on existing data.

### `backend/app/progress.py` — model + INSERT

Add `session_id: str | None = None` to `ProgressEntry`:

```python
class ProgressEntry(BaseModel):
    book_id: str
    card_id: str
    correct: bool
    session_id: str | None = None
```

Update the `INSERT` in `save_progress` to write the new column:

```python
db.execute(
    "INSERT INTO progress (user_token, book_id, card_id, correct, session_id) "
    "VALUES (?,?,?,?,?)",
    (token, entry.book_id, entry.card_id, int(entry.correct), entry.session_id),
)
```

Clients that don't send `session_id` continue to work — the field defaults to `None`, which writes `NULL`.

### `backend/tests/test_progress.py` — 4 new tests

Append to the existing test file. All tests use existing fixtures (`db_path`, `client`, `auth_headers`).

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

`sqlite3` import: the existing `test_progress.py` already imports `sqlite3` at the top, so no new top-of-file imports are required.

---

## Frontend changes

### `frontend/api.js` — `saveProgress` gains `sessionId`

Replace the existing `saveProgress` function:

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

`sessionId` is required by callers (the only callers are inside the Quiz component). When the offline queue replays older entries that lack `sessionId`, it will pass `undefined` — JSON-serialized as the field being absent — and the backend stores `NULL` for those rows. Acceptable.

### `frontend/app.js` (Quiz component)

#### New state

```js
const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
const [answered, setAnswered] = useState(false);
```

`sessionId` is a fresh UUID generated when the Quiz component mounts. `answered` tracks whether the current card has been scored — distinct from `selected`, which tracks which option the user is currently inspecting.

#### Options-shuffling effect — add `setAnswered(false)`

The `[deck, index]`-keyed effect (introduced in PR #7) gains a fourth reset:

```js
useEffect(() => {
  if (deck && deck[index]) {
    setShuffledOptions(shuffle(deck[index].options));
    setSelected(null);
    setFlipped(false);
    setAnswered(false);  // new
  }
}, [deck, index]);
```

When the user advances to a new card, `answered` resets so the next card can be scored.

#### `applyChapters` and `applyAll` — reset answered + new session

Both add:

```js
setAnswered(false);
setSessionId(crypto.randomUUID());
```

A chapter filter switch is treated as a new study session (per the design's Q2 = "A": session boundaries are mount + chapter change).

#### `handleSelect` — split scoring from inspection

```js
async function handleSelect(option) {
  if (answered) {
    setSelected(option);  // re-tap just inspects, no rescore
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

#### Option-button styling — switch from `selected`-driven to `answered`-driven

Inside the `shuffledOptions.map`:

```js
const isCorrectOpt = answered && opt === card.correct_answer;
const isWrongOpt = answered && opt === selected && opt !== card.correct_answer;
```

Cursor stays `pointer` always — re-tap is intended:

```js
style="...cursor:pointer..."
```

(Drop the conditional `cursor:${selected ? 'default' : 'pointer'}`.)

#### "← Question" back button — clear `selected`

The button on the back face that returns to the question now clears `selected`:

```js
<button
  onClick=${() => { setFlipped(false); setSelected(null); }}
  ...
>← Question</button>
```

When the user returns to the question face, no option is pre-highlighted, so they can freely re-tap any option to inspect it.

#### `flushProgressQueue` callback — forward queued sessionId

```js
flushProgressQueue(({ bookId, cardId, correct, sessionId: qSessionId }) =>
  api.saveProgress(bookId, cardId, correct, qSessionId)
).catch(() => {});
```

Queued entries that pre-date this change won't have `sessionId` — `qSessionId` is `undefined`, which the backend stores as `NULL`. Acceptable.

---

## Files changed summary

| File | Change |
|---|---|
| `backend/app/db.py` | +3 lines: idempotent `session_id` migration |
| `backend/app/progress.py` | +2 / -2 lines: `session_id` field on model, 5-column INSERT |
| `backend/tests/test_progress.py` | +56 lines: 4 new tests |
| `frontend/api.js` | +5 / -2 lines: `saveProgress(bookId, cardId, correct, sessionId)` |
| `frontend/app.js` | ~+25 lines net: `sessionId` + `answered` state, two `applyX` resets, updated `handleSelect`, options effect adds `setAnswered`, button styling switches to `answered`, **← Question** clears `selected` |

No new files. No schema migration outside the SQLite `ALTER TABLE`. No new dependencies.

---

## Verification

### Backend

```bash
cd backend && uv run pytest tests/test_progress.py -v
```

All tests pass, including the four new tests.

### Frontend (manual, in browser)

1. **Inspect-options UX.** Answer a card with a wrong option → red highlight on chosen, green on correct. Tap a different wrong option → previous red clears, new option goes red, correct stays green. Tap the correct option → no red highlight (correct stays green, but the user's first answer was already scored, so no rescore).
2. **No rescore on re-tap.** Open DevTools Network panel. Answer a card. Confirm exactly one POST to `/progress`. Re-tap several other options. Confirm no further POSTs.
3. **Back-and-forward preserves answered.** Tap the "← Question" button on the back face. Re-enter the question side. Confirm no option is pre-highlighted. Tap any option. Confirm: red/green highlights apply (since `answered` is still true), no new POST to `/progress`.
4. **Chapter switch starts a new session.** Open DevTools Network panel. Answer a card. Note the `session_id` in the POST body. Open the chapter sheet, switch chapters, apply. Answer the first card on the new filter. Confirm the `session_id` in the new POST is a different UUID.
5. **Database row inspection.** After several sessions:
   ```bash
   sqlite3 backend/flashcards.db "SELECT DISTINCT session_id FROM progress WHERE session_id IS NOT NULL"
   ```
   Should list one UUID per study session.
6. **Backward compatibility.** Confirm existing `progress` rows from before this change still load via `GET /progress/{book_id}` and the deck-progress percentage on the book list page still computes correctly. (The endpoint reads `card_id`, not `session_id`, so this should be untouched.)

If any verification step fails, do not commit — investigate first.
