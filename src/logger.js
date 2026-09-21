/**
 * 日志门面（主线程）
 * 将日志投递给 Web Worker 异步写入 IndexedDB；
 * Worker 不可用时降级为 console 输出 + 内存缓冲，保证日志不丢。
 */

const memoryBuffer = [];
let worker = null;
let workerReady = false;
const pending = [];

try {
  worker = new Worker(new URL('./log-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type === 'ready') {
      workerReady = true;
      for (const entry of pending.splice(0)) worker.postMessage({ type: 'log', payload: entry });
    } else if (msg.type === 'error') {
      console.error('[logger] worker 写入失败:', msg.message);
    }
  };
  worker.onerror = (err) => {
    console.error('[logger] worker 异常，降级为 console 输出', err);
    worker = null;
  };
  worker.postMessage({ type: 'ready?' });
} catch (err) {
  console.error('[logger] 无法创建 Worker，降级为 console 输出', err);
  worker = null;
}

/**
 * 写一条结构化日志。
 * @param {'error'|'warn'|'info'} level
 * @param {{ component?: string, message: string, stack?: string, extra?: object }} data
 */
export function log(level, data) {
  const entry = {
    ts: Date.now(),
    level,
    component: data.component || 'global',
    message: String(data.message),
    stack: data.stack || '',
    extra: data.extra ? JSON.parse(JSON.stringify(data.extra)) : null,
    userAgent: navigator.userAgent,
    url: location.href,
  };
  if (worker) {
    if (workerReady) worker.postMessage({ type: 'log', payload: entry });
    else pending.push(entry);
  } else {
    memoryBuffer.push(entry);
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[logger]', entry);
  }
}

export const logError = (data) => log('error', data);
export const logWarn = (data) => log('warn', data);
export const logInfo = (data) => log('info', data);
