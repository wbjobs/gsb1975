import { normalizeError } from '../core/errors.js';

/**
 * 降级 UI：组件崩溃后在边界容器内渲染的可操作占位界面。
 * 提供：错误摘要、可展开堆栈、重试按钮（含剩余次数）、重置按钮。
 */
export function renderFallback({ name, error, retryCount, maxRetries, canRetry, onRetry, onReset }) {
  const info = normalizeError(error && (error.cause || error));
  const root = document.createElement('div');
  root.className = 'fallback-ui';
  root.setAttribute('role', 'alert');

  const icon = document.createElement('div');
  icon.className = 'fallback-icon';
  icon.textContent = '⚠';

  const title = document.createElement('h3');
  title.textContent = `「${name}」暂时不可用`;

  const desc = document.createElement('p');
  desc.className = 'fallback-message';
  desc.textContent = info.message || '未知错误';

  const details = document.createElement('details');
  details.className = 'fallback-stack';
  const summary = document.createElement('summary');
  summary.textContent = '查看错误详情';
  const pre = document.createElement('pre');
  pre.textContent = info.stack || `${info.name}: ${info.message}`;
  details.append(summary, pre);

  const actions = document.createElement('div');
  actions.className = 'fallback-actions';

  if (canRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.textContent = `重试（剩余 ${maxRetries - retryCount} 次）`;
    retryBtn.addEventListener('click', () => {
      retryBtn.disabled = true;
      retryBtn.textContent = '重试中…';
      onRetry();
    });
    actions.appendChild(retryBtn);
  } else {
    const exhausted = document.createElement('span');
    exhausted.className = 'fallback-exhausted';
    exhausted.textContent = `已自动重试 ${maxRetries} 次仍未恢复`;
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary';
    resetBtn.textContent = '重置组件';
    resetBtn.addEventListener('click', onReset);
    actions.append(exhausted, resetBtn);
  }

  root.append(icon, title, desc, details, actions);
  return root;
}
