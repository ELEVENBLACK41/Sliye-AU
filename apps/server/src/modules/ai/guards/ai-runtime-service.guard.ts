/**
 * 本文件保护只允许内部 Agent Runtime 调用的执行接口。
 * 这些接口不属于浏览器 API：它们可以领取 Run、写入事件、执行工具和收敛终态，
 * 因此必须由只有 Next.js 服务端持有的共享密钥保护，且未配置密钥时一律拒绝（fail closed）。
 */

import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { ServerEnvConfig } from '../../../config/env.config';

/** Runtime 调用内部执行接口时携带共享密钥的请求头名称。 */
export const AI_RUNTIME_SERVICE_TOKEN_HEADER = 'x-ai-runtime-token';

@Injectable()
export class AiRuntimeServiceGuard implements CanActivate {
  /** 注入配置服务，密钥只从服务端环境变量读取，不接受请求参数覆盖。 */
  constructor(
    private readonly configService: ConfigService<ServerEnvConfig, true>,
  ) {}

  /** 校验请求头中的共享密钥是否与服务端配置一致。 */
  canActivate(context: ExecutionContext): boolean {
    const configuredToken = this.configService.get<string | undefined>(
      'AI_RUNTIME_SERVICE_TOKEN',
      { infer: true },
    );
    if (!configuredToken) {
      throw this.createUnauthorizedException(
        '内部执行接口只允许 AI Runtime 调用',
      );
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const presentedToken = request.headers[AI_RUNTIME_SERVICE_TOKEN_HEADER];
    if (
      typeof presentedToken !== 'string' ||
      !this.isSameToken(presentedToken, configuredToken)
    ) {
      throw this.createUnauthorizedException(
        '内部执行接口只允许 AI Runtime 调用',
      );
    }

    return true;
  }

  /** 使用定长比较避免通过响应耗时逐字节猜测密钥。 */
  private isSameToken(presented: string, configured: string): boolean {
    const presentedBuffer = Buffer.from(presented, 'utf8');
    const configuredBuffer = Buffer.from(configured, 'utf8');
    if (presentedBuffer.length !== configuredBuffer.length) {
      return false;
    }

    return timingSafeEqual(presentedBuffer, configuredBuffer);
  }

  /** 创建不区分“密钥错误”和“未配置密钥”的统一拒绝，避免泄漏服务端配置状态。 */
  private createUnauthorizedException(message: string): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_RUNTIME_SERVICE_UNAUTHORIZED,
      message,
      status: HttpStatus.UNAUTHORIZED,
    });
  }
}
