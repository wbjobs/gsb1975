# 组件级错误边界（Error Boundary）

零依赖实现：自定义错误边界 + IndexedDB + Web Worker，提供 **边界隔离 / 降级 UI / 重试 / 日志 / 异常提示** 完整链路。

## 运行

```bash
npm start          # 启动零依赖静态服务器（Web Worker 需要 http 环境）
# 打开 http://localhost:5173
npm test           # 运行纯逻辑单元测试（node:test）
```

## 架构

```
src/
├── core/
│   ├── component.js       组件基类（render/mount/unmount）
│   ├── errorBoundary.js   错误边界：捕获 → 日志 → 提示 → 降级 UI → 重试
│   ├── retry.js           指数退避 / 重试上限（纯函数，可单测）
│   └── errors.js          错误归一化 + BoundaryError
├── logging/
│   ├── logClient.js       主线程日志客户端（三级降级）
│   └── logWorker.js       Web Worker：IndexedDB 读写（不阻塞 UI）
├── ui/
│   ├── fallback.js        降级 UI（错误摘要/堆栈/重试/重置）
│   ├── toast.js           异常提示
│   └── logViewer.js       日志查询面板（筛选/刷新/清空/导出）
└── demo/                  演示组件（事件异常 / 异步异常 / 必崩 / 瞬时故障）
```

## 验收标准对照

| 标准 | 实现 |
| --- | --- |
| 组件崩溃不影响全局 | 每个组件挂在独立 `ErrorBoundary` 容器内，异常在边界内捕获，只替换自身 DOM；`window.error/unhandledrejection` 仅做兜底记录 |
| 降级 UI 可用 | 崩溃后边界内渲染 `fallback.js`：错误摘要、可展开堆栈、重试/重置按钮 |
| 重试正确 | 指数退避（500ms×2ⁿ），最多 3 次；恢复后计数清零；用尽后可人工重置；瞬时故障组件（C 卡片）第 3 次自动恢复 |
| 日志可查 | 日志经 Web Worker 写入 IndexedDB（`error-boundary-logs`），面板支持级别筛选/刷新/清空/导出 JSON |
| 异常有提示 | 每次异常弹出 toast；全局未捕获异常同样提示并落库 |

## 日志通道降级策略

`logClient` 依次降级：**Web Worker + IndexedDB → 主线程直连 IndexedDB → 内存环形缓冲（500 条）**，保证任何环境下日志不丢、可查。面板右上角显示当前存储通道。

## 错误捕获范围

- `render` / 生命周期同步异常（try/catch）
- 事件回调异常（`boundary.wrapHandler(fn)`）
- 异步异常（`boundary.runAsync(promise)`）
- 子树资源加载失败（容器捕获阶段监听 `error` 事件）
- 全局兜底（`window.onerror` / `unhandledrejection`）
