# Quiz Back / Next + Skip-Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `← Back` / `Next →` buttons below the option grid on the question face so users can navigate freely (and skip cards), and add an end-screen `Review skipped (N)` button that walks only unanswered cards in review mode — without ever rescoring an already-answered card.

**Architecture:** Replace the Quiz component's scalar per-card state (`selected`, `answered`, `shuffledOptions`) with parallel arrays indexed by deck position (`selections[]`, `answeredFlags[]`, `optionsByIndex[]`), driven by a `[deck]`-keyed effect that reinitializes them whenever the deck changes. Move the End screen rendering from the App router into the Quiz component itself so review-mode entry doesn't unmount Quiz and lose its per-card state. Add a `reviewing` flag that makes `nextIndex`/`prevIndex` skip already-answered cards.

**Tech Stack:** Preact 10 + `htm` ESM-from-CDN, no build step, no JS test framework. Static check is `node --input-type=module --check < frontend/app.js`. Behavioral verification is manual in a browser per the project's existing convention.

**Spec:** `docs/superpowers/specs/2026-04-25-quiz-back-next-skip-review-design.md`

**Branch:** `feature/back-next-skip-review` (spec already committed as `1ce4efb`).

**Files touched:**

| File | Responsibility |
|---|---|
| `frontend/app.js` | All Quiz state/render changes, App router refactor (remove `screen === 'end'` branch and the `EndScreen` import path inline). Single file. |

**Commit cadence:** One commit per task. Spec did not mandate a single squashed commit, so the implementation history can stay as the natural per-task progression. (User can `git rebase -i` later if they want.)

---

## Task 1: Migrate Quiz state to parallel arrays (no user-facing behavior change)

**Files:**
- Modify: `frontend/app.js` — the `Quiz` component body only

This task replaces the three scalar per-card states with parallel arrays and reorganizes the reset effect, while preserving every visible user behavior. After Task 1, the app should look and behave exactly the same — only the internal state shape changed. Subsequent tasks build on this shape.

- [ ] **Step 1: Read the current `Quiz` state declarations and reset effect**

```bash
sed -n '93,140p' frontend/app.js
```

Expected output (verbatim, modulo whitespace) — these are the regions Task 1 modifies:

```js
function Quiz({ book, onFinish, onBack }) {
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(null);
  const [selectedSections, setSelectedSections] = useState(null);
  const [pendingSections, setPendingSections] = useState(null);
  const [showChapters, setShowChapters] = useState(false);
  const [sessionId, setSessionId] = useState(() => randomUUID());
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    async function load() {
      ...
    }
    load();
  }, [book.id]);

  const deck = useMemo(() => { ... }, [cards, selectedSections]);

  useEffect(() => {
    if (deck && deck[index]) {
      setShuffledOptions(shuffle(deck[index].options));
      setSelected(null);
      setFlipped(false);
      setAnswered(false);
    }
  }, [deck, index]);
```

- [ ] **Step 2: Replace the three scalar per-card states with parallel arrays + add `reviewing` flag**

In `frontend/app.js`, in the `Quiz` component, replace the lines declaring `shuffledOptions`, `selected`, and `answered` with three array states, and add `reviewing`. The other state declarations stay as-is.

Before (these three lines, at the positions shown in Step 1):
```js
  const [shuffledOptions, setShuffledOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  ...
  const [answered, setAnswered] = useState(false);
```

After (the three replacements + new `reviewing`):
```js
  const [optionsByIndex, setOptionsByIndex] = useState([]);
  const [selections, setSelections] = useState([]);
  const [answeredFlags, setAnsweredFlags] = useState([]);
  const [reviewing, setReviewing] = useState(false);
```

Final shape of the `Quiz` state block (everything between the function signature and the `useEffect` for `load`):

```js
  const [cards, setCards] = useState(null);
  const [index, setIndex] = useState(0);
  const [optionsByIndex, setOptionsByIndex] = useState([]);
  const [selections, setSelections] = useState([]);
  const [answeredFlags, setAnsweredFlags] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(null);
  const [selectedSections, setSelectedSections] = useState(null);
  const [pendingSections, setPendingSections] = useState(null);
  const [showChapters, setShowChapters] = useState(false);
  const [sessionId, setSessionId] = useState(() => randomUUID());
  const [reviewing, setReviewing] = useState(false);
```

(`flipped` stays as a single boolean. `selected` and `answered` are gone.)

- [ ] **Step 3: Replace the `[deck, index]` reset effect with two effects**

The existing single effect resets four pieces of state on every card change. We split it: a `[deck]` effect that re-initializes the per-card arrays whenever the deck changes (cards loaded, chapter switched, or — later — Review Again pressed), and a `[deck, index]` effect that just resets `flipped`.

Before:
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

After (two effects placed at the same location, in this order):
```js
  useEffect(() => {
    if (!deck) return;
    setOptionsByIndex(deck.map((c) => shuffle(c.options)));
    setSelections(new Array(deck.length).fill(null));
    setAnsweredFlags(new Array(deck.length).fill(false));
    setReviewing(false);
  }, [deck]);

  useEffect(() => {
    setFlipped(false);
  }, [index]);
```

The `[deck]` effect handles all the per-card array reinitialization. The `[index]` effect just flips the card back to question side on navigation.

- [ ] **Step 4: Update `handleSelect` to read/write per-card state**

The existing `handleSelect` reads `answered`/`selected` and calls `setAnswered(true)`/`setSelected(option)`. Rewrite to read/write the indexed slots:

Before:
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

After:
```js
  async function handleSelect(option) {
    if (answeredFlags[index]) {
      setSelections((prev) => {
        const copy = [...prev];
        copy[index] = option;
        return copy;
      });
      return;
    }
    setAnsweredFlags((prev) => {
      const copy = [...prev];
      copy[index] = true;
      return copy;
    });
    setSelections((prev) => {
      const copy = [...prev];
      copy[index] = option;
      return copy;
    });
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

- [ ] **Step 5: Update render — option-button styling reads from per-card state**

In the `shuffledOptions.map((opt) => { ... })` block, change `selected` and `answered` to indexed reads. The block also needs to iterate `optionsByIndex[index]` instead of `shuffledOptions`.

Before:
```js
              ${shuffledOptions.map((opt) => {
                const isCorrectOpt = answered && opt === card.correct_answer;
                const isWrongOpt = answered && opt === selected && opt !== card.correct_answer;
                return html`
                  <button
                    key=${opt}
                    onClick=${() => handleSelect(opt)}
                    style="padding:14px 16px;border-radius:var(--radius);border:1px solid ${isCorrectOpt ? 'var(--correct)' : isWrongOpt ? 'var(--wrong)' : 'var(--accent)'};cursor:pointer;text-align:left;font-size:1rem;transition:background 0.15s;background:${isCorrectOpt ? '#dcfce7' : isWrongOpt ? '#fee2e2' : 'var(--surface)'};color:var(--text)"
                  >${opt}</button>
                `;
              })}
```

After:
```js
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
```

The `?.` after `optionsByIndex[index]` handles the brief render frame between deck change and the `[deck]` reset effect firing.

- [ ] **Step 6: Update `isCorrect` to read from `selections[index]`**

The existing line `const isCorrect = selected === card.correct_answer;` (just above the early return for `if (!card)`) reads the removed `selected` state. Update to:

```js
  const isCorrect = selections[index] === card.correct_answer;
```

- [ ] **Step 7: Update the explanation-face "← Question" button**

The button currently calls `setSelected(null)` to clear the selection on flip-back. Now `selections[index]` carries that state per-card, and we want the original `selections[index]` to **stay** (so re-tap inspect-options behavior continues). The "← Question" button should only flip the card, not touch selections.

Locate the explanation-face button currently rendered as:
```js
            <button
              onClick=${() => { setFlipped(false); setSelected(null); }}
              ...
            >← Question</button>
```

Change to:
```js
            <button
              onClick=${() => setFlipped(false)}
              ...
            >← Question</button>
```

- [ ] **Step 8: Remove the now-orphan resets in `applyChapters` and `applyAll`**

`applyChapters` and `applyAll` currently call `setSelected(null)` and `setAnswered(false)` to clear the legacy per-card state. The new `[deck]` effect handles that automatically when `selectedSections` changes (since `deck` is a `useMemo` depending on `selectedSections`, applying a new chapter set produces a new `deck` reference and re-fires the effect).

Remove just the two now-orphan setters from each function. `setIndex(0)`, `setFlipped(false)`, `setScore(0)`, `setShowChapters(false)`, `setSessionId(randomUUID())`, and the `setSelectedSections(...)` call at the top all stay.

Final shape of each:

```js
  function applyChapters() {
    if (pendingSections !== null && pendingSections.length === 0) return;
    setSelectedSections(pendingSections);
    setIndex(0);
    setFlipped(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(randomUUID());
  }

  function applyAll() {
    setSelectedSections(null);
    setIndex(0);
    setFlipped(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(randomUUID());
  }
```

- [ ] **Step 9: Confirm no dead references to the removed state**

```bash
grep -n 'shuffledOptions\|setShuffledOptions\|setSelected\b\|setAnswered\|\bselected\b\|\banswered\b' frontend/app.js
```

Expected output: empty (no matches). The new state names (`selections`, `answeredFlags`, etc.) and the new `setSelections`/`setAnsweredFlags`/`setReviewing` setters should fully replace the old ones. The `selected` reference inside `isWrongOpt` was already updated in Step 5 to `selections[index]`. The `selected` parameter destructuring (none exists), the `answered` reference inside `if (answered)` was updated to `answeredFlags[index]` in Step 4.

If anything matches, fix it before continuing.

- [ ] **Step 10: Static syntax check**

```bash
node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add frontend/app.js
git commit -m "refactor(quiz): per-card state as parallel arrays indexed by deck position"
```

---

## Task 2: Back / Next buttons on the question face + navigation helpers

**Files:**
- Modify: `frontend/app.js` — the `Quiz` component body only

This task replaces the existing forward-only `advance()` with bidirectional `next()` and `back()` helpers, and adds the inline button row below the option grid. After Task 2, the user can navigate freely between cards. End-of-deck still calls `onFinish` (no Review-skipped button yet — that's Task 4).

- [ ] **Step 1: Add `nextIndex` and `prevIndex` helpers and replace `advance` with `next`/`back`**

Locate the existing `advance` function inside `Quiz`:

```js
  function advance() {
    if (index + 1 < deck.length) setIndex((i) => i + 1);
    else onFinish({ score, total: deck.length });
  }
```

Replace with three functions placed in the same location:

```js
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
    if (i === null) {
      onFinish({
        score,
        total: deck.length,
        skipped: answeredFlags.filter((x) => !x).length,
      });
      return;
    }
    setIndex(i);
  }

  function back() {
    const i = prevIndex(index);
    if (i !== null) setIndex(i);
  }
```

The review-mode branch in `nextIndex`/`prevIndex` is dormant in Task 2 because `reviewing` is always `false` until Task 4 wires up the Review-skipped button. Including it now means we don't have to retouch these helpers later.

- [ ] **Step 2: Replace the `advance` callsite on the explanation face**

Locate the "Next Card → / See Results" button on the back face of the card:

```js
            <button
              onClick=${advance}
              style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
            >${index + 1 < deck.length ? 'Next Card →' : 'See Results'}</button>
```

Change `onClick=${advance}` to `onClick=${next}`. Leave the rest of the button — including the conditional label — unchanged. The label condition `index + 1 < deck.length` still works because in normal play (`reviewing === false`) `next()` will trigger `onFinish` exactly when the user is on the last card.

Final shape:

```js
            <button
              onClick=${next}
              style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
            >${index + 1 < deck.length ? 'Next Card →' : 'See Results'}</button>
```

- [ ] **Step 3: Add the Back / Next button row below the option grid on the question face**

Locate the question card-face block — it's the JSX block immediately after `<div class="card-face">` and contains the `${optionsByIndex[index]?.map(...)}` block. Right after the closing `</div>` of the inner `display:flex;flex-direction:column;gap:10px` div (which holds the four option buttons), add the new Back / Next row.

Before — the structure looks like:
```js
          <div class="card-face">
            <p style="font-size:1.05rem;line-height:1.6;margin-bottom:20px">${card.question}</p>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${optionsByIndex[index]?.map((opt) => {
                ...
              })}
            </div>
          </div>
```

After — insert the new row between the options-flex `</div>` and the `card-face` `</div>`:

```js
          <div class="card-face">
            <p style="font-size:1.05rem;line-height:1.6;margin-bottom:20px">${card.question}</p>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${optionsByIndex[index]?.map((opt) => {
                ...
              })}
            </div>
            <div style="display:flex;gap:10px;margin-top:14px">
              <button
                onClick=${back}
                disabled=${prevIndex(index) === null}
                style="flex:1;padding:12px;background:var(--surface);color:${prevIndex(index) === null ? 'var(--text-muted)' : 'var(--accent)'};border:1px solid ${prevIndex(index) === null ? '#dde3f5' : 'var(--accent)'};border-radius:var(--radius);font-size:0.95rem;cursor:${prevIndex(index) === null ? 'default' : 'pointer'}"
              >← Back</button>
              <button
                onClick=${next}
                style="flex:1;padding:12px;background:var(--surface);color:var(--accent);border:1px solid var(--accent);border-radius:var(--radius);font-size:0.95rem;cursor:pointer"
              >Next →</button>
            </div>
          </div>
```

The `prevIndex(index) === null` check is recomputed three times in the Back button (disabled, color, border, cursor). That's a bit wasteful but the function is O(1) in normal mode and at most O(deck.length) in review mode — fine for the deck sizes we have.

- [ ] **Step 4: Static syntax check**

```bash
node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0.

- [ ] **Step 5: Confirm no remaining `advance` references**

```bash
grep -n '\badvance\b' frontend/app.js
```

Expected: empty (no matches).

- [ ] **Step 6: Commit**

```bash
git add frontend/app.js
git commit -m "feat(quiz): add Back/Next buttons on question face + bidirectional navigation"
```

---

## Task 3: Refactor — move EndScreen rendering inside Quiz

**Files:**
- Modify: `frontend/app.js` — the `Quiz` component body, the `EndScreen` component (untouched), and the `App` router

After this task, Quiz handles its own end-of-deck UI internally via a `phase` sub-state. App router no longer has a `screen === 'end'` branch. This is necessary so that when the user enters review-skipped mode (Task 4), Quiz's per-card state survives — Quiz doesn't unmount.

- [ ] **Step 1: Add a `phase` state to `Quiz`**

In the `Quiz` component, add a new state declaration right after the `reviewing` state from Task 1:

```js
  const [phase, setPhase] = useState('playing');
```

Phase is `'playing'` during the question/explanation flow and `'end'` when the user has reached the end of the deck (or the end of review-mode).

- [ ] **Step 2: Update `next` to set `phase = 'end'` instead of calling `onFinish`**

In Task 2 we wrote:

```js
  function next() {
    const i = nextIndex(index);
    if (i === null) {
      onFinish({
        score,
        total: deck.length,
        skipped: answeredFlags.filter((x) => !x).length,
      });
      return;
    }
    setIndex(i);
  }
```

Change to:

```js
  function next() {
    const i = nextIndex(index);
    if (i === null) {
      setPhase('end');
      return;
    }
    setIndex(i);
  }
```

We no longer need to compute `skipped` here — the end-screen render block reads it directly from `answeredFlags`.

- [ ] **Step 3: Render the End screen inside Quiz when `phase === 'end'`**

In the `Quiz` component, immediately after the `if (!card) return ...` early return and before the `function openChapters` declarations, add a phase-end early return that renders the same EndScreen component the App router previously rendered.

Locate the existing early-return block:

```js
  const card = deck?.[index];
  if (!card) return html`<p style="padding:24px;color:var(--text-muted)">No cards in selection.</p>`;
  const isCorrect = selections[index] === card.correct_answer;
```

Add the phase-end branch immediately above `const isCorrect`:

```js
  const card = deck?.[index];
  if (!card) return html`<p style="padding:24px;color:var(--text-muted)">No cards in selection.</p>`;

  if (phase === 'end') {
    const skipped = answeredFlags.filter((x) => !x).length;
    return html`<${EndScreen}
      result=${{ score, total: deck.length, skipped }}
      book=${book}
      onReview=${() => {
        setCards(shuffle(cards));
        setIndex(0);
        setScore(0);
        setSessionId(randomUUID());
        setPhase('playing');
      }}
      onBack=${onBack}
    />`;
  }

  const isCorrect = selections[index] === card.correct_answer;
```

The `onReview` callback re-shuffles the source cards. The `setCards(shuffle(cards))` call produces a new `cards` array reference, which retriggers the `useMemo` for `deck`, which retriggers the `[deck]` effect from Task 1, which re-initializes all the per-card arrays with fresh `optionsByIndex` shuffles. `setSessionId(randomUUID())` starts a new session UUID for the new pass.

- [ ] **Step 4: Remove the App router's `screen === 'end'` branch and `onFinish` plumbing**

Locate the `App` component:

```js
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
      onBack=${() => { setSelectedBook(null); setScreen('books'); }}
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
```

Replace with:

```js
function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [screen, setScreen] = useState('books');
  const [selectedBook, setSelectedBook] = useState(null);

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
      onBack=${() => { setSelectedBook(null); setScreen('books'); }}
    />`;
  }
}
```

Removed: `quizResult` state, `onFinish` prop, the entire `screen === 'end'` branch.

- [ ] **Step 5: Update the `Quiz` function signature to drop `onFinish`**

Before:
```js
function Quiz({ book, onFinish, onBack }) {
```

After:
```js
function Quiz({ book, onBack }) {
```

- [ ] **Step 6: Confirm no remaining `onFinish` references**

```bash
grep -n 'onFinish' frontend/app.js
```

Expected: empty (no matches).

- [ ] **Step 7: Static syntax check**

```bash
node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/app.js
git commit -m "refactor(quiz): own the end-screen phase internally so per-card state survives"
```

---

## Task 4: Review-skipped button + review-mode entry

**Files:**
- Modify: `frontend/app.js` — the `EndScreen` component and the `Quiz` component's phase-end render

Now we add the Review-skipped button to `EndScreen`, plumb a callback through, and make Quiz enter review mode (which already has navigation logic in Task 2's `nextIndex`/`prevIndex` — just dormant until `reviewing === true`).

- [ ] **Step 1: Add `onReviewSkipped` prop to `EndScreen` and conditionally render the button**

Locate the `EndScreen` component:

```js
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
```

Add `onReviewSkipped` to the props and a conditional button between Review Again and Back to Books:

```js
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
        style="padding:14px 0;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:300px"
      >Review Again</button>
      ${result.skipped > 0 && html`
        <button
          onClick=${onReviewSkipped}
          style="padding:14px 0;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:300px"
        >Review skipped (${result.skipped})</button>
      `}
      <button
        onClick=${onBack}
        style="padding:14px 0;background:var(--surface);color:var(--text);border:1px solid var(--accent);border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:300px"
      >← Back to Books</button>
    </div>
  `;
}
```

- [ ] **Step 2: Wire up `onReviewSkipped` in the Quiz phase-end render**

In the `Quiz` component's phase-end early return added in Task 3, add the `onReviewSkipped` prop:

Before:
```js
  if (phase === 'end') {
    const skipped = answeredFlags.filter((x) => !x).length;
    return html`<${EndScreen}
      result=${{ score, total: deck.length, skipped }}
      book=${book}
      onReview=${() => {
        setCards(shuffle(cards));
        setIndex(0);
        setScore(0);
        setSessionId(randomUUID());
        setPhase('playing');
      }}
      onBack=${onBack}
    />`;
  }
```

After:
```js
  if (phase === 'end') {
    const skipped = answeredFlags.filter((x) => !x).length;
    return html`<${EndScreen}
      result=${{ score, total: deck.length, skipped }}
      book=${book}
      onReview=${() => {
        setCards(shuffle(cards));
        setIndex(0);
        setScore(0);
        setSessionId(randomUUID());
        setPhase('playing');
      }}
      onReviewSkipped=${() => {
        const firstUnanswered = answeredFlags.findIndex((x) => !x);
        if (firstUnanswered === -1) return;
        setReviewing(true);
        setIndex(firstUnanswered);
        setSessionId(randomUUID());
        setPhase('playing');
      }}
      onBack=${onBack}
    />`;
  }
```

The `setSessionId(randomUUID())` is intentional — review-skipped is logically a new study session even though the per-card state continues. This is consistent with how chapter-switch already starts a new session.

The `firstUnanswered === -1` guard is defensive: the button only renders when `result.skipped > 0`, but if the user double-taps in some edge case (button still visible during a render frame after all are answered), we no-op rather than passing `-1` to `setIndex`.

- [ ] **Step 3: Static syntax check**

```bash
node --input-type=module --check < frontend/app.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/app.js
git commit -m "feat(quiz): add Review-skipped end-screen button + review-mode entry"
```

---

## Task 5: Manual browser verification + push

**Files:** None modified. This is a verification + git operations gate.

Run the deployed-locally version of the app and walk through every spec verification step. Then push the branch.

- [ ] **Step 1: Confirm clean state**

```bash
git -C c:/Users/hongnguyen/learning/flashcardAI log --oneline origin/master..HEAD
```

Expected output (5 commits — spec from earlier + 4 task commits):

```
<sha-task-4>  feat(quiz): add Review-skipped end-screen button + review-mode entry
<sha-task-3>  refactor(quiz): own the end-screen phase internally so per-card state survives
<sha-task-2>  feat(quiz): add Back/Next buttons on question face + bidirectional navigation
<sha-task-1>  refactor(quiz): per-card state as parallel arrays indexed by deck position
1ce4efb       docs: add spec for quiz back/next + skip-review
```

If you see a different set, stop and investigate.

- [ ] **Step 2: Run the 10 verification checks from the spec**

Open the app locally however you normally do for development. Then perform each check from the spec's Verification section. Each one is a separate todo:

- [ ] **2a. Skip then review.** Start a deck. Tap **Next** without answering on cards 1, 3, 5. Continue answering the rest. Reach the End screen. Confirm the score reflects only-answered cards. Confirm a `Review skipped (3)` button is shown. Tap it.
- [ ] **2b. Review-mode navigation.** After tapping Review skipped, confirm you land on card 1 (first unanswered). Tap Next → lands on card 3 (skipping the answered card 2). Answer card 3. Tap Next → lands on card 5. Tap Back → returns to card 3 (now answered, locked).
- [ ] **2c. Locked answered card.** While on a previously-answered card, your original chosen option is highlighted (green if correct, red if wrong); the correct option is highlighted green. Tap a different wrong option → that one goes red, the previously-chosen option un-highlights, correct stays green. Open DevTools Network tab — confirm **no new POST** to `/progress`.
- [ ] **2d. Back at index 0.** On the first card of the deck, the Back button is disabled (visually muted, doesn't respond to taps).
- [ ] **2e. Next on last card.** On the last card, tapping Next ends the run regardless of whether the card is answered.
- [ ] **2f. Stable option order on revisit.** Answer card 1, advance, come back. The four option buttons appear in the **same order** as before — no reshuffle.
- [ ] **2g. Chapter switch resets everything.** Apply a different chapter filter. All per-card state resets — no leftover answered/skipped from the previous deck. The Review-skipped button reflects the new deck only.
- [ ] **2h. Review Again resets everything.** From the End screen, tap Review Again. The deck is fresh (re-shuffled), all cards unanswered, score 0.
- [ ] **2i. Review-skipped → all answered → exit cleanly.** Enter review mode, answer all skipped cards. Reach the End screen. Confirm Review-skipped button is gone. Confirm score shows the full total.
- [ ] **2j. Score correctness.** Score never double-counts. Answer card correctly, navigate back, re-tap correct option — score stays the same. (Open DevTools and confirm `score` in the EndScreen header.)

If any check fails, stop and fix before pushing.

- [ ] **Step 3: Push the branch**

```bash
git -C c:/Users/hongnguyen/learning/flashcardAI push -u origin feature/back-next-skip-review
```

If the GitHub credential boundary issue from prior PRs returns (Enterprise Managed User can't create PRs via `gh`), the push itself succeeds — only `gh pr create` is blocked. Open the PR via the web UI at:

`https://github.com/HongNta11/flashcardAI/compare/master...feature/back-next-skip-review?expand=1`

PR body:

```markdown
## Summary

Adds Back / Next navigation buttons below the option grid on the question face so users can move freely between cards and skip without answering. Adds an end-screen `Review skipped (N)` button that walks only the unanswered cards in review mode. Already-answered cards lock on revisit — no rescore, no second `saveProgress` POST.

Internal refactor: scalar per-card state (`selected`, `answered`, `shuffledOptions`) is replaced with parallel arrays indexed by deck position so navigation can revisit cards without losing their state. End screen rendering moves from the App router into Quiz so per-card state survives review-mode entry.

Spec: [docs/superpowers/specs/2026-04-25-quiz-back-next-skip-review-design.md](docs/superpowers/specs/2026-04-25-quiz-back-next-skip-review-design.md)
Plan: [docs/superpowers/plans/2026-04-25-quiz-back-next-skip-review.md](docs/superpowers/plans/2026-04-25-quiz-back-next-skip-review.md)

## Test plan

- [x] `node --input-type=module --check < frontend/app.js` passes
- [x] Manual browser verification (10 checks per spec)
```

---

## Self-Review

**Spec coverage** — every spec section has at least one task implementing it:

- Spec § State model (`selections`, `answeredFlags`, `optionsByIndex`, `reviewing`, reset on deck change) → Task 1
- Spec § Navigation helpers (`nextIndex`, `prevIndex`, `next`, `back`) → Task 2 (Step 1)
- Spec § Tap-on-option behavior → Task 1 (Step 4)
- Spec § Render — option-button styling → Task 1 (Step 5)
- Spec § Render — Back / Next button row → Task 2 (Step 3)
- Spec § Render — `optionsByIndex[index]` replacing `shuffledOptions` → Task 1 (Step 5)
- Spec § End screen `skipped` field + Review-skipped button + App router wiring → Tasks 3 + 4
- Spec § Review Again as a deck change → Task 3 (Step 3, the `setCards(shuffle(cards))` in `onReview`)
- Spec § Verification (10 checks) → Task 5 (Step 2 substeps)

No gaps.

**Placeholder scan** — no TBDs, no "..." ellipses outside of "before" code blocks (where they faithfully represent unchanged regions of the existing file). Every "After" code block is the exact, complete code to write.

**Type/name consistency** — `selections`, `answeredFlags`, `optionsByIndex`, `reviewing`, `phase`, `setSelections`, `setAnsweredFlags`, `setOptionsByIndex`, `setReviewing`, `setPhase`, `nextIndex`, `prevIndex`, `next`, `back` are used consistently across Tasks 1–4 and the spec. The `randomUUID()` helper from PR #9 is referenced (not redefined) in Tasks 3 and 4. The Preact `useState`/`useEffect`/`useMemo` import already includes everything needed.

**Risk note for the executor:** Task 1 is the largest and breaks all per-card state simultaneously — confirm the `grep` checks at the end of Task 1 (Step 9) show empty output before moving on. If anything still references `selected`/`answered` after Task 1, the app will throw at runtime when those identifiers are evaluated. Task 3's App-router refactor removes `quizResult` and the `screen === 'end'` branch — those are intentional, not lost work.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-25-quiz-back-next-skip-review.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session with checkpoints.

Which approach?
