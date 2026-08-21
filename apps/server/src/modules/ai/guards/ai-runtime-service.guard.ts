/**
 * 本文件校验 BFF Agent Runtime 的服务身份，防止浏览器直接调用执行写入接口。
 */

import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** BFF 与 NestJS 约定的服务身份请求头。 */
export const AI_RUNTIME_SERVICE_HEADER = 'x-ai-runtime-service-secret';
/** 仅用于本机开发和测试的固定回退值，生产环境必须显式覆盖。 */
const DEVELOPMENT_AI_RUNTIME_SERVICE_SECRET =
  'nextnest-ai-runtime-development-only-secret';

@Injectable()
export class AiRuntimeServiceGuard implements CanActivate {
  /** 注入环境配置以读取只存在于服务端的共享密钥。 */
  constructor(private readonly configService: ConfigService) {}

  /** 使用常量时间比较验证 BFF 服务身份。 */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const received = request.header(AI_RUNTIME_SERVICE_HEADER);
    const expected = this.resolveExpectedSecret();

    if (!received || !this.matches(received, expected)) {
      throw new ForbiddenException('AI 执行器服务身份无效');
    }

    return true;
  }

  /** 生产环境只接受显式密钥，开发和测试允许固定本机回退。 */
  private resolveExpectedSecret(): string {
    const configured = this.configService.get<string>(
      'AI_RUNTIME_SERVICE_SECRET',
    );

    if (configured) {
      return configured;
    }

    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('AI 执行器服务身份尚未配置');
    }

    return DEVELOPMENT_AI_RUNTIME_SERVICE_SECRET;
  }

  /** 对长度相同的密钥执行常量时间比较。 */
  private matches(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  }
}
