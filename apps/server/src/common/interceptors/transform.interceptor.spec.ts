/**
 * API 成功响应转换拦截器单元测试。
 */

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { API_SUCCESS_CODE } from '@workspace/contracts/common';
import type { Response } from 'express';
import { firstValueFrom, of } from 'rxjs';
import type { RequestWithContext } from '../request-context/request-context';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  it('应包装真实业务数据并在响应头和响应体中写入同一 requestId', async () => {
    const headers: Record<string, string> = {};
    const requestDouble = {
      headers: { 'x-request-id': 'web-request-001' },
    } as unknown as RequestWithContext;
    const responseDouble = {
      setHeader(
        name: string,
        value: string | number | readonly string[],
      ): void {
        headers[name] = String(value);
      },
    } as unknown as Response;
    const contextDouble = {
      switchToHttp: () => ({
        getRequest: () => requestDouble,
        getResponse: () => responseDouble,
      }),
    } as unknown as ExecutionContext;
    const nextDouble: CallHandler<{ id: number }> = {
      handle: () => of({ id: 1 }),
    };

    const result = await firstValueFrom(
      new TransformInterceptor<{ id: number }>().intercept(
        contextDouble,
        nextDouble,
      ),
    );

    expect(result).toMatchObject({
      success: true,
      code: API_SUCCESS_CODE,
      message: '请求成功',
      data: { id: 1 },
      requestId: 'web-request-001',
    });
    expect(typeof result.timestamp).toBe('number');
    expect(headers['x-request-id']).toBe('web-request-001');
  });
});
