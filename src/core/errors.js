/** 归一化任意 thrown 值为结构化错误信息 */
export function normalizeError(raw) {
  if (raw instanceof Error) {
    return { name: raw.name, message: raw.message, stack: raw.stack || '' };
  }
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return { name: raw.name || 'Error', message: String(raw.message), stack: raw.stack || '' };
  }
  return { name: 'NonErrorThrow', message: String(raw), stack: '' };
}

/** 组件渲染/生命周期抛错时，用 BoundaryError 包裹，便于日志区分来源 */
export class BoundaryError extends Error {
  constructor(boundaryId, phase, cause) {
    const info = normalizeError(cause);
    super(`[${boundaryId}] ${phase} 阶段出错: ${info.message}`);
    this.name = 'BoundaryError';
    this.boundaryId = boundaryId;
    this.phase = phase;
    this.cause = cause;
    this.stack = info.stack || this.stack;
  }
}
