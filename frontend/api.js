const BASE = window.API_BASE || '';

export function getToken() {
  return localStorage.getItem('auth_token') || '';
}

export function setToken(token) {
  localStorage.setItem('auth_token', token);
}

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw Object.assign(new Error(res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  listBooks: () => request('/books'),
  getCards: (bookId) => request(`/books/${bookId}/cards`),
  saveProgress: (bookId, cardId, correct, sessionId) =>
    request('/progress', {
      method: 'POST',
      body: JSON.stringify({
        book_id: bookId,
        card_id: cardId,
        correct,
        session_id: sessionId,
      }),
    }),
  getProgress: (bookId) => request(`/progress/${bookId}`),
};
