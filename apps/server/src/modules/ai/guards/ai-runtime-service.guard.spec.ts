/**
 * 本文件验证内部执行接口的共享密钥守卫：未配置密钥、缺少请求头和密钥不匹配
 * 一律拒绝，只有完全一致的密钥才放行。不启动 NestJS 应用，也不发起真实请求。
 */

import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { ServerEnvConfig } from '../../../config/env.config';
import {
  AI_RUNTIME_SERVICE_TOKEN_HEADER,
  AiRuntimeServiceGuard,
} from './ai-runtime-service.guard';

/** 一个长度足够、仅供测试使用的共享密钥。 */
const CONFIGURED_TOKEN = 'a'.repeat(32);

/** 构造只包含请求头的最小执行上下文。 */
function createExecutionContext(
  headers: Record<string, string | string[] | undefined>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

/** 构造返回指定密钥的配置服务。 */
function createGuard(
  configuredToken: string | undefined,
): AiRuntimeServiceGuard {
  const configService = {
    get: jest.fn().mockReturnValue(configuredToken),
  } as unknown as ConfigService<ServerEnvConfig, true>;

  return new AiRuntimeServiceGuard(configService);
}

/** 断言调用被拒绝，且使用统一的稳定错误码。 */
function expectRuntimeUnauthorized(run: () => unknown): void {
  expect(run).toThrow(BusinessException);

  try {
    run();
    throw new Error('守卫应当拒绝该调用');
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessException);
    expect((error as BusinessException).code).toBe(
      'AI.RUNTIME_SERVICE_UNAUTHORIZED',
    );
  }
}

describe('AiRuntimeServiceGuard', () => {
  it('服务端未配置密钥时拒绝全部内部调用', () => {
    const guard = createGuard(undefined);

    expectRuntimeUnauthorized(() =>
      guard.canActivate(
        createExecutionContext({
          [AI_RUNTIME_SERVICE_TOKEN_HEADER]: CONFIGURED_TOKEN,
        }),
      ),
    );
  });

  it('缺少请求头、密钥不匹配或请求头重复时拒绝', () => {
    const guard = createGuard(CONFIGURED_TOKEN);

    expectRuntimeUnauthorized(() =>
      guard.canActivate(createExecutionContext({})),
    );
    expectRuntimeUnauthorized(() =>
      guard.canActivate(
        createExecutionContext({
          [AI_RUNTIME_SERVICE_TOKEN_HEADER]: 'b'.repeat(32),
        }),
      ),
    );
    expectRuntimeUnauthorized(() =>
      guard.canActivate(
        createExecutionContext({
          [AI_RUNTIME_SERVICE_TOKEN_HEADER]: ['array', 'value'],
        }),
      ),
    );
  });

  it('长度不同的密钥不会因为前缀相同而通过', () => {
    const guard = createGuard(CONFIGURED_TOKEN);

    expectRuntimeUnauthorized(() =>
      guard.canActivate(
        createExecutionContext({
          [AI_RUNTIME_SERVICE_TOKEN_HEADER]: 'a'.repeat(16),
        }),
      ),
    );
  });

  it('密钥完全一致时放行', () => {
    const guard = createGuard(CONFIGURED_TOKEN);

    expect(
      guard.canActivate(
        createExecutionContext({
          [AI_RUNTIME_SERVICE_TOKEN_HEADER]: CONFIGURED_TOKEN,
        }),
      ),
    ).toBe(true);
  });
});
