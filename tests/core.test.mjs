import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeError, BoundaryError } from '../src/core/errors.js';
import { backoffDelay, canRetry } from '../src/core/retry.js';

test('normalizeError: Error 实例', () => {
  const info = normalizeError(new TypeError('boom'));
  assert.equal(info.name, 'TypeError');
  assert.equal(info.message, 'boom');
  assert.ok(info.stack.includes('boom'));
});

test('normalizeError: 非 Error 抛出值', () => {
  assert.deepEqual(normalizeError('字符串错误').name, 'NonErrorThrow');
  assert.equal(normalizeError('字符串错误').message, '字符串错误');
  assert.equal(normalizeError({ message: 'obj' }).message, 'obj');
  assert.equal(normalizeError(undefined).message, 'undefined');
});

test('BoundaryError: 包装边界与阶段信息', () => {
  const err = new BoundaryError('报表B', 'render', new Error('渲染失败'));
  assert.equal(err.name, 'BoundaryError');
  assert.equal(err.boundaryId, '报表B');
  assert.equal(err.phase, 'render');
  assert.ok(err.message.includes('报表B'));
  assert.ok(err.message.includes('渲染失败'));
});

test('backoffDelay: 指数退避 500/1000/2000/4000', () => {
  assert.equal(backoffDelay(500, 0), 500);
  assert.equal(backoffDelay(500, 1), 1000);
  assert.equal(backoffDelay(500, 2), 2000);
  assert.equal(backoffDelay(500, 3), 4000);
  assert.throws(() => backoffDelay(500, -1), RangeError);
});

test('canRetry: 重试次数上限判断', () => {
  assert.equal(canRetry(0, 3), true);
  assert.equal(canRetry(2, 3), true);
  assert.equal(canRetry(3, 3), false);
});
