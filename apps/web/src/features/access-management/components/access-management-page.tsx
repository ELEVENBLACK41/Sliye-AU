/**
 * 本文件实现权限管理工作区，按照细粒度权限分别加载用户、部门、角色、权限目录和审计数据。
 */
import { Suspense, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  SYSTEM_PERMISSIONS,
  type AccessAuditLog,
  type AccessDepartmentTreeNode,
  type AccessPermission,
  type AccessRole,
  type AccessUser,
  type SystemPermissionCode,
} from '@workspace/contracts/access';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table';

import {
  getAccessAuditLogs,
  getAccessDepartments,
  getAccessPermissions,
  getAccessRoles,
  getAccessUsers,
  type AccessManagementDashboardData,
} from '@/features/access-management/services/access-management-server.service';
import { AccessManagementActions } from './access-management-actions';
import { ProjectPrivateAuditAction } from './project-private-audit-action';

/** 权限管理页面属性。 */
type AccessManagementPageProps = {
  /** 当前用户实时生效的系统权限码。 */
  currentUserPermissions: SystemPermissionCode[];
};

/** 页面级错误兜底属性。 */
type AccessManagementErrorPageProps = {
  /** 面向用户展示的中文错误。 */
  message: string;
};

/** 页面各区域是否允许读取或修改的能力集合。 */
export type AccessManagementCapabilities = {
  /** 是否允许读取用户。 */
  canReadUsers: boolean;
  /** 是否允许修改用户状态。 */
  canUpdateUserStatus: boolean;
  /** 是否允许调整用户部门。 */
  canUpdateUserDepartment: boolean;
  /** 是否允许读取部门。 */
  canReadDepartments: boolean;
  /** 是否允许创建部门。 */
  canCreateDepartment: boolean;
  /** 是否允许修改或启停部门。 */
  canUpdateDepartment: boolean;
  /** 是否允许移动部门。 */
  canMoveDepartment: boolean;
  /** 是否允许读取角色。 */
  canReadRoles: boolean;
  /** 是否允许创建自定义角色。 */
  canCreateRole: boolean;
  /** 是否允许修改自定义角色。 */
  canUpdateRole: boolean;
  /** 是否允许为用户分配角色。 */
  canAssignUserRole: boolean;
  /** 是否允许读取权限目录。 */
  canReadPermissions: boolean;
  /** 是否允许维护自定义角色授权。 */
  canAssignRolePermission: boolean;
  /** 是否允许维护用户直接授权。 */
  canAssignUserPermission: boolean;
  /** 是否允许读取访问控制审计。 */
  canReadAudit: boolean;
  /** 是否允许通过独立入口审计读取私有项目内容。 */
  canReadProjectAudit: boolean;
};

/** 用户状态对应的中文文案。 */
const userStatusText: Record<AccessUser['status'], string> = {
  PENDING: '待验证',
  ACTIVE: '正常',
  DISABLED: '已禁用',
  LOCKED: '已锁定',
};

/** 审计动作对应的中文文案。 */
const auditActionText: Partial<Record<AccessAuditLog['action'], string>> = {
  DEPARTMENT_CREATED: '创建部门',
  DEPARTMENT_UPDATED: '修改部门',
  DEPARTMENT_MOVED: '移动部门',
  DEPARTMENT_STATUS_UPDATED: '部门状态变更',
  ROLE_CREATED: '创建角色',
  ROLE_UPDATED: '修改角色',
  ROLE_DELETED: '删除角色',
  ROLE_PERMISSION_ASSIGNED: '角色增加授权',
  ROLE_PERMISSION_REMOVED: '角色移除授权',
  USER_ROLE_ASSIGNED: '用户分配角色',
  USER_ROLE_REMOVED: '用户解除角色',
  USER_PERMISSION_ASSIGNED: '用户直接授权',
  USER_PERMISSION_REMOVED: '用户移除直接授权',
  USER_STATUS_UPDATED: '用户状态变更',
  USER_DEPARTMENT_UPDATED: '用户部门变更',
  PERMISSION_CATALOG_SYNCED: '权限目录同步',
};

/** 渲染权限管理工作区，并把每个权限码转换成页面能力。 */
export function AccessManagementPage({ currentUserPermissions }: AccessManagementPageProps) {
  const capabilities = buildCapabilities(currentUserPermissions);

  return (
    <main className="flex flex-col gap-4">
      <section className="flex flex-col justify-between gap-3 rounded-md border bg-background p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-semibold tracking-normal">权限与组织管理</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            部门数据范围和功能权限均由后端强制执行，页面只展示当前账号可操作的区域。
          </p>
        </div>
        <Badge variant={hasWriteCapability(capabilities) ? 'default' : 'secondary'}>
          {hasWriteCapability(capabilities) ? '可执行授权操作' : '只读视图'}
        </Badge>
      </section>

      <Suspense fallback={<WorkspaceFallback />}>
        <AccessManagementWorkspace capabilities={capabilities} />
      </Suspense>
    </main>
  );
}

/** 渲染权限管理页面的统一错误状态。 */
export function AccessManagementErrorPage({ message }: AccessManagementErrorPageProps) {
  return (
    <main className="rounded-md border bg-background p-6">
      <h1 className="text-xl font-semibold tracking-normal">权限与组织管理</h1>
      <p className="mt-2 text-sm text-destructive">{message}</p>
    </main>
  );
}

/** 按能力并发读取所需数据，并渲染操作区与只读数据表。 */
async function AccessManagementWorkspace({
  capabilities,
}: {
  /** 当前账号在权限管理模块中的页面能力。 */
  capabilities: AccessManagementCapabilities;
}) {
  const [users, departments, roles, permissions, auditLogs] = await Promise.all([
    capabilities.canReadUsers ? getAccessUsers() : Promise.resolve([]),
    capabilities.canReadDepartments ? getAccessDepartments() : Promise.resolve([]),
    capabilities.canReadRoles ? getAccessRoles() : Promise.resolve([]),
    capabilities.canReadPermissions ? getAccessPermissions() : Promise.resolve([]),
    capabilities.canReadAudit ? getAccessAuditLogs() : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 }),
  ]);
  const data: AccessManagementDashboardData = {
    users,
    departments,
    roles,
    permissions,
    auditLogs,
  };

  return (
    <div className="flex flex-col gap-4">
      <SummaryCards data={data} capabilities={capabilities} />
      {hasWriteCapability(capabilities) ? (
        <AccessManagementActions data={data} capabilities={capabilities} />
      ) : (
        <ReadOnlyAlert />
      )}
      {capabilities.canReadDepartments ? <DepartmentTable departments={departments} /> : null}
      {capabilities.canReadUsers ? <UsersTable users={users} /> : null}
      {capabilities.canReadRoles ? <RolesTable roles={roles} /> : null}
      {capabilities.canReadPermissions ? <PermissionsTable permissions={permissions} /> : null}
      {capabilities.canReadAudit ? <AuditTable logs={auditLogs.items} /> : null}
      {capabilities.canReadProjectAudit ? <ProjectPrivateAuditAction /> : null}
    </div>
  );
}

/** 将系统权限码集合转换成清晰的页面能力对象。 */
function buildCapabilities(permissions: SystemPermissionCode[]): AccessManagementCapabilities {
  const has = (permission: SystemPermissionCode) => permissions.includes(permission);

  return {
    canReadUsers: has(SYSTEM_PERMISSIONS.access.user.read),
    canUpdateUserStatus: has(SYSTEM_PERMISSIONS.access.user.statusUpdate),
    canUpdateUserDepartment: has(SYSTEM_PERMISSIONS.access.user.departmentUpdate),
    canReadDepartments: has(SYSTEM_PERMISSIONS.access.department.read),
    canCreateDepartment: has(SYSTEM_PERMISSIONS.access.department.create),
    canUpdateDepartment: has(SYSTEM_PERMISSIONS.access.department.update),
    canMoveDepartment: has(SYSTEM_PERMISSIONS.access.department.move),
    canReadRoles: has(SYSTEM_PERMISSIONS.access.role.read),
    canCreateRole: has(SYSTEM_PERMISSIONS.access.role.create),
    canUpdateRole: has(SYSTEM_PERMISSIONS.access.role.update),
    canAssignUserRole: has(SYSTEM_PERMISSIONS.access.userRole.assign),
    canReadPermissions: has(SYSTEM_PERMISSIONS.access.permission.read),
    canAssignRolePermission: has(SYSTEM_PERMISSIONS.access.rolePermission.assign),
    canAssignUserPermission: has(SYSTEM_PERMISSIONS.access.userPermission.assign),
    canReadAudit: has(SYSTEM_PERMISSIONS.access.audit.read),
    canReadProjectAudit: has(SYSTEM_PERMISSIONS.project.auditRead),
  };
}

/** 判断当前能力集合是否包含任意配置写入操作。 */
function hasWriteCapability(capabilities: AccessManagementCapabilities): boolean {
  return (
    capabilities.canUpdateUserStatus ||
    capabilities.canUpdateUserDepartment ||
    capabilities.canCreateDepartment ||
    capabilities.canUpdateDepartment ||
    capabilities.canMoveDepartment ||
    capabilities.canCreateRole ||
    capabilities.canUpdateRole ||
    capabilities.canAssignUserRole ||
    capabilities.canAssignRolePermission ||
    capabilities.canAssignUserPermission
  );
}

/** 渲染用户、部门、角色、权限与审计的汇总数据。 */
function SummaryCards({
  data,
  capabilities,
}: {
  /** 已加载的权限管理数据。 */
  data: AccessManagementDashboardData;
  /** 决定统计项是否展示的页面能力。 */
  capabilities: AccessManagementCapabilities;
}) {
  const summaries = [
    capabilities.canReadUsers ? { title: '可见用户', value: data.users.length } : null,
    capabilities.canReadDepartments ? { title: '可见部门', value: flattenDepartments(data.departments).length } : null,
    capabilities.canReadRoles ? { title: '角色', value: data.roles.length } : null,
    capabilities.canReadPermissions ? { title: '权限码', value: data.permissions.length } : null,
  ].filter((item): item is { title: string; value: number } => item !== null);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summaries.map((summary) => (
        <Card key={summary.title} className="rounded-md shadow-none">
          <CardHeader className="gap-0.5 py-4">
            <CardTitle className="text-sm text-muted-foreground">{summary.title}</CardTitle>
            <p className="text-xl font-semibold tabular-nums">{summary.value}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/** 渲染只读账号提示。 */
function ReadOnlyAlert() {
  return (
    <Alert>
      <ShieldCheck aria-hidden />
      <AlertTitle>当前账号只有查看权限</AlertTitle>
      <AlertDescription>所有变更按钮已经隐藏，直接调用接口仍会被后端权限守卫拒绝。</AlertDescription>
    </Alert>
  );
}

/** 渲染部门树表格，并保留层级缩进。 */
function DepartmentTable({ departments }: { departments: AccessDepartmentTreeNode[] }) {
  const rows = flattenDepartments(departments);

  return (
    <TableCard title="部门树" headers={['部门', '代码', '状态', '直属成员', '决策数']}>
      <TableBody>
        {rows.length ? (
          rows.map(({ department, depth }) => (
            <TableRow key={department.id}>
              <TableCell>
                <span style={{ paddingLeft: `${depth * 20}px` }}>{department.name}</span>
              </TableCell>
              <TableCell className="font-mono text-xs">{department.code}</TableCell>
              <TableCell>
                <Badge variant={department.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {department.status === 'ACTIVE' ? '启用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell>{department.memberCount}</TableCell>
              <TableCell>{department.decisionCount}</TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} text="尚未创建部门" />
        )}
      </TableBody>
    </TableCard>
  );
}

/** 渲染当前数据范围内可见的用户及授权摘要。 */
function UsersTable({ users }: { users: AccessUser[] }) {
  return (
    <TableCard title="用户列表" headers={['用户', '状态', '部门', '角色', '直接授权']}>
      <TableBody>
        {users.length ? (
          users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <span className="block font-medium">{user.name || '未设置姓名'}</span>
                <span className="block text-xs text-muted-foreground">{user.email}</span>
              </TableCell>
              <TableCell>{userStatusText[user.status]}</TableCell>
              <TableCell>{user.department?.name ?? '未分配'}</TableCell>
              <TableCell>
                <BadgeList items={user.roles.map((role) => role.name)} emptyText="暂无角色" />
              </TableCell>
              <TableCell>
                <BadgeList
                  items={user.directPermissions.map(
                    (grant) => `${grant.effect}:${grant.permission.code}:${grant.scopeType}`,
                  )}
                  emptyText="暂无直接授权"
                />
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} text="当前范围内暂无用户" />
        )}
      </TableBody>
    </TableCard>
  );
}

/** 渲染角色及其带数据范围的授权记录。 */
function RolesTable({ roles }: { roles: AccessRole[] }) {
  return (
    <TableCard title="角色与数据范围" headers={['角色', '类型', '用户数', '权限范围']}>
      <TableBody>
        {roles.length ? (
          roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <span className="block font-medium">{role.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">{role.code}</span>
              </TableCell>
              <TableCell>{role.isSystem ? '系统角色' : '自定义角色'}</TableCell>
              <TableCell>{role.userCount}</TableCell>
              <TableCell>
                <BadgeList
                  items={role.grants.map((grant) => `${grant.permission.code}:${grant.scopeType}`)}
                  emptyText="暂无授权"
                />
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={4} text="暂无角色" />
        )}
      </TableBody>
    </TableCard>
  );
}

/** 渲染代码优先的只读权限目录。 */
function PermissionsTable({ permissions }: { permissions: AccessPermission[] }) {
  return (
    <TableCard title="权限目录（系统权限只读）" headers={['权限码', '名称', '来源', '允许范围']}>
      <TableBody>
        {permissions.length ? (
          permissions.map((permission) => (
            <TableRow key={permission.id}>
              <TableCell className="font-mono text-xs">{permission.code}</TableCell>
              <TableCell>{permission.name || permission.desc || '未命名权限'}</TableCell>
              <TableCell>{permission.kind}</TableCell>
              <TableCell>{permission.allowedScopes.join('、') || '未配置'}</TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={4} text="暂无权限目录" />
        )}
      </TableBody>
    </TableCard>
  );
}

/** 渲染访问控制配置变更审计，不展示账号密钥等敏感信息。 */
function AuditTable({ logs }: { logs: AccessAuditLog[] }) {
  return (
    <TableCard title="授权审计" headers={['时间', '操作人', '动作', '目标', '请求编号']}>
      <TableBody>
        {logs.length ? (
          logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{formatDateTime(log.createdAt)}</TableCell>
              <TableCell>{log.actor.name || log.actor.email}</TableCell>
              <TableCell>{auditActionText[log.action] ?? log.action}</TableCell>
              <TableCell>{`${log.targetType}:${log.targetId}`}</TableCell>
              <TableCell className="font-mono text-xs">{log.requestId}</TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} text="暂无审计记录" />
        )}
      </TableBody>
    </TableCard>
  );
}

/** 递归拍平部门树，供表格和表单保留层级信息。 */
function flattenDepartments(
  departments: AccessDepartmentTreeNode[],
  depth = 0,
): Array<{ department: AccessDepartmentTreeNode; depth: number }> {
  return departments.flatMap((department) => [
    { department, depth },
    ...flattenDepartments(department.children, depth + 1),
  ]);
}

/** 渲染一组紧凑徽标。 */
function BadgeList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (!items.length) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>;
  }

  return (
    <div className="flex max-w-xl flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  );
}

/** 渲染通用表格卡片。 */
function TableCard({
  title,
  headers,
  children,
}: {
  /** 表格中文标题。 */
  title: string;
  /** 表头文案。 */
  headers: string[];
  /** 表格主体。 */
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {children}
        </Table>
      </CardContent>
    </Card>
  );
}

/** 渲染表格空状态。 */
function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

/** 渲染权限管理工作区的加载骨架。 */
function WorkspaceFallback() {
  return (
    <div className="flex flex-col gap-4" aria-label="权限管理数据加载中">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="rounded-md shadow-none">
            <CardHeader className="gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-md" />
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}

/** 将 ISO 时间格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
