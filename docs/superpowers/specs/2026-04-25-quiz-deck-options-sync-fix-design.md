# Quiz Deck/Options Sync Fix — Design Spec

**Date:** 2026-04-25
**Scope:** Frontend only (`frontend/app.js`)
**Reported symptom:** When a chapter filter is active, the question on screen does not match the four answer options. Picking any option marks the answer wrong.

---

## Root cause

Two related bugs in the `Quiz` component, both rooted in the fact that `deck` (the filtered card list used for rendering) and `cards[index]` (the unfiltered shuffled list used by the options-shuffling effect) reference different cards once a chapter filter is active.

### Bug 1 — Wrong options shown

[frontend/app.js:114-121](../../../frontend/app.js#L114-L121)

```js
useEffect(() => {
  if (cards && cards[index]) {
    setShuffledOptions(shuffle(cards[index].options));
    ...
  }
}, [cards, index]);
```

[frontend/app.js:137-140](../../../frontend/app.js#L137-L140)

```js
const deck = selectedSections
  ? cards.filter((c) => selectedSections.includes(c.section))
  : cards;
const card = deck[index];
```

When `selectedSections` is non-null, `deck` is a strict subset of `cards`. The render reads `deck[index]` for the question, prompt text, and `correct_answer`. The effect reads `cards[index]` for the option list — at the same `index`, this is a different card. The user sees one card's question with another card's options. Since `card.correct_answer` belongs to the displayed question (not the displayed options), no option ever matches and every answer marks wrong.

Reproducer (from production data):
- Filter to Chapter 1.
- A card displays the question for `super-thinking-the-big-book-of-mental-models-004` ("Carl Jacobi's principle 'Invert, always invert'…").
- The four options shown are from `super-thinking-the-big-book-of-mental-models-092` ("luck surface area").

### Bug 2 — Stale options after switching chapters

The same effect lists `[cards, index]` as its dependencies. When the user opens the chapter sheet, picks a different chapter set, and applies, `selectedSections` changes. `applyChapters` resets `index` to 0 — but if the previous `index` was already 0, neither dependency changes and the effect does not re-run. The displayed options remain those of the previously displayed card until the user advances.

---

## Fix

Centralize `deck` in a `useMemo` so the render and the options-shuffling effect read the same value; depend the effect on `deck` so any change to filter or source list re-runs it.

### Change 1 — imports

[frontend/app.js:2](../../../frontend/app.js#L2)

Before:
```js
import { useState, useEffect } from 'https://esm.sh/preact@10/hooks';
```

After:
```js
import { useState, useEffect, useMemo } from 'https://esm.sh/preact@10/hooks';
```

### Change 2 — Quiz component body

Replace the existing options-shuffling effect and the inline `deck` computation with a memoized `deck` and an effect keyed on it.

Before (`frontend/app.js:114-141`):

```js
useEffect(() => {
  if (cards && cards[index]) {
    setShuffledOptions(shuffle(cards[index].options));
    setSelected(null);
    setFlipped(false);
    setAnswered(false);
  }
}, [cards, index]);

// ... unrelated effect omitted ...

const sections = cards[0]?.section
  ? [...new Set(cards.map((c) => c.section))]
  : [];
const deck = selectedSections
  ? cards.filter((c) => selectedSections.includes(c.section))
  : cards;
const card = deck[index];
```

After:

```js
const deck = useMemo(() => {
  if (!cards) return null;
  return selectedSections
    ? cards.filter((c) => selectedSections.includes(c.section))
    : cards;
}, [cards, selectedSections]);

useEffect(() => {
  if (deck && deck[index]) {
    setShuffledOptions(shuffle(deck[index].options));
    setSelected(null);
    setFlipped(false);
    setAnswered(false);
  }
}, [deck, index]);

// ... unrelated effect omitted ...

const sections = cards?.[0]?.section
  ? [...new Set(cards.map((c) => c.section))]
  : [];
const card = deck?.[index];
```

The optional chaining on `cards?.[0]` and `deck?.[index]` keeps the early-return guards happy while the memo settles on the first render.

---

## Why this fixes both bugs

- **Bug 1:** The effect now reads from the same `deck` the render uses, so the options are guaranteed to belong to the displayed card.
- **Bug 2:** `deck` is a memoized value that re-references whenever `cards` or `selectedSections` change. When `selectedSections` flips and `index` is already 0, `deck` is a new array reference, the effect re-runs, and options reshuffle for the new card-at-0.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/app.js` | Add `useMemo` import; memoize `deck`; update options-shuffling effect to depend on `deck`; remove inline `deck` from render path. |

No backend changes. No new files. No schema or data migrations.

---

## Verification

Manual, in a real browser (matches the project's existing UI verification approach — there is no automated test harness for the frontend).

1. Run backend (`cd backend && ./start.sh`) and open `frontend/index.html` per the project's local dev flow.
2. Authenticate with the access token.
3. Open the Super Thinking deck. Tap **📚 Chapters**, select **Chapter 1 — Being Wrong Less** plus one Chapter 1 sub-topic (e.g. **Keep It Simple, Stupid!**), apply.
4. For three consecutive cards confirm:
   - The four options are textually consistent with the question (no Q from one topic + options from another).
   - Tapping the correct option highlights green and flips the card; the explanation matches.
   - Tapping a wrong option highlights red and the explanation reveals the correct answer.
5. Mid-deck, reopen the chapter sheet, pick a different single chapter, apply. Confirm the new card-at-0 displays freshly shuffled options that match its question.
6. Clear chapter filter (tap **All**, apply). Confirm normal play resumes.

Failure of any bullet above blocks the change.

---

## Out of scope

- Adding a `page` reference field to cards (separate, paused brainstorm).
- Tag-filter redesign with topic dimensions (separate, paused brainstorm).
- Any backend, API, or book-JSON schema change.
- Automated test harness for the Quiz component.
- Refactoring beyond what the fix requires.
