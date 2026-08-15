/*
 * @Description: 从 HTTP 请求中读取当前认证用户的实时授权上下文。
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthorizationContext } from '../types/auth.types';
import type { AuthenticatedRequest } from '../types/auth.types';
import { throwMissingAuthorizationContext } from '../services/authorization.service';

/** 将全局认证守卫生成的授权上下文注入控制器参数。 */
export const CurrentAuthorization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthorizationContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.authorization ?? throwMissingAuthorizationContext();
  },
);
