/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 接口权限声明装饰器，用权限码描述当前路由需要的访问能力
 * @Copyright: Copyright 1990 - 2026
 */
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_METADATA_KEY = 'required_permissions';

// 声明当前接口需要拥有的权限码，默认需要全部满足。
export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, permissions);
}
