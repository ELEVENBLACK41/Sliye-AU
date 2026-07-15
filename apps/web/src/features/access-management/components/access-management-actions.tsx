/**
 * 本文件负责权限管理操作区的能力判断、分类导航和各业务操作组件组合。
 */
'use client';

import type { ReactNode } from 'react';

import { DepartmentActions } from './department-actions';
import { DirectPermissionActions } from './direct-permission-actions';
import { RoleActions } from './role-actions';
import { UserActions } from './user-actions';
import type { AccessManagementActionsProps } from './access-management-actions.types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

/** 权限管理操作分类配置。 */
type AccessActionTab = {
  /** 分类稳定值。 */
  value: string;
  /** 分类中文标签。 */
  label: string;
  /** 当前用户是否可以看到该分类。 */
  visible: boolean;
  /** 分类对应的业务操作组件。 */
  content: ReactNode;
};

/** 渲染当前账号有权执行的全部权限管理操作。 */
export function AccessManagementActions({ data, capabilities }: AccessManagementActionsProps) {
  const actionTabs: AccessActionTab[] = [
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
  ];
  const visibleActionTabs = actionTabs.filter((item) => item.visible);

  if (!visibleActionTabs.length) {
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
      <Tabs defaultValue={visibleActionTabs[0]?.value}>
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label="权限配置操作分类">
            {visibleActionTabs.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {visibleActionTabs.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-2">
            {item.content}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
