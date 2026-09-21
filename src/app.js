/**
 * 演示应用：多个组件各自包裹独立错误边界，验证
 *  1) 组件崩溃不影响全局  2) 降级 UI 可用  3) 重试正确
 *  4) 日志可查（IndexedDB） 5) 异常有提示（Toast）
 */

import { ErrorBoundary } from './error-boundary.js';
import { queryLogs, clearLogs } from './log-store.js';
import { logError, logInfo } from './logger.js';
import { showToast } from './toast.js';

/* ---------------- 全局兜底：边界之外的异常也记录并提示 ---------------- */
window.addEventListener('error', (event) => {
  logError({
    component: 'global',
    message: event.message || '全局未捕获异常',
    stack: event.error ? event.error.stack : '',
  });
  showToast(`全局异常：${event.message}`, 'error');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  logError({ component: 'global', message: `未处理的 Promise 拒绝: ${reason.message}`, stack: reason.stack });
  showToast(`未处理的 Promise 拒绝：${reason.message}`, 'error');
});

/* ---------------- 示例组件 ---------------- */

/** 正常组件：计数器 */
function renderCounter(host, ctx) {
  let count = 0;
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `<h3>计数器（正常组件）</h3><p class="count">0</p>`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '+1';
  ctx.on(btn, 'click', () => {
    count += 1;
    wrap.querySelector('.count').textContent = String(count);
  });
  wrap.appendChild(btn);
  host.appendChild(wrap);
}

/** 不稳定组件：前 2 次渲染抛错，第 3 次起成功 —— 用于验证重试 */
let flakyAttempts = 0;
function renderFlaky(host) {
  flakyAttempts += 1;
  if (flakyAttempts <= 2) {
    throw new Error(`模拟加载失败（第 ${flakyAttempts} 次尝试）`);
  }
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `<h3>不稳定组件</h3><p>✅ 第 ${flakyAttempts} 次尝试成功，数据加载完成。</p>`;
  host.appendChild(wrap);
}

/** 必崩组件：渲染即抛错 —— 用于验证降级 UI 与重试上限 */
function renderAlwaysCrash() {
  throw new Error('模拟渲染崩溃：数据格式非法');
}

/** 异步异常组件：渲染成功，但点击按钮触发异步异常 —— 验证运行时错误捕获 */
function renderAsyncCrash(host, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `<h3>异步异常组件</h3><p>点击按钮模拟异步任务失败。</p>`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '触发异步异常';
  ctx.on(btn, 'click', async () => {
    await new Promise((r) => setTimeout(r, 300));
    throw new Error('模拟异步任务失败：网络超时');
  });
  wrap.appendChild(btn);
  host.appendChild(wrap);
}

/* ---------------- 挂载：每个组件一个独立边界 ---------------- */

const grid = document.getElementById('component-grid');

const boundaries = [
  new ErrorBoundary({ name: '计数器', render: renderCounter }),
  new ErrorBoundary({ name: '不稳定组件', render: renderFlaky, maxRetries: 3, retryDelay: 600 }),
  new ErrorBoundary({ name: '必崩组件', render: renderAlwaysCrash, maxRetries: 2, retryDelay: 500 }),
  new ErrorBoundary({ name: '异步异常组件', render: renderAsyncCrash }),
];
boundaries.forEach((b) => b.mount(grid));

logInfo({ component: 'app', message: '应用启动，4 个组件边界已挂载' });

/* ---------------- 日志查看器 ---------------- */

const viewer = document.getElementById('log-viewer');
const levelFilter = document.getElementById('log-level-filter');
const keywordInput = document.getElementById('log-keyword');

async function refreshLogs() {
  try {
    const rows = await queryLogs({
      level: levelFilter.value,
      keyword: keywordInput.value,
    });
    if (rows.length === 0) {
      viewer.innerHTML = '<p class="log-empty">暂无日志</p>';
      return;
    }
    viewer.innerHTML = '';
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = `log-item log-${row.level}`;
      const time = new Date(row.ts).toLocaleTimeString('zh-CN', { hour12: false });
      item.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-level">${row.level}</span>
        <span class="log-component">[${row.component}]</span>
        <span class="log-message"></span>
      `;
      item.querySelector('.log-message').textContent = row.message;
      if (row.stack) {
        const detail = document.createElement('details');
        detail.innerHTML = '<summary>堆栈</summary>';
        const pre = document.createElement('pre');
        pre.textContent = row.stack;
        detail.appendChild(pre);
        item.appendChild(detail);
      }
      viewer.appendChild(item);
    }
  } catch (err) {
    viewer.innerHTML = `<p class="log-empty">日志读取失败：${err.message}</p>`;
  }
}

document.getElementById('log-refresh').addEventListener('click', refreshLogs);
levelFilter.addEventListener('change', refreshLogs);
keywordInput.addEventListener('input', refreshLogs);
document.getElementById('log-clear').addEventListener('click', async () => {
  await clearLogs();
  showToast('日志已清空', 'info');
  refreshLogs();
});

// Worker 写入是异步的，轮询保持简单可靠
setInterval(refreshLogs, 2000);
refreshLogs();
