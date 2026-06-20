import {
  PermissionEffect,
  type Permission,
  type User,
} from '../../generated/prisma';
import { AuthUserResponse } from './types/auth.types';

type AuthUserRecord = Pick<
  User,
  | 'id'
  | 'email'
  | 'name'
  | 'avatarUrl'
  | 'status'
  | 'emailVerifiedAt'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
> &
  Partial<{
    roles: Array<{
      role: {
        perms: Array<{
          perm: Pick<Permission, 'code'>;
        }>;
      };
    }>;
    permissions: Array<{
      effect: PermissionEffect;
      expiresAt: Date | null;
      permission: Pick<Permission, 'code'>;
    }>;
  }>;

// 将数据库用户记录转换为认证接口对外返回结构。
export function toAuthUserResponse(user: AuthUserRecord): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    permissions: extractEffectivePermissionCodes(user),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

// 从角色权限和用户直接授权中计算当前用户最终拥有的权限码，用户级 DENY 优先。
function extractEffectivePermissionCodes(user: AuthUserRecord): string[] {
  const now = new Date();
  const rolePermissions =
    user.roles?.flatMap((userRole) =>
      userRole.role.perms.map((rolePermission) => rolePermission.perm.code),
    ) ?? [];
  const directPermissions =
    user.permissions?.filter(
      (permission) =>
        !permission.expiresAt || permission.expiresAt.getTime() > now.getTime(),
    ) ?? [];
  const deniedCodes = new Set(
    directPermissions
      .filter((permission) => permission.effect === PermissionEffect.DENY)
      .map((permission) => permission.permission.code),
  );
  const allowedDirectCodes = directPermissions
    .filter((permission) => permission.effect === PermissionEffect.ALLOW)
    .map((permission) => permission.permission.code);

  return Array.from(new Set([...rolePermissions, ...allowedDirectCodes]))
    .filter((code) => !deniedCodes.has(code))
    .sort();
}
