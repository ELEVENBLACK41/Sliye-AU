/**
 * 本文件定义新版组织与权限页面内部使用的查询状态与能力集合。
 */
import type {
  AccessAuditAction,
  AccessAuditTargetType,
  AccessUserStatus,
  SystemPermissionCode,
} from '@workspace/contracts/access';

/** 新版组织与权限支持的一级分区。 */
export type OrganizationSection = 'members' | 'departments' | 'roles' | 'permissions' | 'audit';

/** 页面从 URL 解析出的稳定查询状态。 */
export type OrganizationPageQuery = {
  /** 当前一级分区。 */
  section: OrganizationSection;
  /** 成员姓名或邮箱关键词。 */
  keyword?: string;
  /** 成员账号状态。 */
  status?: AccessUserStatus;
  /** 部门筛选主键。 */
  departmentId?: number;
  /** 是否只显示未分配部门成员。 */
  withoutDepartment?: boolean;
  /** 角色筛选主键。 */
  roleId?: number;
  /** 审计动作筛选。 */
  auditAction?: AccessAuditAction;
  /** 审计目标类型筛选。 */
  auditTargetType?: AccessAuditTargetType;
  /** 当前页码。 */
  page: number;
};

/** 当前用户在组织与权限模块中的细粒度页面能力。 */
export type OrganizationCapabilities = {
  /** 当前用户是否为超级管理员。 */
  isSuperAdmin: boolean;
  /** 是否允许查看成员。 */
  canReadUsers: boolean;
  /** 是否允许修改成员状态。 */
  canUpdateUserStatus: boolean;
  /** 是否允许调整成员部门。 */
  canUpdateUserDepartment: boolean;
  /** 是否允许分配成员角色。 */
  canAssignUserRole: boolean;
  /** 是否允许维护成员直接权限。 */
  canAssignUserPermission: boolean;
  /** 是否允许查看部门。 */
  canReadDepartments: boolean;
  /** 是否允许创建部门。 */
  canCreateDepartment: boolean;
  /** 是否允许更新部门。 */
  canUpdateDepartment: boolean;
  /** 是否允许移动部门。 */
  canMoveDepartment: boolean;
  /** 是否允许查看角色。 */
  canReadRoles: boolean;
  /** 是否允许创建角色。 */
  canCreateRole: boolean;
  /** 是否允许更新角色。 */
  canUpdateRole: boolean;
  /** 是否允许维护角色权限。 */
  canAssignRolePermission: boolean;
  /** 是否允许查看权限目录。 */
  canReadPermissions: boolean;
  /** 是否允许查看授权审计。 */
  canReadAudit: boolean;
  /** 是否允许审计读取私有项目内容。 */
  canReadProjectAudit: boolean;
};

/** 构建页面能力函数的输入。 */
export type OrganizationCapabilityInput = {
  /** 当前账号是否为超级管理员。 */
  isSuperAdmin: boolean;
  /** 当前账号最终拥有的权限码。 */
  permissions: SystemPermissionCode[];
};
