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
              style=${{ background: 'none', border: '1px solid var(--accent)', borderRadius: '8px', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.8rem', padding: '4px 10px' }}
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
