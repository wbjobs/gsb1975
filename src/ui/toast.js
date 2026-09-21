/** 轻量 toast 通知：异常发生时给用户即时反馈 */
let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  document.body.appendChild(host);
  return host;
}

export function toast(message, type = 'info', duration = 4000) {
  const container = ensureHost();
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.setAttribute('role', 'status');
  item.textContent = message;

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭');
  close.addEventListener('click', () => dismiss());
  item.appendChild(close);

  container.appendChild(item);
  requestAnimationFrame(() => item.classList.add('toast-visible'));

  const timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    item.classList.remove('toast-visible');
    setTimeout(() => item.remove(), 200);
  }
}
