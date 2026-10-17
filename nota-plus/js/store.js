// Settings live in localStorage. Notes and audio live in IndexedDB, all on this device.

const SETTINGS_KEY = 'nota-plus.settings';

export function defaults() {
  const ar = (navigator.language || '').toLowerCase().startsWith('ar');
  return {
    uiLang: ar ? 'ar' : 'en',
    apiKey: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    sttModel: 'whisper-large-v3-turbo',
    chatModel: 'llama-3.3-70b-versatile',
    engine: 'auto', // auto | device | cloud
    sttLang: 'auto', // auto | en | ar
    summaryLang: ar ? 'ar' : 'en',
    template: 'meeting',
    saveAudio: false,
    liveTranslate: false,
    arLocale: 'ar-SA',
    enLocale: 'en-US'
  };
}

export function loadSettings() {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return defaults();
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

const DB_NAME = 'nota-plus';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('notes', { keyPath: 'id' });
        db.createObjectStore('audio', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const notesDb = {
  all: () => run('notes', 'readonly', (s) => s.getAll()),
  get: (id) => run('notes', 'readonly', (s) => s.get(id)),
  put: (note) => run('notes', 'readwrite', (s) => s.put(note)),
  del: (id) => run('notes', 'readwrite', (s) => s.delete(id)),
  clear: () => run('notes', 'readwrite', (s) => s.clear())
};

export const audioDb = {
  get: (id) => run('audio', 'readonly', (s) => s.get(id)),
  put: (id, blob) => run('audio', 'readwrite', (s) => s.put({ id, blob })),
  del: (id) => run('audio', 'readwrite', (s) => s.delete(id)),
  clear: () => run('audio', 'readwrite', (s) => s.clear())
};

export async function storageEstimate() {
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage || 0, quota: e.quota || 0 };
  } catch {
    return null;
  }
}

export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {}
}
