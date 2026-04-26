# Frontend Refactor Design — 2026-04-26

## Goal

Address all findings from the post-d1ef416 code review. Improve maintainability of the Preact SPA without over-engineering. No new features; no scope creep.

## Folder Structure

```
frontend/
  app.js                ← App router + 4 screens (TokenGate, BookList, Quiz shell, EndScreen)
  api.js                ← HTTP client (remove dead getProgress export)
  idb.js                ← IndexedDB (fix flushProgressQueue error handling)
  sw.js                 ← Service worker (update ASSETS list)
  styles.js             ← Shared button/form style objects
  hooks/
    useQuizSession.js   ← All quiz state + logic extracted from Quiz component
  components/
    ChapterSheet.js     ← Chapter selection modal extracted from Quiz render body
    ErrorBoundary.js    ← Class component error boundary wrapping App
  lib/                  ← Vendored Preact (unchanged)
  index.html            ← PWA shell (unchanged)
  manifest.json         ← (unchanged)
```

## Component / Module Contracts

### `hooks/useQuizSession.js`

Owns all quiz state and derived values. Quiz component becomes a thin render layer.

**Input:** `{ book }` (the selected book object)

**Returns:**
```js
{
  // State
  cards, deck, card, index, flipped, score, phase, reviewing,
  selections, answeredFlags, optionsByIndex, sections, error,
  // Derived
  isCorrect, canGoBack,
  // Handlers
  handleSelect(option),
  next(),
  back(),
  nextIndex(from),      // exposed so Quiz can label "Next →" vs "Skip to Results"
  resetSession(newSelection),  // null = all cards, string[] = filtered by section
}
```

**State slices:**
- `cards` — shuffled full card list loaded from cache or API
- `index` — current card position in `deck`
- `optionsByIndex` — Fisher-Yates shuffled options per deck position (stable per session)
- `selections` — selected answer per deck position (null = unanswered)
- `answeredFlags` — boolean per deck position (locked after first answer)
- `flipped` — whether card is showing back face
- `score` — correct answer count
- `selectedSections` — null (all) or string[] filter
- `sessionId` — UUID, new per session
- `reviewing` — whether in skip-review mode
- `phase` — `'playing'` | `'end'`

**Derived (useMemo):**
- `deck` — depends on `[cards, selectedSections]`
- `sections` — `[...new Set(cards.map(c => c.section))]`, depends on `[cards]`

**`resetSession(newSelection)`** — collapses the duplicated `applyChapters`/`applyAll` resets:
```js
setSelectedSections(newSelection);
setIndex(0);
setFlipped(false);
setScore(0);
setSessionId(randomUUID());
```

**Effects:**
1. Load cards on `book.id` change (cache-first, API fallback)
2. Re-initialize parallel arrays (`optionsByIndex`, `selections`, `answeredFlags`) on `deck` change
3. Reset `flipped` on `index` change
4. Flush offline progress queue once on mount (if `navigator.onLine`)

### `components/ChapterSheet.js`

Self-contained modal. Owns `pendingSections` temp state internally.

**Props:**
```js
{
  sections,          // string[] — full list of available chapters
  selectedSections,  // null | string[] — current active filter (for initial pending state)
  onApply(selection),  // null = all, string[] = filtered
  onClose(),
}
```

Does not accept `showChapters` — caller (Quiz) controls visibility by conditionally rendering `<ChapterSheet>`.

### `components/ErrorBoundary.js`

Preact class component. Wraps `<App>` at the render root in `app.js`.

**Behavior:** Catches any render error, shows "Something went wrong — reload" with a reload button. Prevents silent blank screen.

### `styles.js`

Plain JS objects with camelCase keys, compatible with Preact's `style=${obj}` prop form.

```js
export const btnPrimary    // accent background, white text
export const btnOutline    // surface background, accent border/text
export const btnGhost      // no border, accent text (← Books nav button)
export const btnDisabled   // muted background, muted text, default cursor
export const inputField    // password/text input styling
```

Used across TokenGate, Quiz, EndScreen, ChapterSheet — eliminates verbatim style string duplication.

### `api.js` change

Remove `getProgress` — it is never called. If progress history is needed in future, it can be re-added at that time.

### `idb.js` change

`flushProgressQueue` currently swallows all errors with `.catch(() => {})` at the call site. Fix the internal loop:

```js
// Before: silently continues on API failure
// After: stops on first failure, leaving remaining entries in queue
try {
  for (let i = 0; i < entries.length; i++) {
    await saveFn(entries[i]);
    await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
  }
} catch (_) {
  // Remaining entries stay queued for next flush
}
```

### `sw.js` change

Add new files to `ASSETS` cache list:
```js
'/styles.js', '/hooks/useQuizSession.js',
'/components/ChapterSheet.js', '/components/ErrorBoundary.js',
```

### `app.js` change

TokenGate: add empty-token guard
```js
if (!value.trim()) return;
```

Quiz: add `showChapters` state (simple boolean), render `<ChapterSheet>` conditionally, consume `useQuizSession` hook. Shrinks from 310-line god function to ~150-line render component.

## What Is NOT Changed

- `index.html` — no changes needed; ErrorBoundary is added in `app.js` at the `render()` call
- `lib/` — vendored Preact untouched
- `manifest.json` — untouched
- Backend — entirely out of scope
- CSS in `index.html` — card flip + slide animations stay in `<style>` tag

## Success Criteria

1. All existing quiz functionality works identically (flip, select, next, back, review-skipped, chapter filter)
2. `app.js` is under 250 lines
3. `useQuizSession.js` contains all 11 state slices and logic
4. `ChapterSheet` renders correctly and calls `onApply`/`onClose` correctly
5. `ErrorBoundary` catches a thrown error in a child and shows the reload UI
6. `styles.js` style objects used for all primary/outline/ghost buttons
7. `sw.js` caches all new file paths
8. No regressions in offline behaviour (`idb.js` flush still queues on failure)
