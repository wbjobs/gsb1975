/**
 * 自定义组件级错误边界（零依赖，框架无关）
 *
 * 能力：
 *  - 边界：捕获渲染期同步/异步异常，以及通过 ctx.on / ctx.wrap 注册的事件回调异常
 *          （含回调返回 Promise 的拒绝），错误被限制在边界内部，不会扩散到页面其它区域。
 *  - 降级：渲染可交互的降级 UI（fallback），而不是白屏。
 *  - 重试：支持手动重试（带次数上限与递增延迟），可整体重置。
 *  - 日志：每次异常写入 IndexedDB（经 Web Worker）。
 *  - 提示：异常发生时弹出 Toast 通知用户。
 */

import { logError, logInfo, logWarn } from './logger.js';
import { showToast } from './toast.js';

export class ErrorBoundary {
  /**
   * @param {object} options
   * @param {string} options.name            组件名（用于日志与降级 UI 展示）
   * @param {(host: HTMLElement, ctx: BoundaryContext) => (void|Promise<void>)} options.render 组件渲染函数
   * @param {(ctx: {error: Error, retry: () => void, reset: () => void, retriesLeft: number}) => HTMLElement} [options.fallback] 自定义降级 UI
   * @param {number} [options.maxRetries=3]  最大重试次数
   * @param {number} [options.retryDelay=800] 重试基础延迟（ms），随次数递增
   * @param {(error: Error) => void} [options.onError] 额外错误回调
   */
  constructor({ name, render, fallback, maxRetries = 3, retryDelay = 800, onError }) {
    if (!name) throw new Error('ErrorBoundary: name 必填');
    if (typeof render !== 'function') throw new Error('ErrorBoundary: render 必须是函数');
    this.name = name;
    this.renderFn = render;
    this.fallbackFn = fallback || null;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.onError = onError || null;

    this.retryCount = 0;
    this.error = null;
    this.destroyed = false;

    this.host = null;
    // 提供给组件的上下文：注册受边界保护的事件回调
    this._ctx = {
      on: (el, type, fn, opts) => el.addEventListener(type, this._wrap(fn), opts),
      wrap: (fn) => this._wrap(fn),
    };
  }

  /** 挂载到容器元素 */
  mount(container) {
    this.host = document.createElement('div');
    this.host.className = 'error-boundary';
    this.host.dataset.boundary = this.name;
    container.appendChild(this.host);
    this._renderSafe();
    return this;
  }

  /**
   * 包装回调：同步抛错与返回 Promise 的拒绝都路由到本边界处理。
   * 浏览器中事件回调内的异常默认触发 window error 且无法按子树归因，
   * 因此组件内回调统一经 ctx.on / ctx.wrap 注册，实现真正的组件级隔离。
   */
  _wrap(fn) {
    return (...args) => {
      if (this.destroyed) return;
      try {
        const ret = fn(...args);
        if (ret && typeof ret.catch === 'function') {
          ret.catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            this._handleError(error, 'async-callback');
          });
        }
        return ret;
      } catch (err) {
        this._handleError(err instanceof Error ? err : new Error(String(err)), 'event-callback');
        return undefined;
      }
    };
  }

  async _renderSafe() {
    if (this.destroyed) return;
    this.error = null;
    this.host.classList.remove('is-crashed');
    this.host.innerHTML = '';
    try {
      await this.renderFn(this.host, this._ctx);
      if (this.retryCount > 0) {
        logInfo({ component: this.name, message: `重试成功（第 ${this.retryCount} 次后恢复）` });
        showToast(`「${this.name}」已恢复正常`, 'success');
        this.retryCount = 0;
      }
    } catch (err) {
      this._handleError(err instanceof Error ? err : new Error(String(err)), 'render');
    }
  }

  _handleError(error, phase) {
    if (this.destroyed) return;
    this.error = error;
    this.host.classList.add('is-crashed');

    logError({
      component: this.name,
      message: `[${phase}] ${error.message}`,
      stack: error.stack,
      extra: { phase, retryCount: this.retryCount, maxRetries: this.maxRetries },
    });
    showToast(`组件「${this.name}」发生异常：${error.message}`, 'error');
    if (this.onError) {
      try { this.onError(error); } catch { /* 回调异常不影响边界 */ }
    }
    this._renderFallback(error);
  }

  _renderFallback(error) {
    this.host.innerHTML = '';
    const retry = () => this.retry();
    const reset = () => this.reset();
    const retriesLeft = Math.max(0, this.maxRetries - this.retryCount);

    if (this.fallbackFn) {
      this.host.appendChild(this.fallbackFn({ error, retry, reset, retriesLeft }));
      return;
    }

    // 全部用 DOM API + textContent 构建，避免错误消息被当作 HTML 注入
    const box = document.createElement('div');
    box.className = 'fallback-ui';

    const icon = document.createElement('div');
    icon.className = 'fallback-icon';
    icon.textContent = '⚠️';

    const title = document.createElement('h3');
    title.textContent = `「${this.name}」暂时不可用`;

    const msg = document.createElement('p');
    msg.className = 'fallback-msg';
    msg.textContent = error.message;

    const hint = document.createElement('p');
    hint.className = 'fallback-hint';
    hint.textContent = '其余功能不受影响，可重试或稍后再来。';

    const actions = document.createElement('div');
    actions.className = 'fallback-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.dataset.action = 'retry';
    retryBtn.disabled = retriesLeft === 0;
    retryBtn.textContent = `重试（剩余 ${retriesLeft} 次）`;
    retryBtn.addEventListener('click', retry);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ghost';
    resetBtn.textContent = '重置组件';
    resetBtn.addEventListener('click', reset);

    actions.append(retryBtn, resetBtn);
    box.append(icon, title, msg, hint, actions);
    this.host.appendChild(box);
  }

  /** 手动重试：带次数上限与递增延迟 */
  retry() {
    if (this.destroyed || !this.error) return;
    if (this.retryCount >= this.maxRetries) {
      logWarn({ component: this.name, message: '重试次数已用尽，需重置组件' });
      showToast(`「${this.name}」重试次数已用尽，请重置组件`, 'warn');
      return;
    }
    this.retryCount += 1;
    const delay = this.retryDelay * this.retryCount;
    logInfo({
      component: this.name,
      message: `第 ${this.retryCount}/${this.maxRetries} 次重试，${delay}ms 后执行`,
    });
    const btn = this.host.querySelector('[data-action="retry"]');
    if (btn) { btn.disabled = true; btn.textContent = '重试中…'; }
    setTimeout(() => { if (!this.destroyed) this._renderSafe(); }, delay);
  }

  /** 重置：清空错误与重试计数，重新渲染 */
  reset() {
    if (this.destroyed) return;
    this.retryCount = 0;
    logInfo({ component: this.name, message: '组件被手动重置' });
    this._renderSafe();
  }

  /** 卸载边界 */
  destroy() {
    this.destroyed = true;
    if (this.host) this.host.remove();
  }
}
