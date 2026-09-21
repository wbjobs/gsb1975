/**
 * 极简组件基类：为「组件级错误边界」提供可挂载/卸载的组件抽象。
 * 组件只需实现 render() 返回 HTMLElement，可选实现 onMount / onUnmount。
 */
export class Component {
  constructor(props = {}) {
    this.props = props;
    this.el = null;
    this.mounted = false;
  }

  /** 子类实现：返回本组件的根元素 */
  render() {
    throw new Error('Component.render() 必须由子类实现');
  }

  mount() {
    this.el = this.render();
    this.mounted = true;
    if (typeof this.onMount === 'function') this.onMount();
    return this.el;
  }

  unmount() {
    if (typeof this.onUnmount === 'function') this.onUnmount();
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
    this.mounted = false;
  }
}
