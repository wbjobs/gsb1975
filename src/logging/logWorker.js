/**
 * Web Worker：在独立线程中读写 IndexedDB，日志 I/O 不阻塞主线程 UI。
 * 协议：接收 { id, type, payload }，回发 { id, ok, data | error }。
 * type: 'add' | 'query' | 'clear' | 'count'
 */
const DB_NAME = 'error-boundary-logs';
const DB_VERSION = 1;
const STORE = 'logs';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('level', 'level');
        store.createIndex('boundaryId', 'boundaryId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const handlers = {
  async add(entry) {
    const db = await openDB();
    const record = { ...entry, timestamp: entry.timestamp || Date.now() };
    await tx(db, 'readwrite', (s) => s.add(record));
    return { saved: true };
  },

  async query({ level, boundaryId, limit = 200 } = {}) {
    const db = await openDB();
    const all = await requestToPromise(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    );
    let rows = all;
    if (level) rows = rows.filter((r) => r.level === level);
    if (boundaryId) rows = rows.filter((r) => r.boundaryId === boundaryId);
    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows.slice(0, limit);
  },

  async clear() {
    const db = await openDB();
    await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
    return { cleared: true };
  },

  async count() {
    const db = await openDB();
    return requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).count());
  },
};

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (!handlers[type]) throw new Error(`未知日志指令: ${type}`);
    const data = await handlers[type](payload);
    self.postMessage({ id, ok: true, data });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
