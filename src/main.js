import { ErrorBoundary } from './core/errorBoundary.js';
import { LogViewer } from './ui/logViewer.js';
import { logClient } from './logging/logClient.js';
import { toast } from './ui/toast.js';
import { CounterCard, FlakyList } from './demo/demoComponents.js';

const app = document.getElementById('app');

// 全局兜底：未被任何边界捕获的异常也要记录日志并提示（不影响已隔离的组件）
window.addEventListener('error', (e) => {
  logClient.error({
    boundaryId: 'global',
    phase: 'window.onerror',
    message: e.message,
    stack: (e.error && e.error.stack) || '',
    url: location.href,
  }).catch(() => {});
  toast(`未捕获异常：${e.message}`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  logClient.error({
    boundaryId: 'global',
    phase: 'unhandledrejection',
    message: String((e.reason && e.reason.message) || e.reason),
    stack: (e.reason && e.reason.stack) || '',
    url: location.href,
  }).catch(() => {});
});

app.innerHTML = `
  <h1>组件级错误边界 Demo</h1>
  <p class="hint">每个卡片都在独立的错误边界内运行：单个组件崩溃只影响自身，并提供降级 UI / 重试 / 日志。</p>
  <div class="grid" id="grid"></div>
  <div id="log-slot"></div>
`;
const grid = document.getElementById('grid');

function mountBoundary(name, factory) {
  const slot = document.createElement('div');
  slot.className = 'card-slot';
  const boundary = new ErrorBoundary({ name, factory, maxRetries: 3, baseDelay: 500 });
  boundary.mount(slot);
  grid.appendChild(slot);
  return boundary;
}

// 1) 正常组件：可手动触发事件异常 / 异步异常
let boundaryA;
boundaryA = mountBoundary('计数器 A', () => new CounterCard({ title: '计数器 A', boundary: boundaryA }));

// 2) 渲染即崩溃的组件：展示降级 UI、重试与「重试用尽后重置」
let boundaryB;
boundaryB = mountBoundary('报表 B（必崩）', () => new CounterCard({ title: '报表 B（必崩）', crashOnRender: true, boundary: boundaryB }));

// 3) 瞬时故障组件：前 2 次渲染失败，验证重试后自动恢复
mountBoundary('订单列表 C（瞬时故障）', () => new FlakyList({ title: '订单列表 C' }));

// 4) 日志面板（IndexedDB 查询）
const viewer = new LogViewer();
document.getElementById('log-slot').appendChild(viewer.mount());

logClient.info({ boundaryId: 'app', message: '应用已启动' }).catch(() => {});
