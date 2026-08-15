/**
 * 本文件定义无副作用的系统权限与系统角色目录，供前后端和初始化脚本共同使用。
 */

/** 权限可使用的完整数据范围，`CUSTOM` 仅用于兼容历史数据。 */
export type AccessDataScope = 'ALL' | 'OWN' | 'DEPT' | 'DEPT_AND_CHILD' | 'PARTICIPATED' | 'CUSTOM';

/** 新授权允许选择的数据范围，不允许继续授予尚未实现的 `CUSTOM`。 */
export type GrantableDataScope = Exclude<AccessDataScope, 'CUSTOM'>;

/** 系统权限目录中的单条权限定义。 */
export type SystemPermissionDefinition = {
  /** 稳定且全局唯一的权限码。 */
  code: string;
  /** 面向用户展示的中文权限名称。 */
  name: string;
  /** 权限所属业务模块。 */
  module: string;
  /** 权限代表的操作。 */
  action: string;
  /** 权限用途与边界的中文说明。 */
  description: string;
  /** 该权限允许配置的数据范围。 */
  allowedScopes: readonly GrantableDataScope[];
};

/** 按业务语义分组的系统权限码，便于调用方避免手写字符串。 */
export const SYSTEM_PERMISSIONS = {
  dashboard: {
    access: 'dashboard:access',
  },
  access: {
    user: {
      read: 'access:user:read',
      statusUpdate: 'access:user:status:update',
      departmentUpdate: 'access:user:department:update',
    },
    department: {
      read: 'access:department:read',
      create: 'access:department:create',
      update: 'access:department:update',
      move: 'access:department:move',
    },
    role: {
      read: 'access:role:read',
      create: 'access:role:create',
      update: 'access:role:update',
    },
    userRole: {
      assign: 'access:user-role:assign',
    },
    permission: {
      read: 'access:permission:read',
    },
    rolePermission: {
      assign: 'access:role-permission:assign',
    },
    userPermission: {
      assign: 'access:user-permission:assign',
    },
    audit: {
      read: 'access:audit:read',
    },
  },
  decision: {
    read: 'decision:read',
    create: 'decision:create',
    update: 'decision:update',
  },
  project: {
    read: 'project:read',
    create: 'project:create',
    update: 'project:update',
    auditRead: 'project:audit:read',
  },
  ai: {
    chatUse: 'ai:chat:use',
  },
} as const;

/** 由系统权限目录派生的权限码联合类型。 */
export type SystemPermissionCode =
  | (typeof SYSTEM_PERMISSIONS.dashboard)[keyof typeof SYSTEM_PERMISSIONS.dashboard]
  | (typeof SYSTEM_PERMISSIONS.access.user)[keyof typeof SYSTEM_PERMISSIONS.access.user]
  | (typeof SYSTEM_PERMISSIONS.access.department)[keyof typeof SYSTEM_PERMISSIONS.access.department]
  | (typeof SYSTEM_PERMISSIONS.access.role)[keyof typeof SYSTEM_PERMISSIONS.access.role]
  | (typeof SYSTEM_PERMISSIONS.access.userRole)[keyof typeof SYSTEM_PERMISSIONS.access.userRole]
  | (typeof SYSTEM_PERMISSIONS.access.permission)[keyof typeof SYSTEM_PERMISSIONS.access.permission]
  | (typeof SYSTEM_PERMISSIONS.access.rolePermission)[keyof typeof SYSTEM_PERMISSIONS.access.rolePermission]
  | (typeof SYSTEM_PERMISSIONS.access.userPermission)[keyof typeof SYSTEM_PERMISSIONS.access.userPermission]
  | (typeof SYSTEM_PERMISSIONS.access.audit)[keyof typeof SYSTEM_PERMISSIONS.access.audit]
  | (typeof SYSTEM_PERMISSIONS.decision)[keyof typeof SYSTEM_PERMISSIONS.decision]
  | (typeof SYSTEM_PERMISSIONS.project)[keyof typeof SYSTEM_PERMISSIONS.project]
  | (typeof SYSTEM_PERMISSIONS.ai)[keyof typeof SYSTEM_PERMISSIONS.ai];

/** 系统权限的唯一事实来源，部署同步与启动漂移检查均应读取此数组。 */
export const SYSTEM_PERMISSION_DEFINITIONS = [
  {
    code: SYSTEM_PERMISSIONS.dashboard.access,
    name: '访问工作台',
    module: 'dashboard',
    action: 'access',
    description: '允许进入已登录用户的工作台区域。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.user.read,
    name: '查看用户',
    module: 'access:user',
    action: 'read',
    description: '允许按照授权数据范围查看用户及其访问控制信息。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.user.statusUpdate,
    name: '修改用户状态',
    module: 'access:user',
    action: 'status:update',
    description: '允许按照授权数据范围启用、禁用或锁定用户。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.user.departmentUpdate,
    name: '调整用户部门',
    module: 'access:user',
    action: 'department:update',
    description: '允许按照授权数据范围调整用户的主部门。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.department.read,
    name: '查看部门',
    module: 'access:department',
    action: 'read',
    description: '允许按照授权数据范围查看部门树。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.department.create,
    name: '创建部门',
    module: 'access:department',
    action: 'create',
    description: '允许在授权部门范围内创建下级部门。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.department.update,
    name: '修改部门',
    module: 'access:department',
    action: 'update',
    description: '允许在授权数据范围内修改部门资料与启停状态。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.department.move,
    name: '移动部门',
    module: 'access:department',
    action: 'move',
    description: '允许在授权数据范围内调整部门层级和排序。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.role.read,
    name: '查看角色',
    module: 'access:role',
    action: 'read',
    description: '允许查看角色、角色成员数及其权限授权。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.role.create,
    name: '创建角色',
    module: 'access:role',
    action: 'create',
    description: '允许创建由管理员维护的自定义角色。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.role.update,
    name: '修改角色',
    module: 'access:role',
    action: 'update',
    description: '允许修改或删除非系统角色。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.userRole.assign,
    name: '分配用户角色',
    module: 'access:user-role',
    action: 'assign',
    description: '允许在自身授权上限内为用户绑定或解绑角色。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.permission.read,
    name: '查看权限目录',
    module: 'access:permission',
    action: 'read',
    description: '允许查看系统、遗留和自定义权限目录。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.rolePermission.assign,
    name: '分配角色权限',
    module: 'access:role-permission',
    action: 'assign',
    description: '允许在自身授权上限内维护自定义角色的权限。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.userPermission.assign,
    name: '分配用户直接权限',
    module: 'access:user-permission',
    action: 'assign',
    description: '允许在自身授权上限内维护用户直接允许、拒绝和过期授权。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.access.audit.read,
    name: '查看授权审计',
    module: 'access:audit',
    action: 'read',
    description: '允许查看访问控制配置的变更审计记录。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.decision.read,
    name: '查看决策',
    module: 'decision',
    action: 'read',
    description: '允许按照所有者、部门或参与关系查看决策。',
    allowedScopes: ['ALL', 'OWN', 'DEPT', 'DEPT_AND_CHILD', 'PARTICIPATED'],
  },
  {
    code: SYSTEM_PERMISSIONS.decision.create,
    name: '创建决策',
    module: 'decision',
    action: 'create',
    description: '允许在授权部门范围内创建决策。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.decision.update,
    name: '更新决策',
    module: 'decision',
    action: 'update',
    description: '允许在授权数据范围和决策参与身份内更新决策。',
    allowedScopes: ['ALL', 'OWN', 'DEPT', 'DEPT_AND_CHILD', 'PARTICIPATED'],
  },
  {
    code: SYSTEM_PERMISSIONS.project.read,
    name: '查看项目',
    module: 'project',
    action: 'read',
    description: '允许读取自己作为成员加入的项目及其公共内容。',
    allowedScopes: ['ALL', 'PARTICIPATED'],
  },
  {
    code: SYSTEM_PERMISSIONS.project.create,
    name: '创建项目',
    module: 'project',
    action: 'create',
    description: '允许在授权部门范围内创建项目空间。',
    allowedScopes: ['ALL', 'DEPT', 'DEPT_AND_CHILD'],
  },
  {
    code: SYSTEM_PERMISSIONS.project.update,
    name: '管理项目',
    module: 'project',
    action: 'update',
    description: '允许项目负责人或管理员维护成员、分区、会议和生命周期。',
    allowedScopes: ['ALL', 'PARTICIPATED'],
  },
  {
    code: SYSTEM_PERMISSIONS.project.auditRead,
    name: '审计读取私有项目内容',
    module: 'project:audit',
    action: 'read',
    description: '允许填写原因并通过独立审计入口只读访问私有分区内容。',
    allowedScopes: ['ALL'],
  },
  {
    code: SYSTEM_PERMISSIONS.ai.chatUse,
    name: '使用 AI 对话',
    module: 'ai:chat',
    action: 'use',
    description: '允许使用项目内的 AI 对话能力。',
    allowedScopes: ['ALL'],
  },
] as const satisfies readonly SystemPermissionDefinition[];

/** 系统权限码的只读平铺数组，适合校验输入和执行漂移检查。 */
export const SYSTEM_PERMISSION_CODES = SYSTEM_PERMISSION_DEFINITIONS.map(
  ({ code }) => code,
) as readonly SystemPermissionCode[];

/** `SYSTEM_PERMISSION_DEFINITIONS` 的兼容语义别名。 */
export const SYSTEM_PERMISSION_CATALOG = SYSTEM_PERMISSION_DEFINITIONS;

/** 系统内置角色的稳定代码。 */
export const SYSTEM_ROLES = {
  superAdmin: 'SUPER_ADMIN',
  admin: 'ADMIN',
  departmentManager: 'DEPARTMENT_MANAGER',
  member: 'MEMBER',
} as const;

/** 由系统角色目录派生的稳定角色代码联合类型。 */
export type SystemRoleCode = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** 系统角色拥有的一条默认权限授权。 */
export type SystemRolePermissionDefinition = {
  /** 被授予的系统权限码。 */
  code: SystemPermissionCode;
  /** 该角色对权限拥有的数据范围。 */
  scopeType: GrantableDataScope;
};

/** 系统角色目录中的单条角色定义。 */
export type SystemRoleDefinition = {
  /** 稳定且全局唯一的系统角色代码。 */
  code: SystemRoleCode;
  /** 面向用户展示的中文角色名称。 */
  name: string;
  /** 系统角色职责的中文说明。 */
  description: string;
  /** 需要幂等同步的默认权限授权。 */
  permissions: readonly SystemRolePermissionDefinition[];
};

/** 四个系统角色及其默认授权，是初始化脚本同步系统角色的唯一事实来源。 */
export const SYSTEM_ROLE_DEFINITIONS = [
  {
    code: SYSTEM_ROLES.superAdmin,
    name: '超级管理员',
    description: '受保护的最高权限角色，通过服务端显式旁路全部系统权限和数据范围。',
    permissions: [],
  },
  {
    code: SYSTEM_ROLES.admin,
    name: '管理员',
    description: '负责全组织访问控制配置，并可访问全部决策数据。',
    permissions: SYSTEM_PERMISSION_CODES.map((code) => ({ code, scopeType: 'ALL' as const })),
  },
  {
    code: SYSTEM_ROLES.departmentManager,
    name: '部门负责人',
    description: '管理本部门及下级部门成员，并访问部门树或自己参与的决策。',
    permissions: [
      { code: SYSTEM_PERMISSIONS.dashboard.access, scopeType: 'ALL' },
      { code: SYSTEM_PERMISSIONS.access.user.read, scopeType: 'DEPT_AND_CHILD' },
      { code: SYSTEM_PERMISSIONS.access.user.departmentUpdate, scopeType: 'DEPT_AND_CHILD' },
      { code: SYSTEM_PERMISSIONS.access.department.read, scopeType: 'DEPT_AND_CHILD' },
      { code: SYSTEM_PERMISSIONS.decision.read, scopeType: 'DEPT_AND_CHILD' },
      { code: SYSTEM_PERMISSIONS.decision.read, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.decision.create, scopeType: 'DEPT_AND_CHILD' },
      { code: SYSTEM_PERMISSIONS.decision.update, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.project.read, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.project.create, scopeType: 'DEPT_AND_CHILD' },
      { code: SYSTEM_PERMISSIONS.project.update, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.ai.chatUse, scopeType: 'ALL' },
    ],
  },
  {
    code: SYSTEM_ROLES.member,
    name: '普通成员',
    description: '在主部门创建决策，并查看自己参与的决策。',
    permissions: [
      { code: SYSTEM_PERMISSIONS.dashboard.access, scopeType: 'ALL' },
      { code: SYSTEM_PERMISSIONS.access.department.read, scopeType: 'DEPT' },
      { code: SYSTEM_PERMISSIONS.decision.read, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.decision.create, scopeType: 'DEPT' },
      { code: SYSTEM_PERMISSIONS.decision.update, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.project.read, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.project.create, scopeType: 'DEPT' },
      { code: SYSTEM_PERMISSIONS.project.update, scopeType: 'PARTICIPATED' },
      { code: SYSTEM_PERMISSIONS.ai.chatUse, scopeType: 'ALL' },
    ],
  },
] as const satisfies readonly SystemRoleDefinition[];

/** 系统角色代码的只读平铺数组，适合校验输入和执行漂移检查。 */
export const SYSTEM_ROLE_CODES = SYSTEM_ROLE_DEFINITIONS.map(({ code }) => code) as readonly SystemRoleCode[];
