/**
 * 本文件实现权限管理中的用户部门、账号状态和角色绑定操作。
 */
'use client';

import { useMemo, useState } from 'react';
import type { AccessUserStatus } from '@workspace/contracts/access';

import { AccessActionCard } from './access-action-card';
import {
  ACCESS_ACTION_BUTTON_CLASS_NAME,
  ACCESS_USER_STATUS_OPTIONS,
} from './access-management-actions.constants';
import type { AccessManagementActionsProps } from './access-management-actions.types';
import { AccessPendingIcon } from './access-pending-icon';
import { AccessSelectField } from './access-select-field';
import { useAccessAction } from '@/features/access-management/hooks/use-access-action';
import {
  assignRoleToUser,
  removeRoleFromUser,
  updateAccessUserStatus,
  updateUserDepartment,
} from '@/features/access-management/services/access-management-client.service';
import { flattenDepartments } from '@/features/access-management/utils/flatten-departments';
import { Button } from '@workspace/ui/components/button';

/** 渲染用户部门、状态和角色分配操作。 */
export function UserActions({ data, capabilities }: AccessManagementActionsProps) {
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
      updateUserDepartment(Number(userId), {
        departmentId: departmentId === 'NONE' ? null : Number(departmentId),
      }),
    );
  }

  /** 更新用户状态；最后一个有效超级管理员保护由后端执行。 */
  async function handleUpdateStatus() {
    await runAction('user-status', '用户状态更新成功', () =>
      updateAccessUserStatus(Number(userId), { status }),
    );
  }

  /** 为当前用户绑定所选角色。 */
  async function handleAssignRole() {
    await runAction('assign-user-role', '角色分配成功', () =>
      assignRoleToUser(Number(userId), { roleId: Number(roleId) }),
    );
  }

  /** 从当前用户解绑所选角色。 */
  async function handleRemoveRole() {
    await runAction('remove-user-role', '角色解除成功', () =>
      removeRoleFromUser(Number(userId), Number(assignedRoleId)),
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
    <AccessActionCard title="用户归属与角色" message={message}>
      <AccessSelectField
        id="access-user"
        label="用户"
        value={userId}
        options={userOptions}
        onChange={handleSelectUser}
      />
      {capabilities.canUpdateUserDepartment ? (
        <div className="grid gap-3 rounded-md border p-3">
          <AccessSelectField
            id="access-user-department"
            label="主部门"
            value={departmentId}
            options={departmentOptions}
            onChange={setDepartmentId}
          />
          <Button
            className={ACCESS_ACTION_BUTTON_CLASS_NAME}
            disabled={!userId || Boolean(pendingAction)}
            onClick={() => void handleUpdateDepartment()}
          >
            <AccessPendingIcon active={pendingAction === 'user-department'} />
            保存部门归属
          </Button>
        </div>
      ) : null}
      {capabilities.canUpdateUserStatus ? (
        <div className="grid gap-3 rounded-md border p-3">
          <AccessSelectField
            id="access-user-status"
            label="账号状态"
            value={status}
            options={ACCESS_USER_STATUS_OPTIONS}
            onChange={(value) => setStatus(value as AccessUserStatus)}
          />
          <Button
            className={ACCESS_ACTION_BUTTON_CLASS_NAME}
            variant="outline"
            disabled={!userId || Boolean(pendingAction)}
            onClick={() => void handleUpdateStatus()}
          >
            <AccessPendingIcon active={pendingAction === 'user-status'} />
            更新账号状态
          </Button>
        </div>
      ) : null}
      {capabilities.canAssignUserRole ? (
        <div className="grid gap-3 rounded-md border p-3">
          <AccessSelectField
            id="access-user-role"
            label="可分配角色"
            value={roleId}
            options={roleOptions}
            onChange={setRoleId}
          />
          <Button
            className={ACCESS_ACTION_BUTTON_CLASS_NAME}
            disabled={!userId || !roleId || Boolean(pendingAction)}
            onClick={() => void handleAssignRole()}
          >
            <AccessPendingIcon active={pendingAction === 'assign-user-role'} />
            分配角色
          </Button>
          <AccessSelectField
            id="access-user-assigned-role"
            label="已绑定角色"
            value={assignedRoleId}
            options={assignedRoleOptions}
            onChange={setAssignedRoleId}
          />
          <Button
            className={ACCESS_ACTION_BUTTON_CLASS_NAME}
            variant="outline"
            disabled={!userId || !assignedRoleId || Boolean(pendingAction)}
            onClick={() => void handleRemoveRole()}
          >
            <AccessPendingIcon active={pendingAction === 'remove-user-role'} />
            解除所选角色
          </Button>
        </div>
      ) : null}
    </AccessActionCard>
  );
}
