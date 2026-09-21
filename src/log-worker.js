/**
 * 日志 Web Worker
 * 职责：在独立线程中打开 IndexedDB 并批量写入日志，避免阻塞主线程渲染。
 * 协议（postMessage）：
 *   { type: 'log',  payload: LogEntry }      -> 写入一条日志
 *   { type: 'ready?' }                       -> 回 { type: 'ready' }
 * 回复：
 *   { type: 'logged', id }                   -> 写入成功
 *   { type: 'error', message }               -> 写入失败
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
        store.createIndex('ts', 'ts');
        store.createIndex('level', 'level');
        store.createIndex('component', 'component');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function writeLog(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === 'log') {
      const id = await writeLog(msg.payload);
      self.postMessage({ type: 'logged', id });
    } else if (msg.type === 'ready?') {
      await openDB();
      self.postMessage({ type: 'ready' });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
