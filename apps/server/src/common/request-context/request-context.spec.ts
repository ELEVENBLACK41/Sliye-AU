/**
 * HTTP requestId 与异步请求上下文工具单元测试。
 */

import type { Response } from 'express';
import {
  ensureRequestId,
  getCurrentRequestId,
  normalizeRequestId,
  runWithRequestContext,
  type RequestWithContext,
} from './request-context';

describe('request-context', () => {
  it('应接受安全 requestId 并拒绝超长或包含控制字符的值', () => {
    expect(normalizeRequestId('safe.request_01-test')).toBe(
      'safe.request_01-test',
    );
    expect(normalizeRequestId('unsafe\nrequest')).toBeUndefined();
    expect(normalizeRequestId('a'.repeat(65))).toBeUndefined();
  });

  it('应为无效上游 requestId 生成新值并同步写入请求与响应头', () => {
    const headers: Record<string, string> = {};
    const request = {
      headers: { 'x-request-id': 'unsafe request id' },
    } as unknown as RequestWithContext;
    const response = {
      setHeader(
        name: string,
        value: string | number | readonly string[],
      ): void {
        headers[name] = String(value);
      },
    } as unknown as Response;

    const requestId = ensureRequestId(request, response);

    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(request.requestId).toBe(requestId);
    expect(headers['x-request-id']).toBe(requestId);
  });

  it('应在同一异步调用链中读取当前 requestId', async () => {
    const requestId = await runWithRequestContext(
      { requestId: 'async-request-001' },
      async () => {
        await Promise.resolve();
        return getCurrentRequestId();
      },
    );

    expect(requestId).toBe('async-request-001');
    expect(getCurrentRequestId()).toBeUndefined();
  });
});
