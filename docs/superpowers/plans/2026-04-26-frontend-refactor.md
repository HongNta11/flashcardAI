# Frontend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Preact SPA frontend to extract quiz logic into a custom hook, split ChapterSheet into its own component, add shared style objects, add an error boundary, fix offline queue error handling, remove dead code, and add a token guard.

**Architecture:** Create `frontend/hooks/` and `frontend/components/` directories. `useQuizSession.js` pulls all 11 state slices + logic out of the 310-line `Quiz` god-function. `ChapterSheet.js` and `ErrorBoundary.js` are standalone Preact components. `styles.js` exports shared button style objects. `app.js` shrinks from 466 to ~220 lines. No new features; no library additions.

**Tech Stack:** Preact 10 (vendored ESM at `/lib/`), `htm` tagged template literals, browser IndexedDB, Service Worker, Python `http.server` for local dev

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/styles.js` | Shared btn/input style objects |
| Create | `frontend/hooks/useQuizSession.js` | All quiz state, derived values, handlers |
| Create | `frontend/components/ChapterSheet.js` | Chapter-filter modal |
| Create | `frontend/components/ErrorBoundary.js` | Preact class error boundary |
| Modify | `frontend/api.js` | Remove dead `getProgress` export |
| Modify | `frontend/idb.js` | Fix `flushProgressQueue` to stop on error |
| Modify | `frontend/app.js` | Use hook + components; trim to ~220 lines |
| Modify | `frontend/sw.js` | Add 4 new paths to `ASSETS` cache list |

---

### Task 1: Create shared style objects

**Files:**
- Create: `frontend/styles.js`

- [ ] **Step 1: Create `frontend/styles.js`**

```js
export const btnPrimary = {
  padding: '14px 0',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontSize: '1rem',
  cursor: 'pointer',
};

export const btnOutline = {
  padding: '14px',
  background: 'var(--surface)',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius)',
  fontSize: '1rem',
  cursor: 'pointer',
};

export const btnGhost = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--accent)',
  fontSize: '0.875rem',
  padding: '0',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

export const inputField = {
  padding: '12px 16px',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--accent)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: '1rem',
  width: '100%',
  maxWidth: '320px',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/styles.js
git commit -m "feat(frontend): add shared button and input style objects"
```

---

### Task 2: Create `useQuizSession` hook

**Files:**
- Create: `frontend/hooks/useQuizSession.js`

The hook extracts all 11 state slices from `Quiz`, memoizes `deck` and `sections`, consolidates the duplicated `applyChapters`/`applyAll` resets into `resetSession(newSelection)`, and exposes `startReview` / `startReviewSkipped` for the EndScreen callbacks.

`shuffle` and `randomUUID` helpers move here from `app.js`; they are not re-exported.

- [ ] **Step 1: Create `frontend/hooks/` directory and `frontend/hooks/useQuizSession.js`**

```js
import { useState, useEffect, useMemo } from '/lib/hooks.mjs';
import { api } from '../api.js';
import { cacheCards, getCachedCards, queueProgress, flushProgressQueue } from '../idb.js';

function randomUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function useQuizSession(book) {
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [optionsByIndex, setOptionsByIndex] = useState([]);
  const [selections, setSelections] = useState([]);
  const [answeredFlags, setAnsweredFlags] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(null);
  const [selectedSections, setSelectedSections] = useState(null);
  const [sessionId, setSessionId] = useState(() => randomUUID());
  const [reviewing, setReviewing] = useState(false);
  const [phase, setPhase] = useState('playing');

  // Load cards on book change — cache-first, API fallback
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

  // Apply section filter to produce the active deck
  const deck = useMemo(() => {
    if (!cards) return null;
    return selectedSections
      ? cards.filter((c) => selectedSections.includes(c.section))
      : cards;
  }, [cards, selectedSections]);

  // Unique section list for the chapter-filter UI
  const sections = useMemo(() => {
    if (!cards || !cards[0]?.section) return [];
    return [...new Set(cards.map((c) => c.section))];
  }, [cards]);

  // Re-initialise per-card parallel arrays whenever the deck reference changes
  useEffect(() => {
    if (!deck) return;
    setOptionsByIndex(deck.map((c) => shuffle(c.options)));
    setSelections(new Array(deck.length).fill(null));
    setAnsweredFlags(new Array(deck.length).fill(false));
    setReviewing(false);
    setPhase('playing');
  }, [deck]);

  // Reset flip state on card navigation
  useEffect(() => {
    setFlipped(false);
  }, [index]);

  // Flush any offline-queued progress on mount
  useEffect(() => {
    if (navigator.onLine) {
      flushProgressQueue(({ bookId, cardId, correct, sessionId: qSessionId }) =>
        api.saveProgress(bookId, cardId, correct, qSessionId)
      ).catch(() => {});
    }
  }, []);

  function nextIndex(from) {
    if (!reviewing) return from + 1 < deck.length ? from + 1 : null;
    for (let i = from + 1; i < deck.length; i++) {
      if (!answeredFlags[i]) return i;
    }
    return null;
  }

  function prevIndex(from) {
    if (!reviewing) return from > 0 ? from - 1 : null;
    for (let i = from - 1; i >= 0; i--) {
      if (!answeredFlags[i]) return i;
    }
    return null;
  }

  function next() {
    const i = nextIndex(index);
    if (i === null) { setPhase('end'); return; }
    setIndex(i);
  }

  function back() {
    const i = prevIndex(index);
    if (i !== null) setIndex(i);
  }

  function flipBack() {
    setFlipped(false);
  }

  // Consolidates the duplicated applyChapters / applyAll state resets.
  // Pass null to show all cards, or a string[] to filter by section.
  // The deck change triggers the deck-effect which resets reviewing + phase.
  function resetSession(newSelection) {
    setSelectedSections(newSelection);
    setIndex(0);
    setFlipped(false);
    setScore(0);
    setSessionId(randomUUID());
  }

  // Re-shuffles all cards and starts a fresh session.
  // setCards triggers deck recompute → deck-effect → resets arrays/reviewing/phase.
  function startReview() {
    setCards(shuffle(cards));
    setIndex(0);
    setScore(0);
    setSessionId(randomUUID());
  }

  // Enters review mode for skipped (unanswered) cards.
  // Does NOT reset answeredFlags/selections — continues from current session state.
  function startReviewSkipped() {
    const firstUnanswered = answeredFlags.findIndex((x) => !x);
    if (firstUnanswered === -1) return;
    setReviewing(true);
    setScore(0);
    setIndex(firstUnanswered);
    setSessionId(randomUUID());
    setPhase('playing');
  }

  async function handleSelect(option) {
    const card = deck[index];
    if (answeredFlags[index]) {
      setSelections((prev) => { const c = [...prev]; c[index] = option; return c; });
      return;
    }
    setAnsweredFlags((prev) => { const c = [...prev]; c[index] = true; return c; });
    setSelections((prev) => { const c = [...prev]; c[index] = option; return c; });
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

  const card = deck?.[index] ?? null;
  const isCorrect = card ? selections[index] === card.correct_answer : false;
  const canGoBack = deck ? prevIndex(index) !== null : false;

  return {
    deck, card, index, flipped, score, phase,
    selections, answeredFlags, optionsByIndex, sections, selectedSections, error,
    isCorrect, canGoBack,
    handleSelect, next, back, nextIndex, flipBack,
    resetSession, startReview, startReviewSkipped,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/hooks/useQuizSession.js
git commit -m "feat(frontend): extract useQuizSession hook from Quiz component"
```

---

### Task 3: Create `ChapterSheet` component

**Files:**
- Create: `frontend/components/ChapterSheet.js`

`ChapterSheet` owns its own `pendingSections` temp state (initialised from `selectedSections` prop). It calls `onApply(selection)` with the committed value — `null` means all cards, `string[]` means filtered — and `onClose` on backdrop tap or close without applying.

- [ ] **Step 1: Create `frontend/components/` directory and `frontend/components/ChapterSheet.js`**

```js
import { h } from '/lib/preact.mjs';
import { useState } from '/lib/hooks.mjs';
import htm from '/lib/htm.mjs';

const html = htm.bind(h);

export function ChapterSheet({ sections, selectedSections, onApply, onClose }) {
  const [pendingSections, setPendingSections] = useState(
    selectedSections ? [...selectedSections] : null
  );

  const isEmpty = pendingSections !== null && pendingSections.length === 0;

  function toggle(s) {
    if (pendingSections === null) {
      setPendingSections([s]);
    } else if (pendingSections.includes(s)) {
      setPendingSections(pendingSections.filter((x) => x !== s));
    } else {
      setPendingSections([...pendingSections, s]);
    }
  }

  const applyLabel = pendingSections === null
    ? 'Apply (all)'
    : isEmpty
      ? 'Select at least one chapter'
      : 'Apply (' + pendingSections.length + ' chapter' + (pendingSections.length > 1 ? 's' : '') + ')';

  return html`
    <div
      onClick=${onClose}
      style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:30;display:flex;align-items:flex-end"
    >
      <div
        onClick=${(e) => e.stopPropagation()}
        style="width:100%;background:var(--surface);border-radius:16px 16px 0 0;padding:20px 16px 32px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,0.15)"
      >
        <div style="width:36px;height:4px;background:#dde3f5;border-radius:2px;margin:0 auto 16px"></div>
        <div style="font-weight:600;font-size:1rem;margin-bottom:16px">Select Chapters</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;overflow-y:auto;flex:1;margin-bottom:16px">
          <button
            onClick=${() => setPendingSections(null)}
            style="padding:8px 16px;border-radius:20px;border:none;background:${pendingSections === null ? 'var(--accent)' : '#dde3f5'};color:${pendingSections === null ? '#fff' : 'var(--text-muted)'};cursor:pointer;font-size:0.875rem;font-weight:600"
          >All</button>
          ${sections.map((s) => {
            const on = pendingSections !== null && pendingSections.includes(s);
            return html`
              <button
                key=${s}
                onClick=${() => toggle(s)}
                style="padding:8px 16px;border-radius:20px;border:none;background:${on ? 'var(--accent)' : '#dde3f5'};color:${on ? '#fff' : 'var(--text)'};cursor:pointer;font-size:0.875rem"
              >${s}</button>
            `;
          })}
        </div>
        <button
          onClick=${() => { if (!isEmpty) onApply(pendingSections); }}
          disabled=${isEmpty}
          style="width:100%;padding:14px;background:${isEmpty ? '#dde3f5' : 'var(--accent)'};color:${isEmpty ? 'var(--text-muted)' : '#fff'};border:none;border-radius:var(--radius);font-size:1rem;font-weight:600;cursor:${isEmpty ? 'default' : 'pointer'}"
        >${applyLabel}</button>
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ChapterSheet.js
git commit -m "feat(frontend): extract ChapterSheet modal as standalone component"
```

---

### Task 4: Create `ErrorBoundary` component

**Files:**
- Create: `frontend/components/ErrorBoundary.js`

Preact class component. Wraps `<App>` at the `render()` call site. Catches render-time exceptions and shows a reload prompt instead of a blank screen.

- [ ] **Step 1: Create `frontend/components/ErrorBoundary.js`**

```js
import { h, Component } from '/lib/preact.mjs';
import htm from '/lib/htm.mjs';

const html = htm.bind(h);

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return html`
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;gap:16px;text-align:center">
          <div style="font-size:3rem">⚠️</div>
          <p style="color:var(--wrong)">Something went wrong.</p>
          <button
            onClick=${() => location.reload()}
            style="padding:12px 24px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
          >Reload</button>
        </div>
      `;
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ErrorBoundary.js
git commit -m "feat(frontend): add ErrorBoundary class component"
```

---

### Task 5: Fix `api.js` and `idb.js`

**Files:**
- Modify: `frontend/api.js` — remove `getProgress` (never called)
- Modify: `frontend/idb.js` — wrap flush loop in try/catch

**`api.js` change** — delete lines 39–40 (the `getProgress` method and trailing comma):

Before:
```js
export const api = {
  listBooks: () => request('/books'),
  getCards: (bookId) => request(`/books/${bookId}/cards`),
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
  getProgress: (bookId) => request(`/progress/${bookId}`),
};
```

After:
```js
export const api = {
  listBooks: () => request('/books'),
  getCards: (bookId) => request(`/books/${bookId}/cards`),
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
};
```

**`idb.js` change** — wrap the flush loop so a failed `saveFn` call stops the loop but leaves remaining entries in the queue:

Before (`flushProgressQueue` body, lines 64–67):
```js
  for (let i = 0; i < entries.length; i++) {
    await saveFn(entries[i]);
    await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
  }
```

After:
```js
  try {
    for (let i = 0; i < entries.length; i++) {
      await saveFn(entries[i]);
      await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
    }
  } catch (_) {
    // Remaining entries stay queued for the next flush attempt
  }
```

- [ ] **Step 1: Apply `api.js` change** — remove the `getProgress` line from the `api` object

- [ ] **Step 2: Apply `idb.js` change** — wrap the for-loop in `flushProgressQueue` with try/catch as shown above

- [ ] **Step 3: Verify the full updated `flushProgressQueue` function looks like this:**

```js
export async function flushProgressQueue(saveFn) {
  const db = await openDB();
  const [entries, keys] = await new Promise((resolve, reject) => {
    const t = db.transaction('progress_queue', 'readonly');
    const store = t.objectStore('progress_queue');
    let entriesResult, keysResult;
    const reqEntries = store.getAll();
    reqEntries.onsuccess = () => { entriesResult = reqEntries.result; };
    const reqKeys = store.getAllKeys();
    reqKeys.onsuccess = () => { keysResult = reqKeys.result; };
    t.oncomplete = () => resolve([entriesResult, keysResult]);
    t.onerror = () => reject(t.error);
  });
  try {
    for (let i = 0; i < entries.length; i++) {
      await saveFn(entries[i]);
      await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
    }
  } catch (_) {
    // Remaining entries stay queued for the next flush attempt
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/api.js frontend/idb.js
git commit -m "fix(frontend): remove dead getProgress, stop flush loop on first error"
```

---

### Task 6: Refactor `app.js`

**Files:**
- Modify: `frontend/app.js`

Replace the entire file. Key changes:
- Add imports for `useQuizSession`, `ChapterSheet`, `ErrorBoundary`, `styles.js`
- Remove `randomUUID` and `shuffle` helpers (now in hook)
- `TokenGate`: add empty-token guard; use `inputField` and `btnPrimary` style objects
- `BookList`: unchanged except import consolidation
- `EndScreen`: use `btnPrimary`/`btnOutline` style objects
- `Quiz`: replace 11 state declarations + all logic with `useQuizSession(book)` destructure; add `showChapters` boolean state; render `<ChapterSheet>` conditionally
- `App`: unchanged
- Bottom `render()` call: wrap `<App>` in `<ErrorBoundary>`

- [ ] **Step 1: Replace `frontend/app.js` with the following:**

```js
import { h, render } from '/lib/preact.mjs';
import { useState, useEffect } from '/lib/hooks.mjs';
import htm from '/lib/htm.mjs';
import { api, getToken, setToken } from './api.js';
import { useQuizSession } from './hooks/useQuizSession.js';
import { ChapterSheet } from './components/ChapterSheet.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { btnPrimary, btnOutline, btnGhost, inputField } from './styles.js';

const html = htm.bind(h);

// ── Token Gate ────────────────────────────────────────────────────────────────
function TokenGate({ onAuth }) {
  const [value, setValue] = useState('');
  function submit() {
    if (!value.trim()) return;
    setToken(value);
    onAuth();
  }
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
        onKeyDown=${(e) => e.key === 'Enter' && submit()}
        style=${inputField}
      />
      <button
        onClick=${submit}
        style=${{ ...btnPrimary, width: '100%', maxWidth: '320px' }}
      >Enter</button>
    </div>
  `;
}

// ── Book List ─────────────────────────────────────────────────────────────────
function BookList({ onSelect, onLogout }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listBooks()
      .then((data) => setBooks(data.books))
      .catch((e) => {
        if (e.status === 403) { onLogout(); return; }
        setError('Failed to load books');
      });
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
          style="background:var(--surface);border-radius:var(--radius);padding:16px 20px;margin-bottom:12px;cursor:pointer;border:1px solid transparent;transition:border-color 0.2s;box-shadow:var(--shadow)"
          onMouseEnter=${(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave=${(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <div style="font-size:1.1rem;font-weight:600;margin-bottom:4px">${b.title}</div>
          <div style="color:var(--text-muted);font-size:0.875rem;margin-bottom:10px">${b.card_count} cards</div>
          <div style="background:#dde3f5;border-radius:4px;height:6px;overflow:hidden">
            <div style="height:100%;background:var(--accent);width:${b.progress_pct}%;transition:width 0.4s"></div>
          </div>
          <div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">${b.progress_pct}% reviewed</div>
        </div>
      `)}
    </div>
  `;
}

// ── End Screen ────────────────────────────────────────────────────────────────
function EndScreen({ result, book, onReview, onReviewSkipped, onBack }) {
  const pct = Math.round((result.score / result.total) * 100);
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📖';
  return html`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;gap:16px">
      <div style="font-size:4rem">${emoji}</div>
      <h2 style="font-size:2rem">${result.score} / ${result.total}</h2>
      <p style="color:var(--text-muted)">${pct}% correct on ${book.title}</p>
      <button
        onClick=${onReview}
        style=${{ ...btnPrimary, width: '100%', maxWidth: '300px' }}
      >Review Again</button>
      ${result.skipped > 0 && html`
        <button
          onClick=${onReviewSkipped}
          style=${{ ...btnPrimary, width: '100%', maxWidth: '300px' }}
        >Review skipped (${result.skipped})</button>
      `}
      <button
        onClick=${onBack}
        style=${{ ...btnOutline, padding: '14px 0', color: 'var(--text)', width: '100%', maxWidth: '300px' }}
      >← Back to Books</button>
    </div>
  `;
}

// ── Quiz ──────────────────────────────────────────────────────────────────────
function Quiz({ book, onBack }) {
  const {
    deck, card, index, flipped, score, phase,
    selections, answeredFlags, optionsByIndex, sections, selectedSections, error,
    isCorrect, canGoBack,
    handleSelect, next, back, nextIndex, flipBack,
    resetSession, startReview, startReviewSkipped,
  } = useQuizSession(book);

  const [showChapters, setShowChapters] = useState(false);

  if (error) return html`<p style="padding:24px;color:var(--wrong)">${error}</p>`;
  if (!deck) return html`<p style="padding:24px;color:var(--text-muted)">Loading cards…</p>`;
  if (!card) return html`<p style="padding:24px;color:var(--text-muted)">No cards in selection.</p>`;

  if (phase === 'end') {
    const skipped = answeredFlags.filter((x) => !x).length;
    return html`<${EndScreen}
      result=${{ score, total: deck.length, skipped }}
      book=${book}
      onReview=${startReview}
      onReviewSkipped=${startReviewSkipped}
      onBack=${onBack}
    />`;
  }

  return html`
    <div style="padding:16px;max-width:600px;margin:0 auto">
      <div style="padding-top:env(safe-area-inset-top,16px);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <button onClick=${onBack} style=${btnGhost}>← Books</button>
          <span style="color:var(--text-muted);font-size:0.875rem">${index + 1} / ${deck.length}</span>
          ${sections.length > 0 && html`
            <button
              onClick=${() => setShowChapters(true)}
              style="background:none;border:1px solid var(--accent);border-radius:8px;cursor:pointer;color:var(--accent);font-size:0.8rem;padding:4px 10px"
            >${selectedSections === null
              ? '📚 Chapters'
              : selectedSections.length === 1
                ? '📖 ' + selectedSections[0].slice(0, 12)
                : '📖 ' + selectedSections.length + ' chapters'
            }</button>
          `}
        </div>
        <div style="background:#dde3f5;border-radius:4px;height:4px">
          <div style="height:100%;background:var(--accent);width:${((index + 1) / deck.length) * 100}%;transition:width 0.3s"></div>
        </div>
      </div>

      <div key=${index} class="slide-in card-scene">
        <div class=${`card-flipper${flipped ? ' flipped' : ''}`}>

          <div class="card-face">
            <p style="font-size:1.05rem;line-height:1.6;margin-bottom:20px">${card.question}</p>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${optionsByIndex[index]?.map((opt) => {
                const isCorrectOpt = answeredFlags[index] && opt === card.correct_answer;
                const isWrongOpt = answeredFlags[index] && opt === selections[index] && opt !== card.correct_answer;
                return html`
                  <button
                    key=${opt}
                    onClick=${() => handleSelect(opt)}
                    style="padding:14px 16px;border-radius:var(--radius);border:1px solid ${isCorrectOpt ? 'var(--correct)' : isWrongOpt ? 'var(--wrong)' : 'var(--accent)'};cursor:pointer;text-align:left;font-size:1rem;transition:background 0.15s;background:${isCorrectOpt ? '#dcfce7' : isWrongOpt ? '#fee2e2' : 'var(--surface)'};color:var(--text)"
                  >${opt}</button>
                `;
              })}
            </div>
            <div style="display:flex;gap:10px;margin-top:14px">
              <button
                onClick=${back}
                disabled=${!canGoBack}
                style=${{ flex: '1', padding: '12px', background: 'var(--surface)', color: canGoBack ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${canGoBack ? 'var(--accent)' : '#dde3f5'}`, borderRadius: 'var(--radius)', fontSize: '0.95rem', cursor: canGoBack ? 'pointer' : 'default' }}
              >← Back</button>
              <button
                onClick=${next}
                style=${{ flex: '1', padding: '12px', background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', fontSize: '0.95rem', cursor: 'pointer' }}
              >${nextIndex(index) !== null ? 'Next →' : 'Skip to Results'}</button>
            </div>
          </div>

          <div class="card-face card-face-back">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
              <span style="font-size:1.5rem">${isCorrect ? '🎉' : '💡'}</span>
              <span style="font-weight:700;font-size:1.05rem;color:${isCorrect ? 'var(--correct)' : 'var(--wrong)'}">${isCorrect ? 'Correct!' : 'Not quite'}</span>
            </div>
            ${!isCorrect && html`
              <p style="font-size:0.875rem;color:var(--text-muted);margin-bottom:8px">Correct answer:</p>
              <p style="font-weight:600;color:var(--correct);margin-bottom:16px">${card.correct_answer}</p>
            `}
            <p style="line-height:1.6;font-size:0.95rem;color:var(--text-muted);margin-bottom:24px">${card.explanation}</p>
            <button
              onClick=${flipBack}
              style=${{ ...btnOutline, width: '100%', marginBottom: '10px' }}
            >← Question</button>
            <button
              onClick=${next}
              style=${{ ...btnPrimary, width: '100%' }}
            >${nextIndex(index) !== null ? 'Next Card →' : 'See Results'}</button>
          </div>

        </div>
      </div>

      ${showChapters && html`
        <${ChapterSheet}
          sections=${sections}
          selectedSections=${selectedSections}
          onApply=${(sel) => { resetSession(sel); setShowChapters(false); }}
          onClose=${() => setShowChapters(false)}
        />
      `}
    </div>
  `;
}

// ── App Router ────────────────────────────────────────────────────────────────
function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [screen, setScreen] = useState('books');
  const [selectedBook, setSelectedBook] = useState(null);

  function logout() {
    setToken('');
    setAuthed(false);
    setScreen('books');
    setSelectedBook(null);
  }

  if (!authed) {
    return html`<${TokenGate} onAuth=${() => setAuthed(true)} />`;
  }

  if (screen === 'books') {
    return html`<${BookList} onSelect=${(book) => {
      setSelectedBook(book);
      setScreen('quiz');
    }} onLogout=${logout} />`;
  }

  if (screen === 'quiz') {
    return html`<${Quiz}
      book=${selectedBook}
      onBack=${() => { setSelectedBook(null); setScreen('books'); }}
    />`;
  }
}

render(html`<${ErrorBoundary}><${App} /></${ErrorBoundary}>`, document.getElementById('app'));
```

- [ ] **Step 2: Verify line count is under 250**

```bash
wc -l frontend/app.js
```

Expected output: a number ≤ 250

- [ ] **Step 3: Commit**

```bash
git add frontend/app.js
git commit -m "refactor(frontend): slim Quiz to render layer, wire hook and components"
```

---

### Task 7: Update `sw.js` ASSETS list

**Files:**
- Modify: `frontend/sw.js`

Add the 4 new paths so the service worker pre-caches them on install. Do NOT bump the `CACHE` constant — `deploy.sh` handles that with a timestamp-based version on each deployment.

- [ ] **Step 1: Update the `ASSETS` array in `frontend/sw.js`**

Before:
```js
const ASSETS = [
  '/', '/index.html', '/app.js', '/api.js', '/idb.js', '/manifest.json', '/sw.js',
  '/lib/preact.mjs', '/lib/hooks.mjs', '/lib/htm.mjs',
];
```

After:
```js
const ASSETS = [
  '/', '/index.html', '/app.js', '/api.js', '/idb.js', '/manifest.json', '/sw.js',
  '/lib/preact.mjs', '/lib/hooks.mjs', '/lib/htm.mjs',
  '/styles.js',
  '/hooks/useQuizSession.js',
  '/components/ChapterSheet.js',
  '/components/ErrorBoundary.js',
];
```

- [ ] **Step 2: Verify the full file looks correct**

```bash
head -8 frontend/sw.js
```

Expected: ASSETS array now has 14 entries.

- [ ] **Step 3: Commit**

```bash
git add frontend/sw.js
git commit -m "feat(sw): cache new hooks and components paths"
```

---

### Task 8: Final verification

**Files:** No changes

- [ ] **Step 1: Check all new files exist**

```bash
ls frontend/styles.js frontend/hooks/useQuizSession.js frontend/components/ChapterSheet.js frontend/components/ErrorBoundary.js
```

Expected: all 4 paths printed, no "No such file" errors.

- [ ] **Step 2: Verify app.js shrank**

```bash
wc -l frontend/app.js frontend/hooks/useQuizSession.js frontend/components/ChapterSheet.js
```

Expected: `app.js` ≤ 250 lines, `useQuizSession.js` ≤ 150 lines, `ChapterSheet.js` ≤ 70 lines.

- [ ] **Step 3: Verify no leftover references to removed symbols in app.js**

```bash
grep -n "randomUUID\|function shuffle\|getProgress" frontend/app.js
```

Expected: no output (these were removed from app.js).

- [ ] **Step 4: Verify import paths are consistent**

```bash
grep -n "from '\.\." frontend/hooks/useQuizSession.js frontend/components/ChapterSheet.js frontend/components/ErrorBoundary.js
```

Expected: `useQuizSession.js` imports `../api.js` and `../idb.js`; `ChapterSheet.js` and `ErrorBoundary.js` have no `../` imports.

- [ ] **Step 5: Start the dev server and do a smoke test**

```bash
cd /home/azureuser/pink/flashcard_ai/frontend && python -m http.server 5173 --bind 127.0.0.1 &
sleep 1
curl -s http://127.0.0.1:5173/ | grep -c '<div id="app">'
```

Expected: `1` (the HTML shell loads).

- [ ] **Step 6: Kill the dev server**

```bash
pkill -f "http.server 5173"
```

- [ ] **Step 7: Final commit summary**

```bash
git log --oneline -8
```

Expected: 7 commits since the refactor began, each with a clear scope prefix (`feat`, `fix`, `refactor`).
