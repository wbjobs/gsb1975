/** 指数退避延迟：base * 2^attempt（纯函数，便于测试） */
export function backoffDelay(baseDelay, attempt) {
  if (attempt < 0) throw new RangeError('attempt 不能为负数');
  return baseDelay * Math.pow(2, attempt);
}

/** 是否还有剩余重试次数 */
export function canRetry(retryCount, maxRetries) {
  return retryCount < maxRetries;
}
