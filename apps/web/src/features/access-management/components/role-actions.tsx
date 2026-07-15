/**
 * 本文件实现自定义角色的创建、资料维护、删除和权限范围配置。
 */
'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import type { GrantableDataScope } from '@workspace/contracts/access';

import { AccessActionCard } from './access-action-card';
import {
  ACCESS_ACTION_BUTTON_CLASS_NAME,
  ACCESS_SCOPE_OPTIONS,
} from './access-management-actions.constants';
import type { AccessManagementActionsProps } from './access-management-actions.types';
import { AccessPendingIcon } from './access-pending-icon';
import { AccessSelectField } from './access-select-field';
import { AccessTextField } from './access-text-field';
import { useAccessAction } from '@/features/access-management/hooks/use-access-action';
import {
  assignPermissionToRole,
  createRole,
  deleteRole,
  removePermissionFromRole,
  updateRole,
} from '@/features/access-management/services/access-management-client.service';
import { Button } from '@workspace/ui/components/button';

/** 渲染自定义角色创建、修改、删除与权限范围配置。 */
export function RoleActions({ data, capabilities }: AccessManagementActionsProps) {
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
      await createRole({
        code: roleCode.trim(),
        name: roleName.trim(),
        desc: roleDescription.trim() || undefined,
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
      updateRole(Number(roleId), {
        name: updatedRoleName.trim(),
        desc: updatedRoleDescription.trim() || null,
      }),
    );
  }

  /** 删除没有成员绑定的自定义角色。 */
  async function handleDeleteRole() {
    await runAction('delete-role', '自定义角色删除成功', () => deleteRole(Number(roleId)));
  }

  /** 为自定义角色增加一条独立的数据范围授权。 */
  async function handleAssignPermission() {
    await runAction('assign-role-permission', '角色权限范围添加成功', () =>
      assignPermissionToRole(Number(roleId), { permissionId: Number(permissionId), scopeType }),
    );
  }

  /** 按授权记录主键删除所选角色权限范围。 */
  async function handleRemovePermission() {
    await runAction('remove-role-permission', '角色权限范围移除成功', () =>
      removePermissionFromRole(Number(roleId), Number(grantId)),
    );
  }

  /** 切换权限码时将范围重置到该权限允许的第一项。 */
  function handleSelectPermission(value: string) {
    const permission = data.permissions.find((item) => item.id.toString() === value);
    setPermissionId(value);
    setScopeType(permission?.allowedScopes[0] ?? 'ALL');
  }

  const customRoleOptions = customRoles.map((role) => ({
    value: role.id.toString(),
    label: `${role.name}（${role.code}）`,
  }));
  const permissionOptions = data.permissions.map((permission) => ({
    value: permission.id.toString(),
    label: permission.code,
  }));
  const allowedScopeOptions = ACCESS_SCOPE_OPTIONS.filter((option) =>
    selectedPermission?.allowedScopes.includes(option.value),
  );
  const grantOptions =
    selectedRole?.grants.map((grant) => ({
      value: grant.id.toString(),
      label: `${grant.permission.code}:${grant.scopeType}`,
    })) ?? [];

  return (
    <AccessActionCard title="自定义角色与范围授权" message={message}>
      {capabilities.canCreateRole ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleCreateRole}>
          <h3 className="text-sm font-medium">创建自定义角色</h3>
          <AccessTextField
            id="role-code"
            label="稳定代码"
            value={roleCode}
            onChange={setRoleCode}
            placeholder="PROJECT_REVIEWER"
          />
          <AccessTextField
            id="role-name"
            label="角色名称"
            value={roleName}
            onChange={setRoleName}
            placeholder="项目评审人"
          />
          <AccessTextField
            id="role-description"
            label="角色说明"
            value={roleDescription}
            onChange={setRoleDescription}
            placeholder="负责评审指定决策"
          />
          <Button
            className={ACCESS_ACTION_BUTTON_CLASS_NAME}
            disabled={!roleCode.trim() || !roleName.trim() || Boolean(pendingAction)}
          >
            <AccessPendingIcon active={pendingAction === 'create-role'} />
            创建角色
          </Button>
        </form>
      ) : null}

      {customRoles.length ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleUpdateRole}>
          <AccessSelectField
            id="custom-role"
            label="自定义角色"
            value={roleId}
            options={customRoleOptions}
            onChange={handleSelectRole}
          />
          {capabilities.canUpdateRole ? (
            <>
              <AccessTextField
                id="updated-role-name"
                label="角色名称"
                value={updatedRoleName}
                onChange={setUpdatedRoleName}
              />
              <AccessTextField
                id="updated-role-description"
                label="角色说明"
                value={updatedRoleDescription}
                onChange={setUpdatedRoleDescription}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  className={ACCESS_ACTION_BUTTON_CLASS_NAME}
                  disabled={!updatedRoleName.trim() || Boolean(pendingAction)}
                >
                  <AccessPendingIcon active={pendingAction === 'update-role'} />
                  保存角色
                </Button>
                <Button
                  className={ACCESS_ACTION_BUTTON_CLASS_NAME}
                  type="button"
                  variant="outline"
                  disabled={!roleId || Boolean(pendingAction)}
                  onClick={() => void handleDeleteRole()}
                >
                  <AccessPendingIcon active={pendingAction === 'delete-role'} />
                  删除角色
                </Button>
              </div>
            </>
          ) : null}
          {capabilities.canAssignRolePermission ? (
            <div className="grid gap-3 border-t pt-3">
              <AccessSelectField
                id="role-permission"
                label="权限码"
                value={permissionId}
                options={permissionOptions}
                onChange={handleSelectPermission}
              />
              <AccessSelectField
                id="role-permission-scope"
                label="数据范围"
                value={scopeType}
                options={allowedScopeOptions}
                onChange={(value) => setScopeType(value as GrantableDataScope)}
              />
              <Button
                className={ACCESS_ACTION_BUTTON_CLASS_NAME}
                type="button"
                disabled={!roleId || !permissionId || !allowedScopeOptions.length || Boolean(pendingAction)}
                onClick={() => void handleAssignPermission()}
              >
                <AccessPendingIcon active={pendingAction === 'assign-role-permission'} />
                添加权限范围
              </Button>
              <AccessSelectField
                id="role-current-grant"
                label="已有授权记录"
                value={grantId}
                options={grantOptions}
                onChange={setGrantId}
              />
              <Button
                className={ACCESS_ACTION_BUTTON_CLASS_NAME}
                type="button"
                variant="outline"
                disabled={!grantId || Boolean(pendingAction)}
                onClick={() => void handleRemovePermission()}
              >
                <AccessPendingIcon active={pendingAction === 'remove-role-permission'} />
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
    </AccessActionCard>
  );
}
