# 组件级错误边界（自定义边界 + IndexedDB + Web Worker）

零依赖、框架无关的组件级错误边界方案，纯原生 ES Module 实现。

## 运行

需要通过 HTTP 访问（Web Worker 与 ES Module 不支持 `file://`）：

```bash
npx serve .          # 或
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`。

## 架构

| 文件 | 职责 |
| --- | --- |
| `src/error-boundary.js` | 自定义错误边界：捕获渲染/运行时/异步异常，渲染降级 UI，提供重试与重置 |
| `src/logger.js` | 日志门面：把结构化日志投递给 Web Worker，Worker 不可用时降级为 console + 内存缓冲 |
| `src/log-worker.js` | Web Worker：在独立线程将日志写入 IndexedDB，不阻塞主线程渲染 |
| `src/log-store.js` | 日志查询层：级别过滤 + 关键字搜索 + 清空 |
| `src/toast.js` | 全局异常 Toast 提示 |
| `src/app.js` | 演示：4 个独立边界组件 + 全局兜底 + 日志查看器 |

## 验收标准对照

| 标准 | 实现与验证方式 |
| --- | --- |
| 组件崩溃不影响全局 | 每个组件包裹独立 `ErrorBoundary`，错误在边界内捕获并 `stopPropagation`；「必崩组件」崩溃时计数器等其它组件照常工作 |
| 降级 UI 可用 | 崩溃后渲染可交互 fallback：显示错误信息 + 重试/重置按钮，支持 `fallback` 选项完全自定义 |
| 重试正确 | `retry()` 带次数上限（`maxRetries`）与递增延迟（`retryDelay * 次数`）；「不稳定组件」前 2 次失败、第 3 次成功，可观察重试后自动恢复；次数用尽后禁用按钮并提示重置 |
| 日志可查 | 日志经 Web Worker 写入 IndexedDB（库 `error-boundary-logs`），页面右侧面板支持按级别过滤、关键字搜索、查看堆栈、清空 |
| 异常有提示 | 每次异常弹出 Toast（error/warn/success 分级），边界外异常由全局 `error` / `unhandledrejection` 兜底提示并记录 |

## 边界捕获范围

- 渲染期同步异常（`render` 抛错）
- 渲染期异步异常（`async render` reject）
- 组件事件回调异常（通过 `ctx.on(el, type, fn)` 注册，同步抛错与 Promise 拒绝都会被捕获）

> 说明：浏览器中事件回调内的异常只会触发 window 级 `error` 事件，无法按 DOM 子树可靠归因，
> 因此组件内回调统一经 `ctx.on` / `ctx.wrap` 包装，实现真正的组件级隔离；
> 边界之外的异常由 `src/app.js` 中的全局兜底记录并提示。

## 使用示例

```js
import { ErrorBoundary } from './src/error-boundary.js';

new ErrorBoundary({
  name: '用户卡片',
  render: (host, ctx) => {
    // 渲染逻辑，抛错即进入降级 UI
    // ctx.on(el, 'click', handler) 注册受边界保护的事件回调
  },
  maxRetries: 3,     // 最大重试次数
  retryDelay: 800,   // 重试基础延迟（随次数递增）
  fallback: ({ error, retry, reset, retriesLeft }) => { /* 自定义降级 UI */ },
  onError: (error) => { /* 上报等额外逻辑 */ },
}).mount(document.getElementById('app'));
```
