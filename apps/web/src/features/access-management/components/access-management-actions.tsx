/**
 * 本文件实现部门、用户、角色和权限授权的客户端操作表单，所有写入均经由 Next.js BFF 转发。
 */
'use client';

import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  AccessDepartmentTreeNode,
  AccessPermissionEffect,
  AccessUserStatus,
  GrantableDataScope,
} from '@workspace/contracts/access';

import type { AccessManagementCapabilities } from './access-management-page';
import type { AccessManagementDashboardData } from '@/features/access-management/services/access-management-server.service';
import { ApiClientError, requestData } from '@/services/request';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

/** 权限管理操作区属性。 */
type AccessManagementActionsProps = {
  /** 当前页面已加载的数据。 */
  data: AccessManagementDashboardData;
  /** 当前用户可执行的细粒度操作。 */
  capabilities: AccessManagementCapabilities;
};

/** 页面操作后的反馈消息。 */
type ActionMessage = {
  /** 消息展示样式。 */
  type: 'success' | 'error';
  /** 面向用户展示的中文内容。 */
  text: string;
} | null;

/** 下拉选择器使用的一条选项。 */
type SelectOption = {
  /** 提交给接口或本地状态的稳定值。 */
  value: string;
  /** 面向用户展示的中文文案。 */
  label: string;
};

/** 支持写入 JSON 请求体的 BFF 请求参数。 */
type MutationOptions = {
  /** HTTP 方法。 */
  method: 'POST' | 'PATCH' | 'DELETE';
  /** 可选的业务请求体。 */
  body?: unknown;
};

/** 新授权允许使用的数据范围及中文文案。 */
const scopeOptions: Array<{ value: GrantableDataScope; label: string }> = [
  { value: 'ALL', label: '全部数据' },
  { value: 'OWN', label: '本人创建或负责' },
  { value: 'DEPT', label: '本部门' },
  { value: 'DEPT_AND_CHILD', label: '本部门及下级' },
  { value: 'PARTICIPATED', label: '参与的数据' },
];

/** 用户账号状态及中文文案。 */
const userStatusOptions: Array<{ value: AccessUserStatus; label: string }> = [
  { value: 'PENDING', label: '待验证' },
  { value: 'ACTIVE', label: '正常' },
  { value: 'DISABLED', label: '已禁用' },
  { value: 'LOCKED', label: '已锁定' },
];

/** 操作按钮在移动端保持易点击宽度，桌面端按内容收紧并靠右对齐。 */
const actionButtonClassName = 'w-full sm:w-auto sm:min-w-28 sm:justify-self-end';

/** 渲染当前账号有权执行的全部权限管理操作。 */
export function AccessManagementActions({ data, capabilities }: AccessManagementActionsProps) {
  const actionTabs = [
    {
      value: 'departments',
      label: '部门管理',
      visible: capabilities.canCreateDepartment || capabilities.canUpdateDepartment || capabilities.canMoveDepartment,
      content: <DepartmentActions data={data} capabilities={capabilities} />,
    },
    {
      value: 'users',
      label: '用户与角色',
      visible:
        capabilities.canUpdateUserDepartment || capabilities.canUpdateUserStatus || capabilities.canAssignUserRole,
      content: <UserActions data={data} capabilities={capabilities} />,
    },
    {
      value: 'roles',
      label: '角色授权',
      visible: capabilities.canCreateRole || capabilities.canUpdateRole || capabilities.canAssignRolePermission,
      content: <RoleActions data={data} capabilities={capabilities} />,
    },
    {
      value: 'direct-permissions',
      label: '直接授权',
      visible: capabilities.canAssignUserPermission,
      content: <DirectPermissionActions data={data} />,
    },
  ].filter((item) => item.visible);

  if (!actionTabs.length) {
    return null;
  }

  return (
    <section className="rounded-md border bg-card p-3 sm:p-4" aria-labelledby="access-actions-title">
      <div className="mb-4 flex flex-col gap-1">
        <h2 id="access-actions-title" className="text-base font-semibold">
          配置操作
        </h2>
        <p className="text-sm text-muted-foreground">按管理任务切换操作区，避免多组长表单同时占用页面空间。</p>
      </div>
      <Tabs defaultValue={actionTabs[0]?.value}>
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label="权限配置操作分类">
            {actionTabs.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {actionTabs.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-2">
            {item.content}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

/** 渲染部门创建、资料更新、移动和启停操作。 */
function DepartmentActions({ data, capabilities }: AccessManagementActionsProps) {
  const departments = useMemo(() => flattenDepartments(data.departments), [data.departments]);
  const { pendingAction, message, runAction } = useAccessAction();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('NONE');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departments[0]?.department.id.toString() ?? '');
  const selectedDepartment = departments.find(
    ({ department }) => department.id.toString() === selectedDepartmentId,
  )?.department;
  const [updatedName, setUpdatedName] = useState(selectedDepartment?.name ?? '');
  const [moveParentId, setMoveParentId] = useState('NONE');

  /** 创建部门后清空代码和名称输入，避免重复提交相同稳定代码。 */
  async function handleCreateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction('create-department', '部门创建成功', async () => {
      await mutate('/api/access-management/departments', {
        method: 'POST',
        body: {
          code: code.trim(),
          name: name.trim(),
          parentId: parentId === 'NONE' ? null : Number(parentId),
        },
      });
      setCode('');
      setName('');
    });
  }

  /** 切换待管理部门，并把当前名称同步到编辑输入框。 */
  function handleSelectDepartment(value: string) {
    const department = departments.find(({ department }) => department.id.toString() === value)?.department;
    setSelectedDepartmentId(value);
    setUpdatedName(department?.name ?? '');
    setMoveParentId(department?.parentId?.toString() ?? 'NONE');
  }

  /** 修改当前选中部门的中文名称。 */
  async function handleUpdateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDepartmentId) {
      return;
    }

    await runAction('update-department', '部门资料更新成功', () =>
      mutate(`/api/access-management/departments/${selectedDepartmentId}`, {
        method: 'PATCH',
        body: { name: updatedName.trim() },
      }),
    );
  }

  /** 移动当前部门；循环层级和越权范围由后端再次校验。 */
  async function handleMoveDepartment() {
    if (!selectedDepartmentId) {
      return;
    }

    await runAction('move-department', '部门移动成功', () =>
      mutate(`/api/access-management/departments/${selectedDepartmentId}/move`, {
        method: 'PATCH',
        body: { parentId: moveParentId === 'NONE' ? null : Number(moveParentId) },
      }),
    );
  }

  /** 在启用和停用之间切换当前部门状态。 */
  async function handleToggleDepartmentStatus() {
    if (!selectedDepartment) {
      return;
    }

    const status = selectedDepartment.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    await runAction('toggle-department', status === 'ACTIVE' ? '部门已启用' : '部门已停用', () =>
      mutate(`/api/access-management/departments/${selectedDepartment.id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    );
  }

  const departmentOptions = departments.map(({ department, depth }) => ({
    value: department.id.toString(),
    label: `${'　'.repeat(depth)}${department.name}（${department.code}）`,
  }));
  const parentOptions = [{ value: 'NONE', label: '组织根节点' }, ...departmentOptions];

  return (
    <ActionCard title="部门管理" message={message}>
      {capabilities.canCreateDepartment ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleCreateDepartment}>
          <h3 className="text-sm font-medium">创建部门</h3>
          <TextField id="department-code" label="稳定代码" value={code} onChange={setCode} placeholder="PRODUCT" />
          <TextField id="department-name" label="部门名称" value={name} onChange={setName} placeholder="产品部" />
          <SelectField
            id="department-parent"
            label="上级部门"
            value={parentId}
            options={parentOptions}
            onChange={setParentId}
          />
          <Button className={actionButtonClassName} disabled={!code.trim() || !name.trim() || Boolean(pendingAction)}>
            <PendingIcon active={pendingAction === 'create-department'} />
            创建部门
          </Button>
        </form>
      ) : null}

      {departments.length && (capabilities.canUpdateDepartment || capabilities.canMoveDepartment) ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleUpdateDepartment}>
          <h3 className="text-sm font-medium">维护现有部门</h3>
          <SelectField
            id="department-selected"
            label="部门"
            value={selectedDepartmentId}
            options={departmentOptions}
            onChange={handleSelectDepartment}
          />
          {capabilities.canUpdateDepartment ? (
            <>
              <TextField id="department-updated-name" label="部门名称" value={updatedName} onChange={setUpdatedName} />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  className={actionButtonClassName}
                  type="submit"
                  disabled={!updatedName.trim() || Boolean(pendingAction)}
                >
                  <PendingIcon active={pendingAction === 'update-department'} />
                  保存名称
                </Button>
                <Button
                  className={actionButtonClassName}
                  type="button"
                  variant="outline"
                  disabled={Boolean(pendingAction)}
                  onClick={() => void handleToggleDepartmentStatus()}
                >
                  {selectedDepartment?.status === 'ACTIVE' ? '停用部门' : '启用部门'}
                </Button>
              </div>
            </>
          ) : null}
          {capabilities.canMoveDepartment ? (
            <>
              <SelectField
                id="department-move-parent"
                label="移动到"
                value={moveParentId}
                options={parentOptions}
                onChange={setMoveParentId}
              />
              <Button
                className={actionButtonClassName}
                type="button"
                variant="outline"
                disabled={Boolean(pendingAction)}
                onClick={() => void handleMoveDepartment()}
              >
                <PendingIcon active={pendingAction === 'move-department'} />
                移动部门
              </Button>
            </>
          ) : null}
        </form>
      ) : null}
    </ActionCard>
  );
}

/** 渲染用户部门、状态和角色分配操作。 */
function UserActions({ data, capabilities }: AccessManagementActionsProps) {
  const departments = useMemo(() => flattenDepartments(data.departments), [data.departments]);
  const { pendingAction, message, runAction } = useAccessAction();
  const [userId, setUserId] = useState(data.users[0]?.id.toString() ?? '');
  const selectedUser = data.users.find((user) => user.id.toString() === userId);
  const [departmentId, setDepartmentId] = useState(selectedUser?.deptId?.toString() ?? 'NONE');
  const [status, setStatus] = useState<AccessUserStatus>(selectedUser?.status ?? 'ACTIVE');
  const [roleId, setRoleId] = useState(data.roles[0]?.id.toString() ?? '');
  const [assignedRoleId, setAssignedRoleId] = useState(selectedUser?.roles[0]?.id.toString() ?? '');

  /** 切换用户时同步其当前部门、状态和已有角色。 */
  function handleSelectUser(value: string) {
    const user = data.users.find((item) => item.id.toString() === value);
    setUserId(value);
    setDepartmentId(user?.deptId?.toString() ?? 'NONE');
    setStatus(user?.status ?? 'ACTIVE');
    setAssignedRoleId(user?.roles[0]?.id.toString() ?? '');
  }

  /** 把用户调动到目标启用部门，或清除其主部门。 */
  async function handleUpdateDepartment() {
    await runAction('user-department', '用户部门更新成功', () =>
      mutate(`/api/access-management/users/${userId}/department`, {
        method: 'PATCH',
        body: { departmentId: departmentId === 'NONE' ? null : Number(departmentId) },
      }),
    );
  }

  /** 更新用户状态；最后一个有效超级管理员保护由后端执行。 */
  async function handleUpdateStatus() {
    await runAction('user-status', '用户状态更新成功', () =>
      mutate(`/api/access-management/users/${userId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    );
  }

  /** 为当前用户绑定所选角色。 */
  async function handleAssignRole() {
    await runAction('assign-user-role', '角色分配成功', () =>
      mutate(`/api/access-management/users/${userId}/roles`, {
        method: 'POST',
        body: { roleId: Number(roleId) },
      }),
    );
  }

  /** 从当前用户解绑所选角色。 */
  async function handleRemoveRole() {
    await runAction('remove-user-role', '角色解除成功', () =>
      mutate(`/api/access-management/users/${userId}/roles/${assignedRoleId}`, {
        method: 'DELETE',
      }),
    );
  }

  const userOptions = data.users.map((user) => ({
    value: user.id.toString(),
    label: `${user.name || '未命名'}（${user.email}）`,
  }));
  const departmentOptions = [
    { value: 'NONE', label: '不分配部门' },
    ...departments
      .filter(({ department }) => department.status === 'ACTIVE')
      .map(({ department, depth }) => ({
        value: department.id.toString(),
        label: `${'　'.repeat(depth)}${department.name}`,
      })),
  ];
  const roleOptions = data.roles.map((role) => ({ value: role.id.toString(), label: role.name }));
  const assignedRoleOptions =
    selectedUser?.roles.map((role) => ({ value: role.id.toString(), label: role.name })) ?? [];

  return (
    <ActionCard title="用户归属与角色" message={message}>
      <SelectField id="access-user" label="用户" value={userId} options={userOptions} onChange={handleSelectUser} />
      {capabilities.canUpdateUserDepartment ? (
        <div className="grid gap-3 rounded-md border p-3">
          <SelectField
            id="access-user-department"
            label="主部门"
            value={departmentId}
            options={departmentOptions}
            onChange={setDepartmentId}
          />
          <Button
            className={actionButtonClassName}
            disabled={!userId || Boolean(pendingAction)}
            onClick={() => void handleUpdateDepartment()}
          >
            <PendingIcon active={pendingAction === 'user-department'} />
            保存部门归属
          </Button>
        </div>
      ) : null}
      {capabilities.canUpdateUserStatus ? (
        <div className="grid gap-3 rounded-md border p-3">
          <SelectField
            id="access-user-status"
            label="账号状态"
            value={status}
            options={userStatusOptions}
            onChange={(value) => setStatus(value as AccessUserStatus)}
          />
          <Button
            className={actionButtonClassName}
            variant="outline"
            disabled={!userId || Boolean(pendingAction)}
            onClick={() => void handleUpdateStatus()}
          >
            <PendingIcon active={pendingAction === 'user-status'} />
            更新账号状态
          </Button>
        </div>
      ) : null}
      {capabilities.canAssignUserRole ? (
        <div className="grid gap-3 rounded-md border p-3">
          <SelectField
            id="access-user-role"
            label="可分配角色"
            value={roleId}
            options={roleOptions}
            onChange={setRoleId}
          />
          <Button
            className={actionButtonClassName}
            disabled={!userId || !roleId || Boolean(pendingAction)}
            onClick={() => void handleAssignRole()}
          >
            <PendingIcon active={pendingAction === 'assign-user-role'} />
            分配角色
          </Button>
          <SelectField
            id="access-user-assigned-role"
            label="已绑定角色"
            value={assignedRoleId}
            options={assignedRoleOptions}
            onChange={setAssignedRoleId}
          />
          <Button
            className={actionButtonClassName}
            variant="outline"
            disabled={!userId || !assignedRoleId || Boolean(pendingAction)}
            onClick={() => void handleRemoveRole()}
          >
            <PendingIcon active={pendingAction === 'remove-user-role'} />
            解除所选角色
          </Button>
        </div>
      ) : null}
    </ActionCard>
  );
}

/** 渲染自定义角色创建、修改、删除与权限范围配置。 */
function RoleActions({ data, capabilities }: AccessManagementActionsProps) {
  const customRoles = data.roles.filter((role) => !role.isSystem);
  const { pendingAction, message, runAction } = useAccessAction();
  const [roleCode, setRoleCode] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleId, setRoleId] = useState(customRoles[0]?.id.toString() ?? '');
  const selectedRole = customRoles.find((role) => role.id.toString() === roleId);
  const [updatedRoleName, setUpdatedRoleName] = useState(selectedRole?.name ?? '');
  const [updatedRoleDescription, setUpdatedRoleDescription] = useState(selectedRole?.desc ?? '');
  const [permissionId, setPermissionId] = useState(data.permissions[0]?.id.toString() ?? '');
  const selectedPermission = data.permissions.find((permission) => permission.id.toString() === permissionId);
  const [scopeType, setScopeType] = useState<GrantableDataScope>('ALL');
  const [grantId, setGrantId] = useState(selectedRole?.grants[0]?.id.toString() ?? '');

  /** 创建由管理员维护的自定义角色。 */
  async function handleCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction('create-role', '自定义角色创建成功', async () => {
      await mutate('/api/access-management/roles', {
        method: 'POST',
        body: {
          code: roleCode.trim(),
          name: roleName.trim(),
          desc: roleDescription.trim() || undefined,
        },
      });
      setRoleCode('');
      setRoleName('');
      setRoleDescription('');
    });
  }

  /** 切换自定义角色并同步其当前资料和授权记录。 */
  function handleSelectRole(value: string) {
    const role = customRoles.find((item) => item.id.toString() === value);
    setRoleId(value);
    setUpdatedRoleName(role?.name ?? '');
    setUpdatedRoleDescription(role?.desc ?? '');
    setGrantId(role?.grants[0]?.id.toString() ?? '');
  }

  /** 保存自定义角色的中文名称和说明。 */
  async function handleUpdateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction('update-role', '角色资料更新成功', () =>
      mutate(`/api/access-management/roles/${roleId}`, {
        method: 'PATCH',
        body: {
          name: updatedRoleName.trim(),
          desc: updatedRoleDescription.trim() || null,
        },
      }),
    );
  }

  /** 删除没有成员绑定的自定义角色。 */
  async function handleDeleteRole() {
    await runAction('delete-role', '自定义角色删除成功', () =>
      mutate(`/api/access-management/roles/${roleId}`, { method: 'DELETE' }),
    );
  }

  /** 为自定义角色增加一条独立的数据范围授权。 */
  async function handleAssignPermission() {
    await runAction('assign-role-permission', '角色权限范围添加成功', () =>
      mutate(`/api/access-management/roles/${roleId}/permissions`, {
        method: 'POST',
        body: { permissionId: Number(permissionId), scopeType },
      }),
    );
  }

  /** 按授权记录主键删除所选角色权限范围。 */
  async function handleRemovePermission() {
    await runAction('remove-role-permission', '角色权限范围移除成功', () =>
      mutate(`/api/access-management/roles/${roleId}/permissions/${grantId}`, {
        method: 'DELETE',
      }),
    );
  }

  const customRoleOptions = customRoles.map((role) => ({
    value: role.id.toString(),
    label: `${role.name}（${role.code}）`,
  }));
  const permissionOptions = data.permissions.map((permission) => ({
    value: permission.id.toString(),
    label: permission.code,
  }));
  const allowedScopeOptions = scopeOptions.filter((option) => selectedPermission?.allowedScopes.includes(option.value));
  const grantOptions =
    selectedRole?.grants.map((grant) => ({
      value: grant.id.toString(),
      label: `${grant.permission.code}:${grant.scopeType}`,
    })) ?? [];

  /** 切换权限码时将范围重置到该权限允许的第一项。 */
  function handleSelectPermission(value: string) {
    const permission = data.permissions.find((item) => item.id.toString() === value);
    setPermissionId(value);
    setScopeType(permission?.allowedScopes[0] ?? 'ALL');
  }

  return (
    <ActionCard title="自定义角色与范围授权" message={message}>
      {capabilities.canCreateRole ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleCreateRole}>
          <h3 className="text-sm font-medium">创建自定义角色</h3>
          <TextField
            id="role-code"
            label="稳定代码"
            value={roleCode}
            onChange={setRoleCode}
            placeholder="PROJECT_REVIEWER"
          />
          <TextField id="role-name" label="角色名称" value={roleName} onChange={setRoleName} placeholder="项目评审人" />
          <TextField
            id="role-description"
            label="角色说明"
            value={roleDescription}
            onChange={setRoleDescription}
            placeholder="负责评审指定决策"
          />
          <Button
            className={actionButtonClassName}
            disabled={!roleCode.trim() || !roleName.trim() || Boolean(pendingAction)}
          >
            <PendingIcon active={pendingAction === 'create-role'} />
            创建角色
          </Button>
        </form>
      ) : null}

      {customRoles.length ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleUpdateRole}>
          <SelectField
            id="custom-role"
            label="自定义角色"
            value={roleId}
            options={customRoleOptions}
            onChange={handleSelectRole}
          />
          {capabilities.canUpdateRole ? (
            <>
              <TextField
                id="updated-role-name"
                label="角色名称"
                value={updatedRoleName}
                onChange={setUpdatedRoleName}
              />
              <TextField
                id="updated-role-description"
                label="角色说明"
                value={updatedRoleDescription}
                onChange={setUpdatedRoleDescription}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button className={actionButtonClassName} disabled={!updatedRoleName.trim() || Boolean(pendingAction)}>
                  <PendingIcon active={pendingAction === 'update-role'} />
                  保存角色
                </Button>
                <Button
                  className={actionButtonClassName}
                  type="button"
                  variant="outline"
                  disabled={!roleId || Boolean(pendingAction)}
                  onClick={() => void handleDeleteRole()}
                >
                  <PendingIcon active={pendingAction === 'delete-role'} />
                  删除角色
                </Button>
              </div>
            </>
          ) : null}
          {capabilities.canAssignRolePermission ? (
            <div className="grid gap-3 border-t pt-3">
              <SelectField
                id="role-permission"
                label="权限码"
                value={permissionId}
                options={permissionOptions}
                onChange={handleSelectPermission}
              />
              <SelectField
                id="role-permission-scope"
                label="数据范围"
                value={scopeType}
                options={allowedScopeOptions}
                onChange={(value) => setScopeType(value as GrantableDataScope)}
              />
              <Button
                className={actionButtonClassName}
                type="button"
                disabled={!roleId || !permissionId || !allowedScopeOptions.length || Boolean(pendingAction)}
                onClick={() => void handleAssignPermission()}
              >
                <PendingIcon active={pendingAction === 'assign-role-permission'} />
                添加权限范围
              </Button>
              <SelectField
                id="role-current-grant"
                label="已有授权记录"
                value={grantId}
                options={grantOptions}
                onChange={setGrantId}
              />
              <Button
                className={actionButtonClassName}
                type="button"
                variant="outline"
                disabled={!grantId || Boolean(pendingAction)}
                onClick={() => void handleRemovePermission()}
              >
                <PendingIcon active={pendingAction === 'remove-role-permission'} />
                移除所选授权
              </Button>
            </div>
          ) : null}
        </form>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          暂无自定义角色。系统角色由代码目录同步，不能在页面修改。
        </p>
      )}
    </ActionCard>
  );
}

/** 渲染用户直接允许、全局拒绝、过期时间和授权删除操作。 */
function DirectPermissionActions({ data }: { data: AccessManagementDashboardData }) {
  const { pendingAction, message, runAction } = useAccessAction();
  const [userId, setUserId] = useState(data.users[0]?.id.toString() ?? '');
  const selectedUser = data.users.find((user) => user.id.toString() === userId);
  const [permissionId, setPermissionId] = useState(data.permissions[0]?.id.toString() ?? '');
  const selectedPermission = data.permissions.find((permission) => permission.id.toString() === permissionId);
  const [effect, setEffect] = useState<AccessPermissionEffect>('ALLOW');
  const [scopeType, setScopeType] = useState<GrantableDataScope>('ALL');
  const [expiresAt, setExpiresAt] = useState('');
  const [grantId, setGrantId] = useState(selectedUser?.directPermissions[0]?.id.toString() ?? '');

  /** 切换用户时同步其可删除的直接授权记录。 */
  function handleSelectUser(value: string) {
    const user = data.users.find((item) => item.id.toString() === value);
    setUserId(value);
    setGrantId(user?.directPermissions[0]?.id.toString() ?? '');
  }

  /** 切换权限码时同步该权限允许的数据范围。 */
  function handleSelectPermission(value: string) {
    const permission = data.permissions.find((item) => item.id.toString() === value);
    setPermissionId(value);
    setScopeType(permission?.allowedScopes[0] ?? 'ALL');
  }

  /** 切换为拒绝授权时强制使用 ALL，表达对整个权限码的全局拒绝。 */
  function handleSelectEffect(value: string) {
    const nextEffect = value as AccessPermissionEffect;
    setEffect(nextEffect);
    if (nextEffect === 'DENY') {
      setScopeType('ALL');
    }
  }

  /** 添加用户直接允许或全局拒绝授权。 */
  async function handleAssignPermission() {
    await runAction('assign-direct-permission', '用户直接授权添加成功', () =>
      mutate(`/api/access-management/users/${userId}/permissions`, {
        method: 'POST',
        body: {
          permissionId: Number(permissionId),
          effect,
          scopeType: effect === 'DENY' ? 'ALL' : scopeType,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    );
  }

  /** 删除当前用户所选的直接授权记录。 */
  async function handleRemovePermission() {
    await runAction('remove-direct-permission', '用户直接授权移除成功', () =>
      mutate(`/api/access-management/users/${userId}/permissions/${grantId}`, {
        method: 'DELETE',
      }),
    );
  }

  const userOptions = data.users.map((user) => ({
    value: user.id.toString(),
    label: `${user.name || '未命名'}（${user.email}）`,
  }));
  const permissionOptions = data.permissions.map((permission) => ({
    value: permission.id.toString(),
    label: permission.code,
  }));
  const allowedScopeOptions =
    effect === 'DENY'
      ? scopeOptions.filter((option) => option.value === 'ALL')
      : scopeOptions.filter((option) => selectedPermission?.allowedScopes.includes(option.value));
  const grantOptions =
    selectedUser?.directPermissions.map((grant) => ({
      value: grant.id.toString(),
      label: `${grant.effect}:${grant.permission.code}:${grant.scopeType}`,
    })) ?? [];

  return (
    <ActionCard title="用户直接授权" message={message}>
      <SelectField id="direct-user" label="用户" value={userId} options={userOptions} onChange={handleSelectUser} />
      <SelectField
        id="direct-permission"
        label="权限码"
        value={permissionId}
        options={permissionOptions}
        onChange={handleSelectPermission}
      />
      <SelectField
        id="direct-effect"
        label="授权效果"
        value={effect}
        options={[
          { value: 'ALLOW', label: '允许' },
          { value: 'DENY', label: '全局拒绝（优先级最高）' },
        ]}
        onChange={handleSelectEffect}
      />
      <SelectField
        id="direct-scope"
        label="数据范围"
        value={scopeType}
        options={allowedScopeOptions}
        onChange={(value) => setScopeType(value as GrantableDataScope)}
      />
      <div className="grid gap-2">
        <Label htmlFor="direct-expires-at">失效时间（可选）</Label>
        <Input
          id="direct-expires-at"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.currentTarget.value)}
        />
      </div>
      <Button
        className={actionButtonClassName}
        disabled={!userId || !permissionId || !allowedScopeOptions.length || Boolean(pendingAction)}
        onClick={() => void handleAssignPermission()}
      >
        <PendingIcon active={pendingAction === 'assign-direct-permission'} />
        添加直接授权
      </Button>
      <SelectField
        id="direct-current-grant"
        label="已有直接授权"
        value={grantId}
        options={grantOptions}
        onChange={setGrantId}
      />
      <Button
        className={actionButtonClassName}
        variant="outline"
        disabled={!grantId || Boolean(pendingAction)}
        onClick={() => void handleRemovePermission()}
      >
        <PendingIcon active={pendingAction === 'remove-direct-permission'} />
        删除所选授权
      </Button>
    </ActionCard>
  );
}

/** 管理异步写操作的加载状态、统一错误提示和页面数据刷新。 */
function useAccessAction() {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState('');
  const [message, setMessage] = useState<ActionMessage>(null);

  /** 串行执行一次写操作，并在成功后刷新 Server Component 数据。 */
  async function runAction(action: string, successMessage: string, callback: () => Promise<void>) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action);
    setMessage(null);

    try {
      await callback();
      setMessage({ type: 'success', text: successMessage });
      router.refresh();
    } catch (error) {
      const requestId = error instanceof ApiClientError ? error.requestId : undefined;
      const baseMessage = error instanceof Error ? error.message : '操作失败，请稍后再试';
      setMessage({
        type: 'error',
        text: requestId ? `${baseMessage}（请求编号：${requestId}）` : baseMessage,
      });
    } finally {
      setPendingAction('');
    }
  }

  return { pendingAction, message, runAction };
}

/** 调用权限管理 BFF，并要求返回统一成功响应。 */
async function mutate(url: string, options: MutationOptions): Promise<void> {
  await requestData<unknown>(url, {
    method: options.method,
    body: options.body,
    errorMessage: '权限配置操作失败，请稍后重试',
  });
}

/** 渲染一张权限管理操作卡片。 */
function ActionCard({
  title,
  message,
  children,
}: {
  /** 卡片中文标题。 */
  title: string;
  /** 当前卡片最近一次操作反馈。 */
  message: ActionMessage;
  /** 卡片表单内容。 */
  children: ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-4xl rounded-md shadow-none">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {message ? (
          <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>
            {message.text}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

/** 渲染带中文标签的文本输入框。 */
function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  /** 表单控件唯一标识。 */
  id: string;
  /** 字段中文标签。 */
  label: string;
  /** 当前输入值。 */
  value: string;
  /** 可选的中文占位说明。 */
  placeholder?: string;
  /** 输入变更回调。 */
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

/** 渲染复用 shadcn/Radix Select 的中文选择字段。 */
function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  /** 表单控件唯一标识。 */
  id: string;
  /** 字段中文标签。 */
  label: string;
  /** 当前选中值。 */
  value: string;
  /** 下拉选项。 */
  options: readonly SelectOption[];
  /** 选中值变更回调。 */
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={!options.length}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="暂无可选数据" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 渲染正在提交的旋转图标。 */
function PendingIcon({ active }: { active: boolean }) {
  return active ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null;
}

/** 递归拍平部门树，同时保留深度供下拉选项显示层级。 */
function flattenDepartments(
  departments: AccessDepartmentTreeNode[],
  depth = 0,
): Array<{ department: AccessDepartmentTreeNode; depth: number }> {
  return departments.flatMap((department) => [
    { department, depth },
    ...flattenDepartments(department.children, depth + 1),
  ]);
}
