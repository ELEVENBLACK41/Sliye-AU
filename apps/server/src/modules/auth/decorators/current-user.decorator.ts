import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, AuthUserResponse } from '../types/auth.types';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUserResponse | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!data) {
      return request.user;
    }

    return request.user?.[data];
  },
);
