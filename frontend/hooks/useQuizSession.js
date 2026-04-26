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
    setCards(null);
    setSelectedSections(null);
    setError(null);
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
    setPhase('playing');
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
