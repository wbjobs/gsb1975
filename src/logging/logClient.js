/**
 * 主线程日志客户端：
 *  - 优先通过 Web Worker 写 IndexedDB（不阻塞 UI）
 *  - Worker 不可用时降级为主线程直连 IndexedDB
 *  - IndexedDB 也不可用时降级为内存环形缓冲，保证日志不丢、可查
 */
const DB_NAME = 'error-boundary-logs';
const STORE = 'logs';
const MEMORY_FALLBACK_LIMIT = 500;

class LogClient {
  constructor() {
    this.worker = null;
    this.seq = 0;
    this.pending = new Map();
    this.memoryFallback = [];
    this.mode = 'worker';
    this.listeners = new Set();
    this._initWorker();
  }

  _initWorker() {
    try {
      this.worker = new Worker(new URL('./logWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const { id, ok, data, error } = e.data || {};
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        ok ? p.resolve(data) : p.reject(new Error(error || 'worker 日志写入失败'));
      };
      this.worker.onerror = () => this._degradeTo('main-thread');
    } catch {
      this._degradeTo('main-thread');
    }
  }

  _degradeTo(mode) {
    if (this.worker) { try { this.worker.terminate(); } catch {} this.worker = null; }
    this.mode = mode;
  }

  _callWorker(type, payload, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('日志 Worker 响应超时'));
      }, timeoutMs);
      const origResolve = resolve, origReject = reject;
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); origResolve(v); },
        reject: (e) => { clearTimeout(timer); origReject(e); },
      });
      this.worker.postMessage({ id, type, payload });
    });
  }

  _openMainDB() {
    if (this._mainDB) return this._mainDB;
    this._mainDB = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
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
    return this._mainDB;
  }

  async _mainThreadOp(type, payload) {
    const db = await this._openMainDB();
    if (type === 'add') {
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).add({ ...payload, timestamp: payload.timestamp || Date.now() });
        t.oncomplete = () => resolve({ saved: true });
        t.onerror = () => reject(t.error);
      });
    }
    if (type === 'query') {
      const { level, boundaryId, limit = 200 } = payload || {};
      const all = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      let rows = all;
      if (level) rows = rows.filter((r) => r.level === level);
      if (boundaryId) rows = rows.filter((r) => r.boundaryId === boundaryId);
      rows.sort((a, b) => b.timestamp - a.timestamp);
      return rows.slice(0, limit);
    }
    if (type === 'clear') {
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).clear();
        t.oncomplete = () => resolve({ cleared: true });
        t.onerror = () => reject(t.error);
      });
    }
    if (type === 'count') {
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    throw new Error(`未知日志指令: ${type}`);
  }

  async _op(type, payload) {
    if (this.mode === 'worker' && this.worker) {
      try {
        return await this._callWorker(type, payload);
      } catch {
        this._degradeTo('main-thread');
      }
    }
    if (this.mode === 'main-thread') {
      try {
        return await this._mainThreadOp(type, payload);
      } catch {
        this._degradeTo('memory');
      }
    }
    // 内存降级
    if (type === 'add') {
      this.memoryFallback.push({ ...payload, timestamp: payload.timestamp || Date.now() });
      if (this.memoryFallback.length > MEMORY_FALLBACK_LIMIT) this.memoryFallback.shift();
      return { saved: true, memory: true };
    }
    if (type === 'query') {
      const { level, boundaryId, limit = 200 } = payload || {};
      let rows = [...this.memoryFallback];
      if (level) rows = rows.filter((r) => r.level === level);
      if (boundaryId) rows = rows.filter((r) => r.boundaryId === boundaryId);
      rows.sort((a, b) => b.timestamp - a.timestamp);
      return rows.slice(0, limit);
    }
    if (type === 'clear') { this.memoryFallback = []; return { cleared: true }; }
    if (type === 'count') return this.memoryFallback.length;
    throw new Error(`未知日志指令: ${type}`);
  }

  /** 写入一条日志，并通知订阅者（用于日志面板实时刷新） */
  async log(level, entry) {
    const record = { level, ...entry, timestamp: entry.timestamp || Date.now() };
    const result = await this._op('add', record);
    this.listeners.forEach((fn) => { try { fn(record); } catch {} });
    return result;
  }

  error(entry) { return this.log('error', entry); }
  warn(entry)  { return this.log('warn', entry); }
  info(entry)  { return this.log('info', entry); }

  query(filter)  { return this._op('query', filter); }
  clear()        { return this._op('clear'); }
  count()        { return this._op('count'); }

  onLog(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

export const logClient = new LogClient();
