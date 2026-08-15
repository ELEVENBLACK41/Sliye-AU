/*
 * @Description: 数据库用户记录到共享认证用户契约的映射函数。
 */
import type { SystemPermissionCode } from '@workspace/contracts/access';
import type { AuthUser } from '@workspace/contracts/auth';
import type { User } from '../../generated/prisma';

/** 认证资料映射需要的部门摘要。 */
type AuthDepartmentRecord = {
  /** 部门主键。 */
  id: number;
  /** 部门稳定代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
  /** 部门当前启停状态。 */
  status: 'ACTIVE' | 'DISABLED';
};

/** 认证资料映射需要的角色摘要。 */
type AuthRoleRecord = {
  /** 角色数据库主键。 */
  id: number;
  /** 角色稳定代码。 */
  code: string;
  /** 角色中文显示名称。 */
  name: string;
  /** 是否为代码目录维护的系统角色。 */
  isSystem: boolean;
};

/** 可转换为认证用户响应的数据库用户结构。 */
export type AuthUserRecord = Pick<
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
  | 'deptId'
> & {
  /** 可选的部门关系，注册阶段尚未加载时允许省略。 */
  department?: AuthDepartmentRecord | null;
  /** 可选的角色关系列表，注册阶段尚未加载时允许省略。 */
  roles?: Array<{
    /** 用户绑定的角色摘要。 */
    role: AuthRoleRecord;
  }>;
};

/** 认证用户映射时由授权服务提供的计算结果。 */
export interface AuthUserAuthorizationSnapshot {
  /** 当前用户最终拥有的系统权限码。 */
  permissions: SystemPermissionCode[];
  /** 当前用户是否是受保护的超级管理员。 */
  isSuperAdmin: boolean;
}

/** 将数据库用户记录转换为前后端共享的认证用户响应。 */
export function toAuthUserResponse(
  user: AuthUserRecord,
  authorization: AuthUserAuthorizationSnapshot = {
    permissions: [],
    isSuperAdmin: false,
  },
): AuthUser {
  const roles =
    user.roles?.map(({ role }) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
    })) ?? [];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    permissions: authorization.permissions,
    isSuperAdmin: authorization.isSuperAdmin,
    accessState: resolveAccessState(
      authorization.isSuperAdmin,
      roles.length,
      user.deptId,
    ),
    department: user.department
      ? {
          id: user.department.id,
          code: user.department.code,
          name: user.department.name,
          status: user.department.status,
        }
      : null,
    roles,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** 根据角色与部门是否就绪，计算登录后的组织接入状态。 */
function resolveAccessState(
  isSuperAdmin: boolean,
  roleCount: number,
  departmentId: number | null,
): AuthUser['accessState'] {
  if (isSuperAdmin) {
    return 'READY';
  }

  return roleCount > 0 && departmentId ? 'READY' : 'PENDING_ASSIGNMENT';
}
