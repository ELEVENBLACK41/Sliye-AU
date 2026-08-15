/**
 * 本文件定义用户、部门、角色、权限授权和访问控制审计的跨端数据契约。
 */

import type { AccessDataScope, GrantableDataScope } from './permission-catalog.ts';

/** 访问控制页面使用的用户账号状态。 */
export type AccessUserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED';

/** 用户直接权限对最终授权产生的效果。 */
export type AccessPermissionEffect = 'ALLOW' | 'DENY';

/** 权限记录的来源类型。 */
export type AccessPermissionKind = 'SYSTEM' | 'CUSTOM' | 'LEGACY';

/** 部门是否可以继续承载成员和业务数据。 */
export type AccessDepartmentStatus = 'ACTIVE' | 'DISABLED';

/** 权限目录中的一条权限信息。 */
export type AccessPermission = {
  /** 权限数据库主键。 */
  id: number;
  /** 稳定且全局唯一的权限码。 */
  code: string;
  /** 面向用户展示的中文权限名称。 */
  name: string | null;
  /** 权限所属模块。 */
  module: string;
  /** 权限代表的操作。 */
  action: string;
  /** 权限用途与边界说明。 */
  desc: string | null;
  /** 权限来自系统目录、自定义配置还是历史遗留数据。 */
  kind: AccessPermissionKind;
  /** 该权限当前允许授予的数据范围。 */
  allowedScopes: readonly GrantableDataScope[];
  /** 权限创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 权限最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 角色拥有的一条权限与数据范围授权。 */
export type AccessRolePermissionGrant = {
  /** 角色权限授权记录主键，删除授权时使用该主键。 */
  id: number;
  /** 被授予的完整权限信息。 */
  permission: AccessPermission;
  /** 本条授权允许访问的数据范围。 */
  scopeType: AccessDataScope;
  /** 授权创建时间，使用 ISO 8601 字符串。 */
  grantedAt: string;
};

/** `AccessRolePermissionGrant` 的简短业务语义别名。 */
export type RolePermissionGrant = AccessRolePermissionGrant;

/** 角色及其授权摘要。 */
export type AccessRole = {
  /** 角色数据库主键。 */
  id: number;
  /** 稳定且全局唯一的角色代码。 */
  code: string;
  /** 面向用户展示的中文角色名称。 */
  name: string;
  /** 角色用途说明。 */
  desc: string | null;
  /** 是否为只能通过代码目录同步的系统角色。 */
  isSystem: boolean;
  /** 角色创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 角色最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
  /** 角色当前拥有的全部权限范围授权。 */
  grants: AccessRolePermissionGrant[];
  /** 角色拥有的权限授权记录数量。 */
  permissionCount: number;
  /** 当前绑定该角色的用户数量。 */
  userCount: number;
};

/** 用户已绑定的角色摘要。 */
export type AccessUserRole = {
  /** 角色数据库主键。 */
  id: number;
  /** 稳定且全局唯一的角色代码。 */
  code: string;
  /** 面向用户展示的中文角色名称。 */
  name: string;
  /** 角色用途说明。 */
  desc: string | null;
  /** 是否为只能通过代码目录同步的系统角色。 */
  isSystem: boolean;
  /** 用户获得该角色的时间，使用 ISO 8601 字符串。 */
  assignedAt: string;
};

/** 用户的一条直接权限授权。 */
export type AccessUserPermission = {
  /** 用户直接权限记录主键。 */
  id: number;
  /** 被直接授予或拒绝的完整权限信息。 */
  permission: AccessPermission;
  /** 本条直接权限是允许还是拒绝。 */
  effect: AccessPermissionEffect;
  /** 本条直接权限的数据范围；拒绝授权只能使用 `ALL`。 */
  scopeType: AccessDataScope;
  /** 授权失效时间；`null` 表示长期有效。 */
  expiresAt: string | null;
  /** 直接权限创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 直接权限最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 用户所属部门的轻量摘要。 */
export type AccessDepartmentSummary = {
  /** 部门数据库主键。 */
  id: number;
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
  /** 部门当前启停状态。 */
  status: AccessDepartmentStatus;
};

/** 部门基本信息与业务统计。 */
export type AccessDepartment = {
  /** 部门数据库主键。 */
  id: number;
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
  /** 上级部门主键；`null` 表示组织根节点。 */
  parentId: number | null;
  /** 部门当前启停状态。 */
  status: AccessDepartmentStatus;
  /** 同级部门的展示顺序，数值越小越靠前。 */
  sortOrder: number;
  /** 当前直接归属该部门的成员数量。 */
  memberCount: number;
  /** 当前直接归属该部门的决策数量。 */
  decisionCount: number;
  /** 部门创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 部门最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 部门树中的一个递归节点。 */
export type AccessDepartmentTreeNode = AccessDepartment & {
  /** 已按照排序规则组织好的直接下级部门。 */
  children: AccessDepartmentTreeNode[];
};

/** 访问控制管理页面中的用户信息。 */
export type AccessUser = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户登录邮箱。 */
  email: string;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
  /** 用户账号状态。 */
  status: AccessUserStatus;
  /** 用户主部门主键；`null` 表示尚未分配部门。 */
  deptId: number | null;
  /** 用户主部门摘要；`null` 表示尚未分配部门。 */
  department: AccessDepartmentSummary | null;
  /** 邮箱验证时间；`null` 表示尚未验证。 */
  emailVerifiedAt: string | null;
  /** 最近登录时间；`null` 表示从未登录。 */
  lastLoginAt: string | null;
  /** 用户创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 用户最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
  /** 用户当前绑定的全部角色。 */
  roles: AccessUserRole[];
  /** 用户当前配置的全部直接权限。 */
  directPermissions: AccessUserPermission[];
};

/** 用户列表支持的服务端筛选和分页参数。 */
export type AccessUserListQuery = {
  /** 按姓名或邮箱执行不区分大小写的模糊搜索。 */
  keyword?: string;
  /** 按账号状态筛选。 */
  status?: AccessUserStatus;
  /** 按目标部门及其全部下级部门筛选。 */
  departmentId?: number;
  /** 是否只查看尚未分配主部门的用户；不能与 `departmentId` 同时使用。 */
  withoutDepartment?: boolean;
  /** 按已绑定角色主键筛选。 */
  roleId?: number;
  /** 从 1 开始的页码。 */
  page?: number;
  /** 每页记录数量。 */
  pageSize?: number;
};

/** 分页成员列表中的轻量用户摘要。 */
export type AccessUserListItem = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户登录邮箱。 */
  email: string;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
  /** 用户账号状态。 */
  status: AccessUserStatus;
  /** 用户主部门摘要。 */
  department: AccessDepartmentSummary | null;
  /** 用户已绑定的角色摘要。 */
  roles: AccessUserRole[];
  /** 用户直接授权记录数量。 */
  directPermissionCount: number;
  /** 最近登录时间；`null` 表示从未登录。 */
  lastLoginAt: string | null;
  /** 用户创建时间。 */
  createdAt: string;
};

/** 服务端分页成员列表。 */
export type AccessUserListResult = {
  /** 当前页用户摘要。 */
  items: AccessUserListItem[];
  /** 符合筛选条件的用户总数。 */
  total: number;
  /** 当前页码。 */
  page: number;
  /** 当前每页记录数量。 */
  pageSize: number;
  /** 根据总数与每页数量计算出的总页数。 */
  totalPages: number;
};

/** 一条最终生效权限的授权来源。 */
export type AccessEffectivePermissionSource =
  | {
      /** 超级管理员显式旁路系统权限。 */
      type: 'SUPER_ADMIN';
    }
  | {
      /** 权限来自用户绑定的角色。 */
      type: 'ROLE';
      /** 来源角色主键。 */
      roleId: number;
      /** 来源角色名称。 */
      roleName: string;
      /** 该角色授权的数据范围。 */
      scopeType: AccessDataScope;
    }
  | {
      /** 权限来自用户级直接允许授权。 */
      type: 'DIRECT';
      /** 直接授权记录主键。 */
      grantId: number;
      /** 直接授权的数据范围。 */
      scopeType: AccessDataScope;
      /** 授权失效时间；`null` 表示长期有效。 */
      expiresAt: string | null;
    };

/** 后端完成合并和拒绝处理后的一条最终权限。 */
export type AccessEffectivePermission = {
  /** 完整权限目录记录。 */
  permission: AccessPermission;
  /** 合并后的全部有效数据范围。 */
  scopes: AccessDataScope[];
  /** 形成该最终权限的有效授权来源。 */
  sources: AccessEffectivePermissionSource[];
};

/** 用户详情抽屉使用的完整授权解析结果。 */
export type AccessUserAuthorizationDetail = {
  /** 用户、部门、角色和原始直接授权。 */
  user: AccessUser;
  /** 后端统一解析后的最终有效权限。 */
  effectivePermissions: AccessEffectivePermission[];
  /** 当前被有效直接拒绝完全移除的权限码。 */
  deniedPermissionCodes: string[];
};

/** 创建自定义角色的请求体。 */
export type CreateRoleRequestPayload = {
  /** 稳定且全局唯一的角色代码，创建后不允许修改。 */
  code: string;
  /** 面向用户展示的中文角色名称。 */
  name: string;
  /** 角色用途说明。 */
  desc?: string;
};

/** 修改自定义角色的请求体。 */
export type UpdateRoleRequestPayload = {
  /** 修改后的中文角色名称。 */
  name?: string;
  /** 修改后的角色用途说明，传入 `null` 表示清空。 */
  desc?: string | null;
};

/** 创建自定义权限的请求体；系统权限只能通过代码目录同步。 */
export type CreateCustomPermissionRequestPayload = {
  /** 稳定且全局唯一的自定义权限码。 */
  code: string;
  /** 面向用户展示的中文权限名称。 */
  name: string;
  /** 自定义权限所属模块。 */
  module: string;
  /** 自定义权限代表的操作。 */
  action: string;
  /** 自定义权限用途与边界说明。 */
  desc?: string;
  /** 该自定义权限允许授予的数据范围。 */
  allowedScopes: GrantableDataScope[];
};

/** `CreateCustomPermissionRequestPayload` 的向后兼容别名。 */
export type CreatePermissionRequestPayload = CreateCustomPermissionRequestPayload;

/** 为用户绑定角色的请求体。 */
export type AssignRoleToUserRequestPayload = {
  /** 需要绑定的角色主键。 */
  roleId: number;
};

/** 为角色绑定一条带数据范围权限的请求体。 */
export type AssignPermissionToRoleRequestPayload = {
  /** 需要绑定的权限主键。 */
  permissionId: number;
  /** 本次角色授权的数据范围，不允许使用 `CUSTOM`。 */
  scopeType: GrantableDataScope;
};

/** 为用户配置直接权限的请求体。 */
export type AssignDirectPermissionToUserRequestPayload = {
  /** 需要直接授权或拒绝的权限主键。 */
  permissionId: number;
  /** 授权效果；选择 `DENY` 时 `scopeType` 必须为 `ALL`。 */
  effect: AccessPermissionEffect;
  /** 本次直接授权的数据范围，不允许使用 `CUSTOM`。 */
  scopeType: GrantableDataScope;
  /** 授权失效时间；省略或传入 `null` 表示长期有效。 */
  expiresAt?: string | null;
};

/** 修改用户账号状态的请求体。 */
export type UpdateAccessUserStatusRequestPayload = {
  /** 需要设置的新账号状态。 */
  status: AccessUserStatus;
};

/** 修改用户主部门的请求体。 */
export type UpdateUserDepartmentRequestPayload = {
  /** 目标部门主键；传入 `null` 表示清除主部门。 */
  departmentId: number | null;
};

/** `UpdateUserDepartmentRequestPayload` 的业务语义别名。 */
export type AssignDepartmentToUserRequestPayload = UpdateUserDepartmentRequestPayload;

/** 创建部门的请求体。 */
export type CreateDepartmentRequestPayload = {
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
  /** 上级部门主键；省略或传入 `null` 表示创建根部门。 */
  parentId?: number | null;
  /** 同级部门展示顺序，省略时由服务端使用默认值。 */
  sortOrder?: number;
};

/** 修改部门基本资料或启停状态的请求体。 */
export type UpdateDepartmentRequestPayload = {
  /** 修改后的部门中文名称。 */
  name?: string;
  /** 修改后的部门启停状态。 */
  status?: AccessDepartmentStatus;
  /** 修改后的同级展示顺序。 */
  sortOrder?: number;
};

/** 单独修改部门启停状态的请求体。 */
export type UpdateDepartmentStatusRequestPayload = {
  /** 需要设置的新部门状态。 */
  status: AccessDepartmentStatus;
};

/** 移动部门节点的请求体。 */
export type MoveDepartmentRequestPayload = {
  /** 新的上级部门主键；传入 `null` 表示移动为根部门。 */
  parentId: number | null;
  /** 移动后在同级部门中的展示顺序。 */
  sortOrder?: number;
};

/** 访问控制审计记录中的操作类型。 */
export type AccessAuditAction =
  | 'DEPARTMENT_CREATED'
  | 'DEPARTMENT_UPDATED'
  | 'DEPARTMENT_MOVED'
  | 'DEPARTMENT_STATUS_UPDATED'
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_DELETED'
  | 'ROLE_PERMISSION_ASSIGNED'
  | 'ROLE_PERMISSION_REMOVED'
  | 'USER_ROLE_ASSIGNED'
  | 'USER_ROLE_REMOVED'
  | 'USER_PERMISSION_ASSIGNED'
  | 'USER_PERMISSION_REMOVED'
  | 'USER_STATUS_UPDATED'
  | 'USER_DEPARTMENT_UPDATED'
  | 'PERMISSION_CATALOG_SYNCED';

/** 访问控制审计记录中的目标资源类型。 */
export type AccessAuditTargetType = 'DEPARTMENT' | 'ROLE' | 'PERMISSION' | 'USER' | 'SYSTEM';

/** 访问控制审计记录中的操作人摘要。 */
export type AccessAuditActor = {
  /** 操作人用户主键。 */
  id: number;
  /** 操作人邮箱。 */
  email: string;
  /** 操作人显示名称。 */
  name: string | null;
};

/** 一条访问控制配置变更审计记录。 */
export type AccessAuditLog = {
  /** 审计记录主键。 */
  id: number;
  /** 执行本次配置变更的用户主键。 */
  actorId: number;
  /** 操作人摘要。 */
  actor: AccessAuditActor;
  /** 本次配置变更的操作类型。 */
  action: AccessAuditAction;
  /** 被修改资源的类型。 */
  targetType: AccessAuditTargetType;
  /** 被修改资源的稳定标识。 */
  targetId: string;
  /** 修改前可安全公开的字段快照。 */
  before: Record<string, unknown> | null;
  /** 修改后可安全公开的字段快照。 */
  after: Record<string, unknown> | null;
  /** 发起请求的 IP 地址。 */
  ipAddress: string | null;
  /** 发起请求的浏览器或客户端标识。 */
  userAgent: string | null;
  /** 贯穿请求和错误响应的请求标识。 */
  requestId: string;
  /** 审计记录创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** 查询访问控制审计记录时支持的筛选条件。 */
export type AccessAuditListQuery = {
  /** 按操作类型筛选。 */
  action?: AccessAuditAction;
  /** 按目标资源类型筛选。 */
  targetType?: AccessAuditTargetType;
  /** 按操作人用户主键筛选。 */
  actorId?: number;
  /** 从 1 开始的页码。 */
  page?: number;
  /** 每页记录数量。 */
  pageSize?: number;
};

/** 分页访问控制审计列表。 */
export type AccessAuditListResult = {
  /** 当前页的审计记录。 */
  items: AccessAuditLog[];
  /** 符合筛选条件的记录总数。 */
  total: number;
  /** 当前页码。 */
  page: number;
  /** 当前每页记录数量。 */
  pageSize: number;
  /** 根据总数与每页数量计算出的总页数。 */
  totalPages: number;
};
