/*
 * @Description: 从 HTTP 请求中整理访问控制审计所需的客户端元数据。
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  RequestClientMeta,
} from '../types/auth.types';

/** 注入当前请求的 IP、User-Agent 与 requestId。 */
export const CurrentRequestMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestClientMeta => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return {
      ipAddress: forwardedIp || request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.requestId,
    };
  },
);
