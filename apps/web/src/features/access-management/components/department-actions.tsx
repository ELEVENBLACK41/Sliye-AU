/**
 * 本文件实现权限管理中的部门创建、资料更新、层级移动和启停操作。
 */
'use client';

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';

import { AccessActionCard } from './access-action-card';
import { ACCESS_ACTION_BUTTON_CLASS_NAME } from './access-management-actions.constants';
import type { AccessManagementActionsProps } from './access-management-actions.types';
import { AccessPendingIcon } from './access-pending-icon';
import { AccessSelectField } from './access-select-field';
import { AccessTextField } from './access-text-field';
import { useAccessAction } from '@/features/access-management/hooks/use-access-action';
import {
  createDepartment,
  moveDepartment,
  updateDepartment,
  updateDepartmentStatus,
} from '@/features/access-management/services/access-management-client.service';
import { flattenDepartments } from '@/features/access-management/utils/flatten-departments';
import { Button } from '@workspace/ui/components/button';

/** 渲染部门创建、资料更新、移动和启停操作。 */
export function DepartmentActions({ data, capabilities }: AccessManagementActionsProps) {
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
      await createDepartment({
        code: code.trim(),
        name: name.trim(),
        parentId: parentId === 'NONE' ? null : Number(parentId),
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
      updateDepartment(Number(selectedDepartmentId), { name: updatedName.trim() }),
    );
  }

  /** 移动当前部门；循环层级和越权范围由后端再次校验。 */
  async function handleMoveDepartment() {
    if (!selectedDepartmentId) {
      return;
    }

    await runAction('move-department', '部门移动成功', () =>
      moveDepartment(Number(selectedDepartmentId), {
        parentId: moveParentId === 'NONE' ? null : Number(moveParentId),
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
      updateDepartmentStatus(selectedDepartment.id, { status }),
    );
  }

  const departmentOptions = departments.map(({ department, depth }) => ({
    value: department.id.toString(),
    label: `${'　'.repeat(depth)}${department.name}（${department.code}）`,
  }));
  const parentOptions = [{ value: 'NONE', label: '组织根节点' }, ...departmentOptions];

  return (
    <AccessActionCard title="部门管理" message={message}>
      {capabilities.canCreateDepartment ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleCreateDepartment}>
          <h3 className="text-sm font-medium">创建部门</h3>
          <AccessTextField
            id="department-code"
            label="稳定代码"
            value={code}
            onChange={setCode}
            placeholder="PRODUCT"
          />
          <AccessTextField
            id="department-name"
            label="部门名称"
            value={name}
            onChange={setName}
            placeholder="产品部"
          />
          <AccessSelectField
            id="department-parent"
            label="上级部门"
            value={parentId}
            options={parentOptions}
            onChange={setParentId}
          />
          <Button
            className={ACCESS_ACTION_BUTTON_CLASS_NAME}
            disabled={!code.trim() || !name.trim() || Boolean(pendingAction)}
          >
            <AccessPendingIcon active={pendingAction === 'create-department'} />
            创建部门
          </Button>
        </form>
      ) : null}

      {departments.length && (capabilities.canUpdateDepartment || capabilities.canMoveDepartment) ? (
        <form className="grid gap-3 rounded-md border p-3" onSubmit={handleUpdateDepartment}>
          <h3 className="text-sm font-medium">维护现有部门</h3>
          <AccessSelectField
            id="department-selected"
            label="部门"
            value={selectedDepartmentId}
            options={departmentOptions}
            onChange={handleSelectDepartment}
          />
          {capabilities.canUpdateDepartment ? (
            <>
              <AccessTextField
                id="department-updated-name"
                label="部门名称"
                value={updatedName}
                onChange={setUpdatedName}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  className={ACCESS_ACTION_BUTTON_CLASS_NAME}
                  type="submit"
                  disabled={!updatedName.trim() || Boolean(pendingAction)}
                >
                  <AccessPendingIcon active={pendingAction === 'update-department'} />
                  保存名称
                </Button>
                <Button
                  className={ACCESS_ACTION_BUTTON_CLASS_NAME}
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
              <AccessSelectField
                id="department-move-parent"
                label="移动到"
                value={moveParentId}
                options={parentOptions}
                onChange={setMoveParentId}
              />
              <Button
                className={ACCESS_ACTION_BUTTON_CLASS_NAME}
                type="button"
                variant="outline"
                disabled={Boolean(pendingAction)}
                onClick={() => void handleMoveDepartment()}
              >
                <AccessPendingIcon active={pendingAction === 'move-department'} />
                移动部门
              </Button>
            </>
          ) : null}
        </form>
      ) : null}
    </AccessActionCard>
  );
}
