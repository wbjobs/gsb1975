/**
 * 日志查询层（主线程只读 / 清理）
 * 写入走 Web Worker，查询与清空在主线程直连同一个 IndexedDB 库。
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

/**
 * 查询日志，支持级别过滤与关键字模糊匹配，按时间倒序。
 * @param {{ level?: string, keyword?: string, limit?: number }} filter
 */
export async function queryLogs({ level = '', keyword = '', limit = 200 } = {}) {
  const db = await openDB();
  const all = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const kw = keyword.trim().toLowerCase();
  return all
    .filter((row) => !level || row.level === level)
    .filter((row) => {
      if (!kw) return true;
      return (
        String(row.component || '').toLowerCase().includes(kw) ||
        String(row.message || '').toLowerCase().includes(kw)
      );
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

export async function clearLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
