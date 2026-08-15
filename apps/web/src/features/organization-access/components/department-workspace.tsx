/**
 * 本文件实现新版组织树浏览、创建、资料维护、移动与启停操作。
 */
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Building2, ChevronRight, Network } from 'lucide-react';
import type { AccessDepartmentTreeNode } from '@workspace/contracts/access';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

import { useOrganizationMutation } from '../hooks/use-organization-mutation';
import {
  createOrganizationDepartment,
  moveOrganizationDepartment,
  updateOrganizationDepartment,
  updateOrganizationDepartmentStatus,
} from '../services/organization-access-client.service';
import type { OrganizationCapabilities } from '../types/organization-access.types';
import { flattenOrganizationDepartments } from '../utils/department-tree';

/** 部门工作区属性。 */
type DepartmentWorkspaceProps = {
  /** 当前操作者可见的部门树。 */
  departments: AccessDepartmentTreeNode[];
  /** 当前操作者部门能力。 */
  capabilities: OrganizationCapabilities;
};

/** 渲染左侧组织树和右侧维护面板。 */
export function DepartmentWorkspace({ departments, capabilities }: DepartmentWorkspaceProps) {
  const flattened = useMemo(() => flattenOrganizationDepartments(departments), [departments]);
  const [selectedId, setSelectedId] = useState(flattened[0]?.department.id ?? null);
  const selected = flattened.find(({ department }) => department.id === selectedId)?.department ?? null;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('ROOT');
  const [updatedName, setUpdatedName] = useState(selected?.name ?? '');
  const [moveParentId, setMoveParentId] = useState(selected?.parentId?.toString() ?? 'ROOT');
  const { pendingAction, message, runMutation } = useOrganizationMutation();

  /** 切换部门并同步维护表单。 */
  function selectDepartment(department: AccessDepartmentTreeNode): void {
    setSelectedId(department.id);
    setUpdatedName(department.name);
    setMoveParentId(department.parentId?.toString() ?? 'ROOT');
  }

  /** 创建部门。 */
  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const success = await runMutation('create-department', '部门已创建', () =>
      createOrganizationDepartment({
        code: code.trim(),
        name: name.trim(),
        parentId: parentId === 'ROOT' ? null : Number(parentId),
      }),
    );
    if (success) { setCode(''); setName(''); }
  }

  /** 保存当前部门名称。 */
  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    await runMutation('update-department', '部门名称已更新', () =>
      updateOrganizationDepartment(selected.id, { name: updatedName.trim() }),
    );
  }

  /** 移动当前部门。 */
  async function handleMove(): Promise<void> {
    if (!selected) return;
    await runMutation('move-department', '部门位置已更新', () =>
      moveOrganizationDepartment(selected.id, { parentId: moveParentId === 'ROOT' ? null : Number(moveParentId) }),
    );
  }

  /** 切换当前部门启停状态。 */
  async function handleStatus(): Promise<void> {
    if (!selected) return;
    await runMutation('department-status', selected.status === 'ACTIVE' ? '部门已停用' : '部门已启用', () =>
      updateOrganizationDepartmentStatus(selected.id, { status: selected.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
    );
  }

  return (
    <section className="grid min-h-[34rem] overflow-hidden rounded-[1.75rem] border border-border/70 bg-organization-surface shadow-sm lg:grid-cols-[minmax(16rem,0.85fr)_minmax(20rem,1.15fr)]" aria-label="部门组织树">
      <div className="border-b lg:border-r lg:border-b-0">
        <div className="border-b p-5 sm:p-6"><p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground">ORGANIZATION TREE</p><h2 className="mt-1 text-xl font-semibold tracking-tight">部门结构</h2></div>
        {flattened.length ? <ul className="max-h-[38rem] overflow-y-auto p-3">{flattened.map(({ department, depth }) => <li key={department.id}><Button variant={selectedId === department.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start rounded-xl py-2.5" style={{ paddingLeft: `${12 + depth * 18}px` }} onClick={() => selectDepartment(department)}><ChevronRight className="size-3.5" aria-hidden /><span className="min-w-0 flex-1 truncate text-left">{department.name}</span><span className="text-xs text-muted-foreground">{department.memberCount}</span></Button></li>)}</ul> : <div className="grid min-h-64 place-items-center p-6 text-center text-sm text-muted-foreground"><div><Network className="mx-auto mb-3 size-8" aria-hidden />尚未创建部门</div></div>}
      </div>
      <div className="grid content-start gap-5 p-5 sm:p-6">
        {message ? <p className={message.type === 'error' ? 'rounded-xl border border-destructive/30 p-3 text-sm text-destructive' : 'rounded-xl border border-organization-accent/40 bg-organization-accent-soft p-3 text-sm'}>{message.text}</p> : null}
        {selected ? <section className="grid gap-4 rounded-2xl border bg-background/45 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="size-5 text-organization-ink" aria-hidden />{selected.name}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{selected.code}</p></div><Badge variant={selected.status === 'ACTIVE' ? 'default' : 'secondary'}>{selected.status === 'ACTIVE' ? '启用' : '停用'}</Badge></div><dl className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">直属成员</dt><dd className="mt-1 text-xl font-semibold">{selected.memberCount}</dd></div><div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">直属决策</dt><dd className="mt-1 text-xl font-semibold">{selected.decisionCount}</dd></div></dl>{capabilities.canUpdateDepartment ? <form className="grid gap-2" onSubmit={handleUpdate}><Label htmlFor="department-name">部门名称</Label><div className="flex gap-2"><Input id="department-name" value={updatedName} onChange={(event) => setUpdatedName(event.target.value)} /><Button disabled={!updatedName.trim() || Boolean(pendingAction)}>保存名称</Button></div></form> : null}{capabilities.canMoveDepartment ? <div className="grid gap-2"><Label>上级部门</Label><div className="flex gap-2"><Select value={moveParentId} onValueChange={setMoveParentId}><SelectTrigger className="flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ROOT">根部门</SelectItem>{flattened.filter(({ department }) => department.id !== selected.id).map(({ department, depth }) => <SelectItem key={department.id} value={String(department.id)}>{`${'　'.repeat(depth)}${department.name}`}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={Boolean(pendingAction)} onClick={() => void handleMove()}>移动</Button></div></div> : null}{capabilities.canUpdateDepartment ? <Button variant="outline" className="justify-self-start" disabled={Boolean(pendingAction)} onClick={() => void handleStatus()}>{selected.status === 'ACTIVE' ? '停用部门' : '启用部门'}</Button> : null}</section> : null}
        {capabilities.canCreateDepartment ? <form className="grid gap-3 rounded-2xl border border-dashed p-4" onSubmit={handleCreate}><div><h3 className="font-semibold">创建部门</h3><p className="mt-1 text-xs text-muted-foreground">部门代码创建后保持稳定，用于接口和数据同步。</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="department-code">部门代码</Label><Input id="department-code" value={code} onChange={(event) => setCode(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="new-department-name">部门名称</Label><Input id="new-department-name" value={name} onChange={(event) => setName(event.target.value)} /></div></div><div className="grid gap-1.5"><Label>上级部门</Label><Select value={parentId} onValueChange={setParentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ROOT">根部门</SelectItem>{flattened.filter(({ department }) => department.status === 'ACTIVE').map(({ department, depth }) => <SelectItem key={department.id} value={String(department.id)}>{`${'　'.repeat(depth)}${department.name}`}</SelectItem>)}</SelectContent></Select></div><Button className="justify-self-start" disabled={!code.trim() || !name.trim() || Boolean(pendingAction)}>创建部门</Button></form> : null}
      </div>
    </section>
  );
}
