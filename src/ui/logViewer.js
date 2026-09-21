import { logClient } from '../logging/logClient.js';

/** 日志查询面板：从 IndexedDB（经 Web Worker）读取错误日志，支持筛选/刷新/清空/导出 */
export class LogViewer {
  constructor() {
    this.el = null;
    this.levelFilter = '';
    this.unsubscribe = null;
  }

  mount() {
    this.el = document.createElement('section');
    this.el.className = 'log-viewer';
    this.el.innerHTML = `
      <header class="log-header">
        <h2>错误日志（IndexedDB）</h2>
        <div class="log-toolbar">
          <select data-role="level">
            <option value="">全部级别</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </select>
          <button class="btn btn-secondary" data-role="refresh">刷新</button>
          <button class="btn btn-secondary" data-role="export">导出 JSON</button>
          <button class="btn btn-danger" data-role="clear">清空日志</button>
          <span class="log-mode" data-role="mode"></span>
        </div>
      </header>
      <div class="log-list" data-role="list"></div>
    `;
    this.el.querySelector('[data-role="level"]').addEventListener('change', (e) => {
      this.levelFilter = e.target.value;
      this.refresh();
    });
    this.el.querySelector('[data-role="refresh"]').addEventListener('click', () => this.refresh());
    this.el.querySelector('[data-role="clear"]').addEventListener('click', async () => {
      await logClient.clear();
      this.refresh();
    });
    this.el.querySelector('[data-role="export"]').addEventListener('click', () => this.exportJSON());

    this.unsubscribe = logClient.onLog(() => this.refresh());
    this.refresh();
    return this.el;
  }

  async refresh() {
    const list = this.el.querySelector('[data-role="list"]');
    const modeEl = this.el.querySelector('[data-role="mode"]');
    modeEl.textContent = `存储通道: ${logClient.mode}`;
    let rows = [];
    try {
      rows = await logClient.query({ level: this.levelFilter || undefined, limit: 100 });
    } catch (err) {
      list.innerHTML = `<p class="log-empty">日志读取失败：${err.message}</p>`;
      return;
    }
    if (!rows.length) {
      list.innerHTML = '<p class="log-empty">暂无日志</p>';
      return;
    }
    list.replaceChildren(...rows.map((r) => this._row(r)));
  }

  _row(r) {
    const item = document.createElement('div');
    item.className = `log-item log-${r.level}`;
    const time = new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    item.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-level">${r.level}</span>
      <span class="log-boundary">${r.boundaryId || '-'}</span>
      <span class="log-msg"></span>
    `;
    item.querySelector('.log-msg').textContent = r.message;
    if (r.stack) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '堆栈';
      const pre = document.createElement('pre');
      pre.textContent = r.stack;
      details.append(summary, pre);
      item.appendChild(details);
    }
    return item;
  }

  async exportJSON() {
    const rows = await logClient.query({ level: this.levelFilter || undefined, limit: 1000 });
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `error-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
  }
}
