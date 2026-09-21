import { Component } from '../core/component.js';

/** 演示组件：计数器。可分别触发「渲染崩溃」「事件异常」「异步异常」 */
export class CounterCard extends Component {
  constructor(props) {
    super(props);
    this.count = 0;
    this.boundary = props.boundary; // 由外部注入，用于包装回调/异步任务
  }

  render() {
    if (this.props.crashOnRender) {
      throw new Error('渲染阶段故意抛错（模拟组件崩溃）');
    }
    const root = document.createElement('div');
    root.className = 'card';
    root.innerHTML = `
      <h3>${this.props.title}</h3>
      <p class="count">计数：<strong data-role="count">${this.count}</strong></p>
      <div class="card-actions">
        <button class="btn" data-role="inc">+1</button>
        <button class="btn btn-warn" data-role="crash-event">事件异常</button>
        <button class="btn btn-warn" data-role="crash-async">异步异常</button>
      </div>
    `;
    root.querySelector('[data-role="inc"]').addEventListener('click',
      this.boundary.wrapHandler(() => {
        this.count += 1;
        root.querySelector('[data-role="count"]').textContent = String(this.count);
      }));
    root.querySelector('[data-role="crash-event"]').addEventListener('click',
      this.boundary.wrapHandler(() => {
        throw new Error('事件回调中故意抛错');
      }));
    root.querySelector('[data-role="crash-async"]').addEventListener('click',
      this.boundary.wrapHandler(() => {
        this.boundary.runAsync(async () => {
          await new Promise((r) => setTimeout(r, 300));
          throw new Error('异步任务中故意 reject');
        }).catch(() => {});
      }));
    return root;
  }
}

/** 演示组件：数据列表。首次渲染崩溃、重试后恢复（模拟瞬时故障） */
export class FlakyList extends Component {
  static attempts = 0;

  render() {
    FlakyList.attempts += 1;
    // 前 2 次渲染失败，第 3 次成功 —— 验证「重试正确」
    if (FlakyList.attempts <= 2) {
      throw new Error(`模拟瞬时故障（第 ${FlakyList.attempts} 次加载失败）`);
    }
    const root = document.createElement('div');
    root.className = 'card';
    const items = ['订单 #1001', '订单 #1002', '订单 #1003'];
    root.innerHTML = `
      <h3>${this.props.title}</h3>
      <ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>
      <p class="ok">第 ${FlakyList.attempts} 次尝试加载成功</p>
    `;
    return root;
  }
}
