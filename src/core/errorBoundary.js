import { normalizeError, BoundaryError } from './errors.js';
import { backoffDelay, canRetry } from './retry.js';
import { logClient } from '../logging/logClient.js';
import { renderFallback } from '../ui/fallback.js';
import { toast } from '../ui/toast.js';

let boundarySeq = 0;

/**
 * 组件级错误边界：
 *  - 捕获子组件 render / 生命周期 / 事件回调 / 异步任务中的异常
 *  - 崩溃只影响自身容器，渲染降级 UI，不影响页面其它区域
 *  - 支持有限次数自动/手动重试（指数退避），可手动重置
 *  - 所有异常写入 IndexedDB 日志并弹出提示
 */
export class ErrorBoundary {
  /**
   * @param {object} options
   * @param {() => import('./component.js').Component} options.factory 组件工厂（重试时重新实例化）
   * @param {string} [options.name] 边界名称，用于日志与降级 UI 展示
   * @param {number} [options.maxRetries] 最大重试次数，默认 3
   * @param {number} [options.baseDelay] 退避基数 ms，默认 500（实际延迟 = base * 2^n）
   * @param {(err: BoundaryError) => void} [options.onError] 额外错误回调
   */
  constructor(options) {
    if (!options || typeof options.factory !== 'function') {
      throw new Error('ErrorBoundary 需要 options.factory');
    }
    this.id = `boundary-${++boundarySeq}`;
    this.name = options.name || this.id;
    this.factory = options.factory;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 500;
    this.onError = options.onError;

    this.container = null;
    this.child = null;
    this.error = null;
    this.retryCount = 0;
    this.retryTimer = null;
    this.destroyed = false;
  }

  mount(parentEl) {
    this.container = document.createElement('div');
    this.container.className = 'error-boundary';
    this.container.dataset.boundaryId = this.id;
    // 捕获阶段监听子树资源加载错误（img/script 等），一并纳入边界处理
    this.container.addEventListener('error', (e) => {
      this.captureError(new Error(`资源加载失败: ${(e.target && (e.target.src || e.target.href)) || e.type}`), 'resource');
    }, true);
    parentEl.appendChild(this.container);
    this._renderChild();
    return this.container;
  }

  _renderChild() {
    this._clearRetryTimer();
    this.error = null;
    try {
      this.child = this.factory();
      const el = this.child.mount();
      this.container.replaceChildren(el);
    } catch (raw) {
      this._handleFailure(raw, 'render');
    }
  }

  _handleFailure(raw, phase) {
    // 子组件挂载一半失败时尽量清理，避免泄漏
    if (this.child) {
      try { this.child.unmount(); } catch {}
    }
    const err = raw instanceof BoundaryError ? raw : new BoundaryError(this.name, phase, raw);
    this.error = err;

    // 1) 日志（异步落 IndexedDB，不阻塞降级渲染）
    logClient.error({
      boundaryId: this.name,
      phase,
      message: err.message,
      stack: err.stack || '',
      retryCount: this.retryCount,
      url: location.href,
      userAgent: navigator.userAgent,
    }).catch(() => {});

    // 2) 异常提示
    toast(`组件「${this.name}」发生异常：${normalizeError(err.cause || err).message}`, 'error');

    // 3) 外部回调
    if (this.onError) { try { this.onError(err); } catch {} }

    // 4) 降级 UI（崩溃被限制在本容器内）
    this._renderFallback();
  }

  _renderFallback() {
    if (!this.container) return;
    const node = renderFallback({
      name: this.name,
      error: this.error,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      canRetry: canRetry(this.retryCount, this.maxRetries),
      onRetry: () => this.retry(),
      onReset: () => this.reset(),
    });
    this.container.replaceChildren(node);
  }

  /** 手动/自动重试：指数退避后重建子组件 */
  retry() {
    if (this.destroyed) return;
    if (!canRetry(this.retryCount, this.maxRetries)) return;
    const attempt = this.retryCount + 1;
    const delay = backoffDelay(this.baseDelay, this.retryCount);
    logClient.info({
      boundaryId: this.name,
      message: `第 ${attempt}/${this.maxRetries} 次重试，${delay}ms 后执行`,
    }).catch(() => {});

    this._clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryCount = attempt;
      if (this.error) {
        // 重试中提示
        toast(`正在重试「${this.name}」（${attempt}/${this.maxRetries}）…`, 'info');
      }
      this._renderChild();
      if (!this.error) {
        this.retryCount = 0; // 恢复成功后清零，后续故障重新计数
        logClient.info({ boundaryId: this.name, message: `第 ${attempt} 次重试成功，组件已恢复` })
          .catch(() => {});
        toast(`组件「${this.name}」已恢复`, 'success');
      }
    }, delay);
  }

  /** 重置重试计数并立即重建（用于重试次数用完后人工介入） */
  reset() {
    this.retryCount = 0;
    logClient.warn({ boundaryId: this.name, message: '人工重置错误边界，重试计数清零' }).catch(() => {});
    this._renderChild();
  }

  /** 供子组件包裹事件回调：回调内异常会被边界捕获 */
  wrapHandler(fn) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (raw) {
        this._handleFailure(raw, 'event-handler');
      }
    };
  }

  /** 供子组件执行异步任务：reject 会被边界捕获 */
  runAsync(promiseOrFn, phase = 'async') {
    const p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn();
    return Promise.resolve(p).catch((raw) => {
      this._handleFailure(raw, phase);
      throw raw;
    });
  }

  /** 子组件可主动上报错误 */
  captureError(raw, phase = 'manual') {
    this._handleFailure(raw, phase);
  }

  _clearRetryTimer() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  destroy() {
    this.destroyed = true;
    this._clearRetryTimer();
    if (this.child) { try { this.child.unmount(); } catch {} }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
