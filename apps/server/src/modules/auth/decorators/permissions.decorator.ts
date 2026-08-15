/*
 * @Description: 类型安全的接口权限声明装饰器，供全局权限守卫读取。
 */
import { SetMetadata } from '@nestjs/common';
import type { SystemPermissionCode } from '@workspace/contracts/access';

/** 权限守卫读取的接口权限声明元数据键。 */
export const REQUIRED_PERMISSIONS_METADATA_KEY = 'required_permissions';

/** 接口要求多个权限码时采用的匹配方式。 */
export type PermissionMatchMode = 'ALL' | 'ANY';

/** 权限装饰器写入反射元数据的稳定结构。 */
export type RequiredPermissionsMetadata = {
  /** 当前接口声明的系统权限码。 */
  permissions: SystemPermissionCode[];
  /** 多个权限码之间采用全部满足还是任意满足。 */
  mode: PermissionMatchMode;
};

/** 声明当前接口需要同时拥有全部权限码。 */
export function RequirePermissions(...permissions: SystemPermissionCode[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, {
    permissions,
    mode: 'ALL',
  } satisfies RequiredPermissionsMetadata);
}

/** 声明当前接口拥有任意一个权限码即可访问。 */
export function RequireAnyPermission(...permissions: SystemPermissionCode[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, {
    permissions,
    mode: 'ANY',
  } satisfies RequiredPermissionsMetadata);
}
