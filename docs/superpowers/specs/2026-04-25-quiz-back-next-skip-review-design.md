# Quiz Back / Next + Skip-Review — Design Spec

**Date:** 2026-04-25
**Scope:** Frontend only (`frontend/app.js`).
**Goal:** Let users navigate freely between cards on the question face, skip cards without answering, and review the cards they skipped at the end of a deck — without ever rescoring an already-answered card.

---

## User-facing behavior

A new row of two buttons appears below the four answer options on the question face of every card:

```
[ ← Back ]   [ Next → ]
```

- **Back** moves to the previous card. Disabled at the first card.
- **Next** moves to the next card. On the last card it ends the run (same as today's "See Results" button on the explanation face).

Tapping **Next** on a card the user hasn't answered counts as a **skip**: the card stays unanswered and remains in the deck for later. Tapping **Back** never scores or saves anything either way.

When the user reaches the end of the deck and there are unanswered cards, the End screen shows a new button:

```
Review skipped (3)
```

Tapping it sends the user back into the Quiz, walking only the skipped cards in deck order. Back/Next within review mode jump between skipped cards, ignoring already-answered ones. When all skipped cards are answered (or skipped again), the End screen shows up; if all are now answered, the button is gone.

When the user navigates **Back** to a card they've already answered, the card lands on the question face with their original choice highlighted (red or green per correctness) and the correct answer highlighted green. Tapping options on that card just updates the inspection highlight — no rescore, no new `saveProgress` POST. This matches the "inspect-options" UX shipped in PR #8, but now persisted per-card.

---

## State model

The current Quiz component has scalar `selected`, `answered`, and `flipped` state plus a per-render `shuffledOptions`. This design replaces three of them with parallel-array state indexed by deck position.

### Replaced

| Was | Becomes |
|---|---|
| `const [selected, setSelected] = useState(null)` | `const [selections, setSelections] = useState([])`  — `selections[i]` is the option string the user is currently inspecting on card `i`, or `null`. |
| `const [answered, setAnswered] = useState(false)` | `const [answeredFlags, setAnsweredFlags] = useState([])` — `answeredFlags[i]` is `true` once card `i` has been scored, persists across navigation. |
| `const [shuffledOptions, setShuffledOptions] = useState([])` | `const [optionsByIndex, setOptionsByIndex] = useState([])` — `optionsByIndex[i]` is a stable shuffled `string[]` for card `i`, computed once per deck change. |

### Unchanged

- `flipped: bool` — current card's flip side. Stays scalar; resets on `index` change (the existing `[deck, index]` effect already does this).
- `score: number` — running correct count. Increments only on the first answer of a card.
- `index: number` — current position within the deck.

### New

- `const [reviewing, setReviewing] = useState(false)` — when true, navigation skips already-answered cards.

### Reset rules

The four arrays (`selections`, `answeredFlags`, `optionsByIndex`) and the `reviewing` flag all reset together when the **deck** changes — i.e., when `cards` first loads, when `selectedSections` changes (chapter filter apply), or when the user taps "Review Again" on the End screen.

```js
useEffect(() => {
  if (!deck) return;
  setAnsweredFlags(new Array(deck.length).fill(false));
  setSelections(new Array(deck.length).fill(null));
  setOptionsByIndex(deck.map((c) => shuffle(c.options)));
  setReviewing(false);
}, [deck]);
```

---

## Navigation helpers

The current `advance()` function is replaced with `next()` and `back()` helpers that handle both normal and review-mode behavior.

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

The "Next Card →" / "See Results" button on the explanation face also calls `next()` — it stops being a special advance and just shares the navigation helper.

---

## Tap-on-option behavior

The existing `handleSelect` is rewritten to read and write per-card state:

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
  // first-answer path: score, save, flip
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

`saveProgress` runs at most once per card per deck life (until a chapter switch).

---

## Render changes

### Question face — option-button styling reads from per-card state

```js
const isCorrectOpt = answeredFlags[index] && opt === card.correct_answer;
const isWrongOpt   = answeredFlags[index] && opt === selections[index] && opt !== card.correct_answer;
```

The rest of the option-button style string is unchanged.

### Question face — new Back / Next row below options

```js
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
```

Same row width as the option buttons (each `flex:1`); secondary visual style (white background, accent-colored border and text) so primary attention stays on the four answer options.

The "← Question" back button on the explanation face stays as-is — flips back to the question side without changing index. The "Next Card → / See Results" button on the explanation face calls `next()` instead of the removed `advance()`.

### `optionsByIndex[index]` replaces `shuffledOptions`

The `shuffledOptions.map(...)` block becomes `optionsByIndex[index]?.map(...)`. The optional chaining handles the brief render between deck change and the reset-effect firing.

---

## End screen

The Quiz component's `onFinish` payload gains a `skipped` count:

```js
onFinish({
  score,
  total: deck.length,
  skipped: answeredFlags.filter((x) => !x).length,
});
```

The `EndScreen` component grows one conditional button between "Review Again" and "← Back to Books":

```js
${result.skipped > 0 && html`
  <button
    onClick=${onReviewSkipped}
    style="padding:14px 0;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:300px"
  >Review skipped (${result.skipped})</button>
`}
```

`onReviewSkipped` is a new prop wired up in `App`. It transitions back to the `quiz` screen with a flag indicating review-mode entry. The Quiz component reads that flag on mount and sets `reviewing = true` and `index = first-unanswered-index`.

The simplest wiring: pass the same `selectedBook` and a fresh `screen='quiz'` plus an additional `quizMode='review'` state in `App`. The Quiz component checks `quizMode` once on mount.

`Review Again` continues to mean "fresh full pass" — it resets all per-card state. (The existing reset-on-deck-change effect handles this if we treat "Review Again" as a deck change. Simplest: reset `cards` to a re-shuffled copy of the source data, which retriggers the deck effect.)

---

## Files changed

| File | Change |
|---|---|
| `frontend/app.js` | All the changes above. Single file. |

No backend changes. No API changes. No new files. No new dependencies.

---

## Out of scope

- Persisting per-card state across page reloads or app restarts — in-memory only.
- Backend records of which cards were skipped — `progress` table only stores answered cards (unchanged).
- Keyboard shortcuts (←/→) for navigation — could be a follow-up.
- Swipe gestures on mobile — could be a follow-up.
- A "skip pile" UI affordance during normal navigation — the End-screen button is the only entry point to review-skipped mode.

---

## Verification (manual, in browser)

1. **Skip then review.** Start a deck. Tap **Next** without answering on cards 1, 3, 5. Continue answering the rest. Reach the End screen. Confirm score reflects only the answered cards. Confirm a `Review skipped (3)` button is shown. Tap it.

2. **Review-mode navigation.** After tapping `Review skipped`, confirm you land on card 1 (first unanswered). Tap **Next** → lands on card 3 (skipping the answered card 2). Answer card 3. Tap **Next** → lands on card 5. Tap **Back** → returns to card 3 (now answered, locked).

3. **Locked answered card.** While on a previously-answered card, the option you originally chose is highlighted (green if correct, red if wrong); the correct option is highlighted green. Tap a different wrong option → that one goes red, the previously-chosen option un-highlights, correct stays green. Open DevTools Network tab, confirm **no new POST** to `/progress`.

4. **Back at index 0.** On the first card of the deck, the Back button is disabled (visually muted, doesn't respond to taps).

5. **Next on last card.** On the last card, tapping Next ends the run (regardless of whether the card is answered).

6. **Stable option order on revisit.** Answer card 1, advance, come back. The four option buttons appear in the **same order** as before — no reshuffle.

7. **Chapter switch resets everything.** Apply a different chapter filter. All per-card state resets — no leftover answered/skipped from the previous deck. The `Review skipped` button on the next End screen reflects the new deck only.

8. **Review Again resets everything.** From the End screen, tap "Review Again". The deck is fresh (re-shuffled), all cards unanswered, score 0.

9. **Review-skipped → all answered → exit cleanly.** Enter review mode, answer all skipped cards. Reach the End screen. Confirm `Review skipped` button is gone. Confirm score shows the full total.

10. **Score correctness.** Score never double-counts a card answered correctly twice (since re-tap inspect doesn't rescore). Score increments exactly once per first-correct-answer.

If any verification step fails, do not commit — investigate first.
