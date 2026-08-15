/*
 * @Description: 全局权限码守卫，校验接口声明的类型安全系统权限。
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  REQUIRED_PERMISSIONS_METADATA_KEY,
  type RequiredPermissionsMetadata,
} from '../decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../types/auth.types';
import {
  AuthorizationService,
  throwMissingAuthorizationContext,
} from '../services/authorization.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  /** 注入反射器和统一授权服务。 */
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 校验当前用户是否满足接口声明的 ALL 或 ANY 权限规则。 */
  canActivate(context: ExecutionContext): boolean {
    const requirement =
      this.reflector.getAllAndOverride<RequiredPermissionsMetadata>(
        REQUIRED_PERMISSIONS_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requirement || requirement.permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization =
      request.authorization ?? throwMissingAuthorizationContext();
    const allowed =
      requirement.mode === 'ANY'
        ? this.authorizationService.hasAnyPermission(
            authorization,
            requirement.permissions,
          )
        : this.authorizationService.hasAllPermissions(
            authorization,
            requirement.permissions,
          );

    if (!allowed) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_PERMISSION_DENIED,
        message: '当前账号没有访问该接口的权限',
        status: 403,
      });
    }

    return true;
  }
}
