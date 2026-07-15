/**
 * 本文件实现用户直接允许、全局拒绝、授权失效时间和授权删除操作。
 */
'use client';

import { useState } from 'react';
import type { AccessPermissionEffect, GrantableDataScope } from '@workspace/contracts/access';

import { AccessActionCard } from './access-action-card';
import {
  ACCESS_ACTION_BUTTON_CLASS_NAME,
  ACCESS_PERMISSION_EFFECT_OPTIONS,
  ACCESS_SCOPE_OPTIONS,
} from './access-management-actions.constants';
import { AccessPendingIcon } from './access-pending-icon';
import { AccessSelectField } from './access-select-field';
import { ExpirationDateTimeField } from './expiration-date-time-field';
import { useAccessAction } from '@/features/access-management/hooks/use-access-action';
import {
  assignDirectPermissionToUser,
  removeDirectPermissionFromUser,
} from '@/features/access-management/services/access-management-client.service';
import type {
  AccessManagementDashboardData,
} from '@/features/access-management/services/access-management-server.service';
import { Button } from '@workspace/ui/components/button';

/** 用户直接授权操作组件属性。 */
type DirectPermissionActionsProps = {
  /** 当前页面已经加载的权限管理数据。 */
  data: AccessManagementDashboardData;
};

/** 渲染用户直接允许、全局拒绝、过期时间和授权删除操作。 */
export function DirectPermissionActions({ data }: DirectPermissionActionsProps) {
  const { pendingAction, message, runAction } = useAccessAction();
  const [userId, setUserId] = useState(data.users[0]?.id.toString() ?? '');
  const selectedUser = data.users.find((user) => user.id.toString() === userId);
  const [permissionId, setPermissionId] = useState(data.permissions[0]?.id.toString() ?? '');
  const selectedPermission = data.permissions.find((permission) => permission.id.toString() === permissionId);
  const [effect, setEffect] = useState<AccessPermissionEffect>('ALLOW');
  const [scopeType, setScopeType] = useState<GrantableDataScope>('ALL');
  const [expiresAt, setExpiresAt] = useState<Date>();
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
      assignDirectPermissionToUser(Number(userId), {
        permissionId: Number(permissionId),
        effect,
        scopeType: effect === 'DENY' ? 'ALL' : scopeType,
        expiresAt: expiresAt?.toISOString() ?? null,
      }),
    );
  }

  /** 删除当前用户所选的直接授权记录。 */
  async function handleRemovePermission() {
    await runAction('remove-direct-permission', '用户直接授权移除成功', () =>
      removeDirectPermissionFromUser(Number(userId), Number(grantId)),
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
      ? ACCESS_SCOPE_OPTIONS.filter((option) => option.value === 'ALL')
      : ACCESS_SCOPE_OPTIONS.filter((option) => selectedPermission?.allowedScopes.includes(option.value));
  const grantOptions =
    selectedUser?.directPermissions.map((grant) => ({
      value: grant.id.toString(),
      label: `${grant.effect}:${grant.permission.code}:${grant.scopeType}`,
    })) ?? [];

  return (
    <AccessActionCard title="用户直接授权" message={message}>
      <AccessSelectField
        id="direct-user"
        label="用户"
        value={userId}
        options={userOptions}
        onChange={handleSelectUser}
      />
      <AccessSelectField
        id="direct-permission"
        label="权限码"
        value={permissionId}
        options={permissionOptions}
        onChange={handleSelectPermission}
      />
      <AccessSelectField
        id="direct-effect"
        label="授权效果"
        value={effect}
        options={ACCESS_PERMISSION_EFFECT_OPTIONS}
        onChange={handleSelectEffect}
      />
      <AccessSelectField
        id="direct-scope"
        label="数据范围"
        value={scopeType}
        options={allowedScopeOptions}
        onChange={(value) => setScopeType(value as GrantableDataScope)}
      />
      <ExpirationDateTimeField value={expiresAt} onChange={setExpiresAt} />
      <Button
        className={ACCESS_ACTION_BUTTON_CLASS_NAME}
        disabled={!userId || !permissionId || !allowedScopeOptions.length || Boolean(pendingAction)}
        onClick={() => void handleAssignPermission()}
      >
        <AccessPendingIcon active={pendingAction === 'assign-direct-permission'} />
        添加直接授权
      </Button>
      <AccessSelectField
        id="direct-current-grant"
        label="已有直接授权"
        value={grantId}
        options={grantOptions}
        onChange={setGrantId}
      />
      <Button
        className={ACCESS_ACTION_BUTTON_CLASS_NAME}
        variant="outline"
        disabled={!grantId || Boolean(pendingAction)}
        onClick={() => void handleRemovePermission()}
      >
        <AccessPendingIcon active={pendingAction === 'remove-direct-permission'} />
        删除所选授权
      </Button>
    </AccessActionCard>
  );
}
