import { h, render } from 'https://esm.sh/preact@10';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact@10/hooks';
import htm from 'https://esm.sh/htm@3';
import { api, getToken, setToken } from './api.js';
import { cacheCards, getCachedCards, queueProgress, flushProgressQueue } from './idb.js';

const html = htm.bind(h);

function randomUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// ── Token Gate ────────────────────────────────────────────────────────────────
function TokenGate({ onAuth }) {
  const [value, setValue] = useState('');
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
        onKeyDown=${(e) => e.key === 'Enter' && (setToken(value), onAuth())}
        style="padding:12px 16px;border-radius:var(--radius);border:1px solid var(--accent);background:var(--surface);color:var(--text);font-size:1rem;width:100%;max-width:320px"
      />
      <button
        onClick=${() => { setToken(value); onAuth(); }}
        style="padding:12px 0;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer;width:100%;max-width:320px"
      >Enter</button>
    </div>
  `;
}

// ── Book List ─────────────────────────────────────────────────────────────────
function BookList({ onSelect }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listBooks()
      .then((data) => setBooks(data.books))
      .catch((e) => setError(e.status === 403 ? 'Invalid token' : 'Failed to load books'));
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

// ── Quiz ──────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

  function openChapters() {
    setPendingSections(selectedSections ? [...selectedSections] : null);
    setShowChapters(true);
  }

  function applyChapters() {
    if (pendingSections !== null && pendingSections.length === 0) return;
    setSelectedSections(pendingSections);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setAnswered(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(randomUUID());
  }

  function applyAll() {
    setSelectedSections(null);
    setIndex(0);
    setSelected(null);
    setFlipped(false);
    setAnswered(false);
    setScore(0);
    setShowChapters(false);
    setSessionId(randomUUID());
  }

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

  function advance() {
    if (index + 1 < deck.length) setIndex((i) => i + 1);
    else onFinish({ score, total: deck.length });
  }

  return html`
    <div style="padding:16px;max-width:600px;margin:0 auto">
      <div style="padding-top:env(safe-area-inset-top,16px);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <button
            onClick=${onBack}
            style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:0.875rem;padding:0;display:flex;align-items:center;gap:4px"
          >← Books</button>
          <span style="color:var(--text-muted);font-size:0.875rem">${index + 1} / ${deck.length}</span>
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
              onClick=${() => { setFlipped(false); setSelected(null); }}
              style="width:100%;padding:14px;background:var(--surface);color:var(--accent);border:1px solid var(--accent);border-radius:var(--radius);font-size:1rem;cursor:pointer;margin-bottom:10px"
            >← Question</button>
            <button
              onClick=${advance}
              style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);font-size:1rem;cursor:pointer"
            >${index + 1 < deck.length ? 'Next Card →' : 'See Results'}</button>
          </div>

        </div>
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
            >${pendingSections === null ? 'Apply (all)' : pendingSections.length === 0 ? 'Select at least one chapter' : 'Apply (' + pendingSections.length + ' chapter' + (pendingSections.length > 1 ? 's' : '') + ')'}</button>
          </div>
        </div>
      `}
    </div>
  `;
}

// ── End Screen ────────────────────────────────────────────────────────────────
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

// ── App Router ────────────────────────────────────────────────────────────────
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

render(html`<${App} />`, document.getElementById('app'));
