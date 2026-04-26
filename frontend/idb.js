const DB_NAME = 'flashcards';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
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
  return dbPromise;
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
  const [entries, keys] = await new Promise((resolve, reject) => {
    const t = db.transaction('progress_queue', 'readonly');
    const store = t.objectStore('progress_queue');
    let entriesResult, keysResult;
    const reqEntries = store.getAll();
    reqEntries.onsuccess = () => { entriesResult = reqEntries.result; };
    const reqKeys = store.getAllKeys();
    reqKeys.onsuccess = () => { keysResult = reqKeys.result; };
    t.oncomplete = () => resolve([entriesResult, keysResult]);
    t.onerror = () => reject(t.error);
  });
  for (let i = 0; i < entries.length; i++) {
    await saveFn(entries[i]);
    await idbRequest(db, 'progress_queue', 'readwrite', (s) => s.delete(keys[i]));
  }
}
