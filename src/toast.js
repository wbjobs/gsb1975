/**
 * 全局异常提示（Toast）
 */

const container = () => document.getElementById('toast-container');

/**
 * @param {string} message
 * @param {'error'|'warn'|'success'|'info'} [type='info']
 * @param {number} [duration=4000]
 */
export function showToast(message, type = 'info', duration = 4000) {
  const root = container();
  if (!root) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', () => dismiss());
  toast.appendChild(close);
  root.appendChild(toast);

  let timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    toast.classList.add('toast-leave');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }
}
