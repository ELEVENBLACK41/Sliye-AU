import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, AuthUserResponse } from '../types/auth.types';

export const CurrentUser = createParamDecorator(
  // 从请求上下文中取出当前用户或指定用户字段。
  (data: keyof AuthUserResponse | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!data) {
      return request.user;
    }

    return request.user?.[data];
  },
);
