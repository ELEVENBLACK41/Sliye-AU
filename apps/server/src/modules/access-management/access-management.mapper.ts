/*
 * @Description: 访问控制数据库实体到共享契约响应结构的映射函数。
 */
import {
  SYSTEM_PERMISSION_DEFINITIONS,
  type AccessAuditLog,
  type AccessDepartment,
  type AccessDepartmentTreeNode,
  type AccessPermission,
  type AccessRole,
  type AccessUser,
  type GrantableDataScope,
} from '@workspace/contracts/access';
import type {
  AccessControlAuditLog,
  Department,
  Permission,
  Role,
  RolePermission,
  User,
  UserPermission,
} from '../../generated/prisma';

/** 角色响应映射需要的统计和授权关系。 */
export type RoleWithAccessRelations = Role & {
  /** 角色关联统计。 */
  _count: { users: number; perms: number };
  /** 角色的权限范围授权。 */
  perms: Array<RolePermission & { perm: Permission }>;
};

/** 用户角色关系映射结构。 */
type UserRoleRecord = {
  /** 角色绑定时间。 */
  assignedAt: Date;
  /** 角色完整记录。 */
  role: Role;
};

/** 用户直接权限关系映射结构。 */
type UserPermissionRecord = UserPermission & {
  /** 关联权限记录。 */
  permission: Permission;
};

/** 用户管理响应映射需要的关系集合。 */
export type UserWithAccessRelations = User & {
  /** 用户所属部门。 */
  department: Department | null;
  /** 用户角色关系。 */
  roles: UserRoleRecord[];
  /** 用户直接权限关系。 */
  permissions: UserPermissionRecord[];
};

/** 部门响应映射需要的成员和决策统计。 */
export type DepartmentWithCounts = Department & {
  /** 部门关联统计。 */
  _count: { users: number; decisions: number };
};

/** 授权审计响应映射需要的操作者关系。 */
export type AuditLogWithActor = AccessControlAuditLog & {
  /** 审计操作者摘要。 */
  actor: Pick<User, 'id' | 'email' | 'name'>;
};

/** 将角色实体映射为对外角色响应。 */
export function toAccessRole(role: RoleWithAccessRelations): AccessRole {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    desc: role.desc,
    isSystem: role.isSystem,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
    grants: role.perms.map((grant) => ({
      id: grant.id,
      permission: toAccessPermission(grant.perm),
      scopeType: grant.scopeType,
      grantedAt: grant.grantedAt.toISOString(),
    })),
    permissionCount: role._count.perms,
    userCount: role._count.users,
  };
}

/** 将权限实体映射为包含允许范围的对外权限响应。 */
export function toAccessPermission(permission: Permission): AccessPermission {
  const systemDefinition = SYSTEM_PERMISSION_DEFINITIONS.find(
    (definition) => definition.code === permission.code,
  );

  return {
    id: permission.id,
    code: permission.code,
    name: permission.name,
    module: permission.module,
    action: permission.action,
    desc: permission.desc,
    kind: permission.kind,
    allowedScopes:
      systemDefinition?.allowedScopes ?? ([] as GrantableDataScope[]),
    createdAt: permission.createdAt.toISOString(),
    updatedAt: permission.updatedAt.toISOString(),
  };
}

/** 将用户及其访问控制关系映射为用户管理响应。 */
export function toAccessUser(user: UserWithAccessRelations): AccessUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    deptId: user.deptId,
    department: user.department
      ? {
          id: user.department.id,
          code: user.department.code,
          name: user.department.name,
          status: user.department.status,
        }
      : null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles: user.roles.map(({ assignedAt, role }) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      desc: role.desc,
      isSystem: role.isSystem,
      assignedAt: assignedAt.toISOString(),
    })),
    directPermissions: user.permissions.map((grant) => ({
      id: grant.id,
      permission: toAccessPermission(grant.permission),
      effect: grant.effect,
      scopeType: grant.scopeType,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      createdAt: grant.createdAt.toISOString(),
      updatedAt: grant.updatedAt.toISOString(),
    })),
  };
}

/** 将部门实体与统计映射为扁平部门响应。 */
export function toAccessDepartment(
  department: DepartmentWithCounts,
): AccessDepartment {
  return {
    id: department.id,
    code: department.code,
    name: department.name,
    parentId: department.parentId,
    status: department.status,
    sortOrder: department.sortOrder,
    memberCount: department._count.users,
    decisionCount: department._count.decisions,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}

/** 将扁平部门列表组装成按排序值和主键稳定排序的树。 */
export function toAccessDepartmentTree(
  departments: DepartmentWithCounts[],
): AccessDepartmentTreeNode[] {
  const nodes = new Map<number, AccessDepartmentTreeNode>();
  const roots: AccessDepartmentTreeNode[] = [];

  for (const department of departments) {
    nodes.set(department.id, {
      ...toAccessDepartment(department),
      children: [],
    });
  }

  for (const department of departments) {
    const node = nodes.get(department.id)!;
    const parent = department.parentId
      ? nodes.get(department.parentId)
      : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortDepartmentNodes(roots);
  return roots;
}

/** 将访问控制审计实体映射为对外响应。 */
export function toAccessAuditLog(log: AuditLogWithActor): AccessAuditLog {
  return {
    id: log.id,
    actorId: log.actorId,
    actor: {
      id: log.actor.id,
      email: log.actor.email,
      name: log.actor.name,
    },
    action: log.action as AccessAuditLog['action'],
    targetType: log.targetType as AccessAuditLog['targetType'],
    targetId: log.targetId,
    before: toRecord(log.before),
    after: toRecord(log.after),
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    requestId: log.requestId,
    createdAt: log.createdAt.toISOString(),
  };
}

/** 递归排序部门树，保证服务端与客户端看到一致顺序。 */
function sortDepartmentNodes(nodes: AccessDepartmentTreeNode[]): void {
  nodes.sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
  );

  for (const node of nodes) {
    sortDepartmentNodes(node.children);
  }
}

/** 将 Prisma JsonValue 安全收窄为审计契约允许的对象快照。 */
function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
