# Quiz Deck/Options Sync Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `Quiz` component so the displayed answer options always belong to the displayed question, including immediately after the user changes the chapter filter.

**Architecture:** Centralize the chapter-filtered card list (`deck`) in a `useMemo` so the render and the options-shuffling effect read the same value, and make the effect depend on `deck` so a filter change at `index === 0` still triggers a reshuffle.

**Tech Stack:** Preact 10 + `htm`, ESM imports from esm.sh, no build step, no JS test framework. Verification is manual in a browser per the project's existing convention (`CLAUDE.md`-equivalent guidance: "if you can't test the UI in the browser, say so explicitly").

**Scope notes:**
- Single file edited: `frontend/app.js`.
- No backend, API, schema, or data changes.
- No new automated tests added — the project has no JS test harness, and adding one is outside this fix's scope.

---

## Task 1: Replace `cards`-based options effect with `deck`-based memoized version

**Files:**
- Modify: `frontend/app.js:2` (imports)
- Modify: `frontend/app.js:114-141` (Quiz body — the effect plus the inline `deck`/`sections`/`card` lines)

**Spec reference:** `docs/superpowers/specs/2026-04-25-quiz-deck-options-sync-fix-design.md` § "Fix" (Change 1 + Change 2).

- [ ] **Step 1: Confirm the file lines still match the spec**

The spec was written against this exact code. Before editing, re-read both regions to confirm no drift since the spec was committed. If lines have moved, locate the equivalent code by content; do not edit by line number alone.

Run:

```bash
sed -n '1,5p;110,145p' frontend/app.js
```

Expected output (verbatim, modulo whitespace):

```js
import { h, render } from 'https://esm.sh/preact@10';
import { useState, useEffect } from 'https://esm.sh/preact@10/hooks';
import htm from 'https://esm.sh/htm@3';
import { api, getToken, setToken } from './api.js';
import { cacheCards, getCachedCards, queueProgress, flushProgressQueue } from './idb.js';
```

…and around line 114:

```js
  useEffect(() => {
    if (cards && cards[index]) {
      setShuffledOptions(shuffle(cards[index].options));
      setSelected(null);
      setFlipped(false);
      setAnswered(false);
    }
  }, [cards, index]);
```

…and around line 137:

```js
    const sections = cards[0]?.section
      ? [...new Set(cards.map((c) => c.section))]
      : [];
    const deck = selectedSections
      ? cards.filter((c) => selectedSections.includes(c.section))
      : cards;
    const card = deck[index];
```

If the imports already include `useMemo`, or the effect already uses `deck`, stop and tell the user — the fix may have been partially applied already.

- [ ] **Step 2: Add `useMemo` to the Preact hooks import**

Edit `frontend/app.js` line 2:

Before:
```js
import { useState, useEffect } from 'https://esm.sh/preact@10/hooks';
```

After:
```js
import { useState, useEffect, useMemo } from 'https://esm.sh/preact@10/hooks';
```

- [ ] **Step 3: Replace the `cards`-based options effect with a `deck`-based one**

In the `Quiz` component, replace the existing options-shuffling `useEffect` (the block currently at lines 114–121) with the version below. The replacement is in the same location; do not move it.

Before:
```js
  useEffect(() => {
    if (cards && cards[index]) {
      setShuffledOptions(shuffle(cards[index].options));
      setSelected(null);
      setFlipped(false);
      setAnswered(false);
    }
  }, [cards, index]);
```

After (note: depends on `deck`, which we will introduce in Step 4 — this code is correct only after Step 4 is also applied; do both before reloading the app):
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

- [ ] **Step 4: Replace the inline `deck` computation with a `useMemo`, and make `card` and `sections` tolerate a null `deck`**

Replace the three lines that currently compute `sections`, `deck`, and `card` (around lines 134–141) with a memoized `deck` placed *above* the options-shuffling effect from Step 3, plus updated `sections` and `card` lookups.

Final shape of the relevant region of the `Quiz` component (everything between `setSessionId` and the `if (error) return …` early returns):

```js
  const [answered, setAnswered] = useState(false);

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

  useEffect(() => {
    if (navigator.onLine) {
      flushProgressQueue(({ bookId, cardId, correct, sessionId: qSessionId }) =>
        api.saveProgress(bookId, cardId, correct, qSessionId)
      ).catch(() => {});
    }
  }, []);

  if (error) return html`<p style="padding:24px;color:var(--wrong)">${error}</p>`;
  if (!cards) return html`<p style="padding:24px;color:var(--text-muted)">Loading cards…</p>`;

  const sections = cards[0]?.section
    ? [...new Set(cards.map((c) => c.section))]
    : [];
  const card = deck?.[index];
  if (!card) return html`<p style="padding:24px;color:var(--text-muted)">No cards in selection.</p>`;
  const isCorrect = selected === card.correct_answer;
```

Concretely, the diff is:

1. **Insert** the `const deck = useMemo(...)` block immediately after the `load()` effect.
2. **Remove** the old inline `const deck = selectedSections ? ... : cards;` and `const card = deck[index];` lines.
3. **Re-add** `const card = deck?.[index];` (note the `?.`) directly above the `if (!card)` early return — the same place it lived before, just optional-chained.
4. `sections` keeps its current form: it's already guarded by `if (!cards) return …` above it, so it can keep using `cards[0]?.section`.

- [ ] **Step 5: Verify no other reference to `cards[index]` remains in the Quiz component**

The whole point of this fix is that `cards[index]` was the wrong reference. Run:

```bash
grep -n 'cards\[index\]' frontend/app.js
```

Expected output: empty (no matches).

If anything matches inside the Quiz component, it's the same bug class — investigate before continuing.

- [ ] **Step 6: Verify no syntax error by importing the module**

There is no build step; the easiest static check is to ask Node to parse the module:

```bash
node --input-type=module --check < frontend/app.js
```

Expected output: no output, exit code 0.

If Node reports a syntax error, fix it before moving on. (`--check` only validates syntax, not runtime correctness — Step 7 covers behavior.)

- [ ] **Step 7: Manual browser verification per the spec**

Run the app the way you normally do for local development (the project does not document a single canonical local dev URL — `index.html` has both `localhost:8000` and `/api` as `API_BASE` candidates). Then perform every step of the spec's Verification section:

> 1. Authenticate with the access token.
> 2. Open the Super Thinking deck. Tap **📚 Chapters**, select **Chapter 1 — Being Wrong Less** plus one Chapter 1 sub-topic (e.g. **Keep It Simple, Stupid!**), apply.
> 3. For three consecutive cards confirm:
>    - The four options are textually consistent with the question (no Q from one topic + options from another).
>    - Tapping the correct option highlights green and flips the card; the explanation matches.
>    - Tapping a wrong option highlights red and the explanation reveals the correct answer.
> 4. Mid-deck, reopen the chapter sheet, pick a different single chapter, apply. Confirm the new card-at-0 displays freshly shuffled options that match its question.
> 5. Clear chapter filter (tap **All**, apply). Confirm normal play resumes.

If any bullet fails, STOP. Do not commit. Report which bullet failed and what was on screen.

- [ ] **Step 8: Commit**

```bash
git add frontend/app.js
git commit -m "$(cat <<'EOF'
fix(quiz): keep options in sync with the filtered deck

Memoize the chapter-filtered deck so the render and the options-shuffling
effect read the same array, and depend the effect on deck so switching
chapters at index 0 still reshuffles. Fixes the case where filtering by
chapter caused the displayed question to come from the filtered deck while
the options came from the unfiltered cards array, marking every answer
wrong.

Spec: docs/superpowers/specs/2026-04-25-quiz-deck-options-sync-fix-design.md
EOF
)"
```

---

## Self-Review

**Spec coverage** — every "Fix" item in the spec has a step:
- Spec "Change 1 — imports" → Step 2
- Spec "Change 2 — Quiz component body" (memoize `deck`) → Step 4
- Spec "Change 2 — Quiz component body" (effect on `deck`/`index`) → Step 3
- Spec "Change 2 — Quiz component body" (`card = deck?.[index]`) → Step 4
- Spec "Verification" 6 bullets → Step 7
- Spec "Files changed" (`frontend/app.js`) → only file touched

**Placeholder scan** — no TBDs, every code block is the actual code. Bash commands have expected output. Commit message is concrete.

**Type/name consistency** — `deck`, `cards`, `selectedSections`, `index`, `setShuffledOptions` are all named identically across the spec, every step, and the existing codebase (verified against `frontend/app.js:84-95`).

**Risk note for the executor:** Steps 2, 3, and 4 must be applied together before reloading the app — between them the file would either reference the un-imported `useMemo` or call `deck` before it is declared. Don't reload mid-task.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-25-quiz-deck-options-sync-fix.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
