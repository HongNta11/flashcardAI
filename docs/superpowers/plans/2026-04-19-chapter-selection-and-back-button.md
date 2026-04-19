# Chapter Selection & Back Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-chapter dropdown with a multi-select bottom sheet, and add a "← Question" back button on the card explanation face.

**Architecture:** All changes are in `frontend/app.js` (Preact + htm, no build step). The Quiz component's `activeSection` state is replaced by `selectedSections` (array | null) and a `pendingSections` working copy used while the sheet is open. The bottom sheet is a fixed-position overlay rendered inside the Quiz return.

**Tech Stack:** Preact 10, htm, vanilla CSS (inline styles matching existing codebase patterns)

---

## File Map

| File | Change |
|------|--------|
| `frontend/app.js` | Remove `activeSection`, add `selectedSections` + `pendingSections`, replace dropdown with bottom sheet, add back button on card back face |

---

### Task 1: Replace `activeSection` with `selectedSections` and update deck filter

**Files:**
- Modify: `frontend/app.js:91-92` (state declarations)
- Modify: `frontend/app.js:128-132` (click-outside effect — remove)
- Modify: `frontend/app.js:137-140` (sections/deck derivation)
- Modify: `frontend/app.js:144-150` (selectChapter function — remove)

- [ ] **Step 1: Replace the two state declarations at lines 91–92**

Find:
```javascript
  const [activeSection, setActiveSection] = useState(null);
  const [showChapters, setShowChapters] = useState(false);
```

Replace with:
```javascript
  const [selectedSections, setSelectedSections] = useState(null);
  const [pendingSections, setPendingSections] = useState(null);
  const [showChapters, setShowChapters] = useState(false);
```

- [ ] **Step 2: Remove the click-outside `useEffect` (lines 128–132)**

Delete this block entirely:
```javascript
  useEffect(() => {
    if (!showChapters) return;
    const close = () => setShowChapters(false);
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [showChapters]);
```

The bottom sheet uses a backdrop click instead — this effect is no longer needed.

- [ ] **Step 3: Update the deck filter at lines 137–140**

Find:
```javascript
  const sections = cards[0]?.section
    ? [...new Set(cards.map((c) => c.section))]
    : [];
  const deck = activeSection ? cards.filter((c) => c.section === activeSection) : cards;
```

Replace with:
```javascript
  const sections = cards[0]?.section
    ? [...new Set(cards.map((c) => c.section))]
    : [];
  const deck = selectedSections
    ? cards.filter((c) => selectedSections.includes(c.section))
    : cards;
```

- [ ] **Step 4: Remove `selectChapter` and replace with `openChapters` + `applyChapters`**

Find and delete:
```javascript
  function selectChapter(section) {
    setActiveSection(section);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setShowChapters(false);
  }
```

Add these two functions in its place:
```javascript
  function openChapters() {
    setPendingSections(selectedSections ? [...selectedSections] : null);
    setShowChapters(true);
  }

  function applyChapters() {
    setSelectedSections(pendingSections);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setShowChapters(false);
  }

  function applyAll() {
    setSelectedSections(null);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setShowChapters(false);
  }
```

- [ ] **Step 5: Manually test deck filtering works**

Open the app at http://localhost:8000 (or the live URL). Pick a book that has multiple chapters. Open DevTools console and verify no errors. The quiz should still load and show all cards (since `selectedSections` starts as null).

- [ ] **Step 6: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/app.js
git commit -m "refactor: replace activeSection with selectedSections array for multi-chapter support"
```

---

### Task 2: Replace chapter dropdown with bottom sheet

**Files:**
- Modify: `frontend/app.js` — the chapter button and dropdown (lines 180–202)
- Modify: `frontend/app.js` — add overlay at end of Quiz return

- [ ] **Step 1: Replace the chapter button and dropdown in the header**

Find this entire block (inside the header `<div style="display:flex;justify-content:space-between...">`):
```javascript
          ${sections.length > 0 && html`
            <div style="position:relative">
              <button
                onClick=${() => setShowChapters((v) => !v)}
                style="background:none;border:1px solid var(--accent);border-radius:8px;cursor:pointer;color:var(--accent);font-size:0.8rem;padding:4px 10px"
              >${activeSection ? '📖 ' + activeSection : '📚 Chapters'}</button>
              ${showChapters && html`
                <div style="position:absolute;right:0;top:calc(100% + 6px);background:var(--surface);border-radius:var(--radius);box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:180px;z-index:10;overflow:hidden">
                  <div
                    onClick=${() => selectChapter(null)}
                    style="padding:12px 16px;cursor:pointer;font-size:0.9rem;border-bottom:1px solid #eee;color:${!activeSection ? 'var(--accent)' : 'var(--text)'}; font-weight:${!activeSection ? '600' : '400'}"
                  >All Chapters</div>
                  ${sections.map((s) => html`
                    <div
                      key=${s}
                      onClick=${() => selectChapter(s)}
                      style="padding:12px 16px;cursor:pointer;font-size:0.9rem;border-bottom:1px solid #eee;color:${activeSection === s ? 'var(--accent)' : 'var(--text)'};font-weight:${activeSection === s ? '600' : '400'}"
                    >${s}</div>
                  `)}
                </div>
              `}
            </div>
          `}
```

Replace with just the button (no dropdown — the sheet is rendered separately):
```javascript
          ${sections.length > 0 && html`
            <button
              onClick=${openChapters}
              style="background:none;border:1px solid var(--accent);border-radius:8px;cursor:pointer;color:var(--accent);font-size:0.8rem;padding:4px 10px"
            >${
              selectedSections === null
                ? '📚 Chapters'
                : selectedSections.length === 1
                  ? '📖 ' + selectedSections[0].slice(0, 12)
                  : '📖 ' + selectedSections.length + ' chapters'
            }</button>
          `}
```

- [ ] **Step 2: Add the bottom sheet overlay at the end of the Quiz return**

The overlay must be the last child INSIDE the outer div (not a sibling) — `position:fixed` will still cover the full viewport. Find the card-scene closing tag followed by the outer div closing:
```javascript
      </div>

    </div>
  `;
}
```
(The first `</div>` closes the `<div key=${index} class="slide-in card-scene">` and the second closes `<div style="padding:16px;max-width:600px;margin:0 auto">`)

Replace with (overlay is inserted as last child, before outer div closes):
```javascript
      </div>

      ${showChapters && html`
      <div
        onClick=${() => setShowChapters(false)}
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
              onClick=${applyAll}
              style="padding:8px 16px;border-radius:20px;border:none;background:${pendingSections === null ? 'var(--accent)' : '#dde3f5'};color:${pendingSections === null ? '#fff' : 'var(--text-muted)'};cursor:pointer;font-size:0.875rem;font-weight:600"
            >All</button>
            ${sections.map((s) => {
              const on = pendingSections !== null && pendingSections.includes(s);
              return html`
                <button
                  key=${s}
                  onClick=${() => {
                    if (pendingSections === null) {
                      setPendingSections([s]);
                    } else if (on) {
                      setPendingSections(pendingSections.filter((x) => x !== s));
                    } else {
                      setPendingSections([...pendingSections, s]);
                    }
                  }}
                  style="padding:8px 16px;border-radius:20px;border:none;background:${on ? 'var(--accent)' : '#dde3f5'};color:${on ? '#fff' : 'var(--text)'};cursor:pointer;font-size:0.875rem"
                >${s}</button>
              `;
            })}
          </div>
          <button
            onClick=${applyChapters}
            disabled=${pendingSections !== null && pendingSections.length === 0}
            style="width:100%;padding:14px;background:${pendingSections !== null && pendingSections.length === 0 ? '#dde3f5' : 'var(--accent)'};color:${pendingSections !== null && pendingSections.length === 0 ? 'var(--text-muted)' : '#fff'};border:none;border-radius:var(--radius);font-size:1rem;font-weight:600;cursor:${pendingSections !== null && pendingSections.length === 0 ? 'default' : 'pointer'}"
          >${pendingSections === null ? 'All Chapters' : pendingSections.length === 0 ? 'Select at least one chapter' : 'Apply (' + pendingSections.length + ' chapter' + (pendingSections.length > 1 ? 's' : '') + ')'}</button>
        </div>
      </div>
    `}
    </div>
  `;
}
```

- [ ] **Step 3: Manually test the bottom sheet**

1. Load the app, pick a book with multiple chapters.
2. Tap `📚 Chapters` — bottom sheet slides up with "All" pill highlighted.
3. Tap two chapter pills — they turn purple, Apply button updates count.
4. Tap Apply — sheet closes, only those chapters' cards appear in quiz, button shows `📖 2 chapters`.
5. Tap `📖 2 chapters` — sheet reopens with those two pills still selected.
6. Tap "All" — sheet closes immediately, all cards return, button shows `📚 Chapters`.
7. Tap backdrop (outside sheet) — sheet closes, selection unchanged.
8. Select 0 pills (deselect all) — Apply button is disabled/greyed.

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/app.js
git commit -m "feat: replace chapter dropdown with multi-select bottom sheet"
```

---

### Task 3: Add "← Question" back button on the explanation face

**Files:**
- Modify: `frontend/app.js` — card back face (lines ~235–239)

- [ ] **Step 1: Add the back button above the Next/Results button on the card back face**

Find:
```javascript
            <button
              onClick=${advance}
              style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
            >${index + 1 < deck.length ? 'Next Card →' : 'See Results'}</button>
```

Replace with:
```javascript
            <button
              onClick=${() => setFlipped(false)}
              style="width:100%;padding:14px;background:var(--surface);color:var(--accent);border:1px solid var(--accent);border-radius:var(--radius);font-size:1rem;cursor:pointer;margin-bottom:10px"
            >← Question</button>
            <button
              onClick=${advance}
              style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
            >${index + 1 < deck.length ? 'Next Card →' : 'See Results'}</button>
```

- [ ] **Step 2: Manually test the back button**

1. Start a quiz, tap any answer option — card flips to show explanation.
2. Tap `← Question` — card flips back to show question with your selected answer still highlighted in red/green.
3. Options are non-interactive (tapping them does nothing since `selected` is already set).
4. Tap the card or wait — it should stay flipped to the front.
5. Tap `← Question` again and then tap `Next Card →` on the back — advances normally.

- [ ] **Step 3: Commit**

```bash
cd /home/azureuser/pink/flashcard_ai
git add frontend/app.js
git commit -m "feat: add back button on explanation face to re-read the question"
```
