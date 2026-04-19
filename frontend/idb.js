const DB_NAME = 'flashcards';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cards')) {
        db.createObjectStore('cards', { keyPath: 'book' });
      }
      if (!db.objectStoreNames.contains('progress_queue')) {
        db.createObjectStore('progress_queue', { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheCards(bookData) {
  const db = await openDB();
  await idbRequest(db, 'cards', 'readwrite', (s) => s.put(bookData));
}

export async function getCachedCards(bookId) {
  const db = await openDB();
  return idbRequest(db, 'cards', 'readonly', (s) => s.get(bookId));
}

export async function queueProgress(entry) {
  const db = await openDB();
  await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.add(entry));
}

export async function flushProgressQueue(saveFn) {
  const db = await openDB();
  const entries = await idbRequest(db, 'progress_queue', 'readonly', (s) => s.getAll());
  const keys = await idbRequest(db, 'progress_queue', 'readonly', (s) => s.getAllKeys());
  for (let i = 0; i < entries.length; i++) {
    await saveFn(entries[i]);
    await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
  }
}
