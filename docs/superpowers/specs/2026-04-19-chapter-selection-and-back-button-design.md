# Chapter Selection & Back Button — Design Spec

**Date:** 2026-04-19  
**Scope:** Frontend only (`frontend/app.js`)  
**Approach:** Option A — minimal in-place changes

---

## Features

### 1. Chapter Bottom Sheet (multi-select)

**Trigger:** The existing `📚 Chapters` button in the top-right of the Quiz screen.

**Behavior:**
- Tapping the button opens a bottom sheet overlay.
- A semi-transparent dark backdrop covers the card area behind the sheet.
- The sheet slides up using a CSS `transform: translateY` transition.
- Tapping the backdrop closes the sheet without applying changes.

**Sheet contents:**
- Header: "Select Chapters"
- Pills row: one pill per chapter, plus an "All" pill at the start.
  - Selected pill: purple background (`var(--accent)`), white text.
  - Unselected pill: outline border, muted text.
  - Tapping a pill toggles its selection.
  - Tapping "All" selects all chapters and closes immediately (no Apply needed).
- Apply button at the bottom: label reads `Apply (N chapters)` where N is the count of selected chapters. Disabled/greyed if zero chapters selected.

**State change:**
- Replace `activeSection` (single string | null) with `selectedSections` (array of strings | null).
  - `null` means "All Chapters" — same as current behaviour.
  - Non-null array means only cards from those chapters are included in the deck.
- On Apply: update `selectedSections`, reset `index` to 0, clear `selected` and `flipped`, close the sheet.
- A separate `showChapters` boolean controls sheet visibility (already exists, repurposed).
- A `pendingSections` local state inside the sheet tracks selections before Apply is pressed, so dismissing without applying discards changes.

**Button label update:**
- When `selectedSections` is null: show `📚 Chapters`
- When one chapter selected: show `📖 Ch 1` (truncated to ~10 chars if needed)
- When multiple selected: show `📖 2 chapters`

---

### 2. Back Button on Explanation Face

**Location:** The back face of the flip card (explanation/result side), between the explanation text and the Next/Results button.

**Behavior:**
- A `← Question` button is rendered above the Next Card / See Results button.
- Clicking it sets `flipped = false`, revealing the front face (question + options).
- `selected` state is not cleared — the previously chosen option remains highlighted in its correct/incorrect color.
- The user can re-read the question and their answer, but cannot re-answer (options are non-interactive once `selected` is set).

**Styling:** Same width as the Next button, but secondary style — white background, accent-colored border and text.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/app.js` | Replace dropdown chapter UI with bottom sheet; add `← Question` button on back face |

No backend changes. No new files.

---

## State Before / After

| State var | Before | After |
|-----------|--------|-------|
| `activeSection` | `string \| null` | removed |
| `selectedSections` | — | `string[] \| null` (null = all) |
| `showChapters` | `boolean` | `boolean` (same, repurposed) |
| `flipped` | `boolean` | `boolean` (same, back button sets to false) |
| `selected` | `string \| null` | `string \| null` (unchanged, preserved on back) |

---

## Out of Scope

- Persisting chapter selection across sessions or page reloads.
- Moving chapter selection to the Book List screen.
- Any backend / API changes.
