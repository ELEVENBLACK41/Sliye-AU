/**
 * 本文件实现新版角色目录、自定义角色维护和带数据范围的权限配置。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole } from 'lucide-react';
import type { AccessDataScope, AccessPermission, AccessRole, GrantableDataScope } from '@workspace/contracts/access';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Textarea } from '@workspace/ui/components/textarea';

import { useOrganizationMutation } from '../hooks/use-organization-mutation';
import {
  assignOrganizationRolePermission,
  createOrganizationRole,
  deleteOrganizationRole,
  removeOrganizationRolePermission,
  updateOrganizationRole,
} from '../services/organization-access-client.service';
import type { OrganizationCapabilities } from '../types/organization-access.types';

/** 角色工作区属性。 */
type RoleWorkspaceProps = {
  /** 角色及其权限授权。 */
  roles: AccessRole[];
  /** 可授予权限目录。 */
  permissions: AccessPermission[];
  /** 当前操作者能力。 */
  capabilities: OrganizationCapabilities;
};

/** 数据范围中文文案。 */
const scopeLabels: Record<AccessDataScope, string> = {
  ALL: '全部数据', OWN: '本人数据', DEPT: '本部门', DEPT_AND_CHILD: '本部门及下级', PARTICIPATED: '参与的数据', CUSTOM: '历史自定义范围',
};

/** 渲染角色主从工作区。 */
export function RoleWorkspace({ roles, permissions, capabilities }: RoleWorkspaceProps) {
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? null);
  const selected = roles.find((role) => role.id === selectedId) ?? null;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [updatedName, setUpdatedName] = useState(selected?.name ?? '');
  const [updatedDescription, setUpdatedDescription] = useState(selected?.desc ?? '');
  const [permissionId, setPermissionId] = useState(permissions[0]?.id.toString() ?? '');
  const [scope, setScope] = useState<GrantableDataScope>(permissions[0]?.allowedScopes[0] ?? 'ALL');
  const { pendingAction, message, runMutation } = useOrganizationMutation();
  const selectedPermission = permissions.find((permission) => permission.id.toString() === permissionId);

  /** 选择角色并同步可编辑资料。 */
  function selectRole(role: AccessRole): void {
    setSelectedId(role.id);
    setUpdatedName(role.name);
    setUpdatedDescription(role.desc ?? '');
  }

  /** 创建自定义角色。 */
  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const success = await runMutation('create-role', '自定义角色已创建', () =>
      createOrganizationRole({ code: code.trim(), name: name.trim(), desc: description.trim() || undefined }),
    );
    if (success) { setCode(''); setName(''); setDescription(''); }
  }

  /** 更新当前自定义角色资料。 */
  async function handleUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    await runMutation('update-role', '角色资料已更新', () =>
      updateOrganizationRole(selected.id, { name: updatedName.trim(), desc: updatedDescription.trim() || null }),
    );
  }

  /** 切换权限码并使用该权限允许的首个范围。 */
  function selectPermission(value: string): void {
    const permission = permissions.find((item) => item.id.toString() === value);
    setPermissionId(value);
    setScope(permission?.allowedScopes[0] ?? 'ALL');
  }

  return (
    <section className="grid min-h-[36rem] overflow-hidden rounded-[1.75rem] border border-border/70 bg-organization-surface shadow-sm lg:grid-cols-[minmax(15rem,0.72fr)_minmax(22rem,1.28fr)]" aria-label="角色与权限范围">
      <div className="border-b lg:border-r lg:border-b-0"><div className="border-b p-5 sm:p-6"><p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground">ROLE CATALOG</p><h2 className="mt-1 text-xl font-semibold tracking-tight">角色目录</h2></div><ul className="grid gap-1 p-3">{roles.map((role) => <li key={role.id}><Button variant={selectedId === role.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start rounded-xl p-3 text-left" onClick={() => selectRole(role)}><span className="flex size-9 items-center justify-center rounded-xl bg-organization-accent-soft text-organization-ink">{role.isSystem ? <LockKeyhole className="size-4" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{role.name}</span><span className="block truncate font-mono text-xs font-normal text-muted-foreground">{role.code}</span></span><span className="text-xs font-normal text-muted-foreground">{role.userCount} 人</span></Button></li>)}</ul></div>
      <div className="grid content-start gap-5 p-5 sm:p-6">
        {message ? <p className={message.type === 'error' ? 'rounded-xl border border-destructive/30 p-3 text-sm text-destructive' : 'rounded-xl border border-organization-accent/40 bg-organization-accent-soft p-3 text-sm'}>{message.text}</p> : null}
        {selected ? <><section className="grid gap-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{selected.name}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.desc || '暂无角色说明'}</p></div><Badge variant={selected.isSystem ? 'secondary' : 'outline'}>{selected.isSystem ? '系统角色 · 只读' : '自定义角色'}</Badge></div><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{selected.userCount} 名成员</span><span>·</span><span>{selected.permissionCount} 条范围授权</span></div>{!selected.isSystem && capabilities.canUpdateRole ? <form className="grid gap-3 rounded-2xl border bg-background/45 p-4" onSubmit={handleUpdate}><div className="grid gap-1.5"><Label htmlFor="role-name">角色名称</Label><Input id="role-name" value={updatedName} onChange={(event) => setUpdatedName(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="role-description">角色说明</Label><Textarea id="role-description" value={updatedDescription} onChange={(event) => setUpdatedDescription(event.target.value)} /></div><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={selected.userCount > 0 || Boolean(pendingAction)} onClick={() => void runMutation('delete-role', '角色已删除', () => deleteOrganizationRole(selected.id))}>删除角色</Button><Button disabled={!updatedName.trim() || Boolean(pendingAction)}>保存资料</Button></div></form> : null}</section><section className="grid gap-3" aria-labelledby="role-grants-title"><div><h3 id="role-grants-title" className="font-semibold">权限码与数据范围</h3><p className="mt-1 text-xs text-muted-foreground">同一权限码可以保留多条不同数据范围授权，最终按并集合并。</p></div><div className="grid max-h-80 gap-2 overflow-y-auto">{selected.grants.length ? selected.grants.map((grant) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-mono text-xs">{grant.permission.code}</p><p className="mt-1 text-xs text-muted-foreground">{grant.permission.name ?? grant.permission.desc ?? '未命名权限'} · {scopeLabels[grant.scopeType]}</p></div>{!selected.isSystem && capabilities.canAssignRolePermission ? <Button variant="ghost" size="sm" disabled={Boolean(pendingAction)} onClick={() => void runMutation(`remove-grant-${grant.id}`, '角色授权已移除', () => removeOrganizationRolePermission(selected.id, grant.id))}>移除</Button> : null}</div>) : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">当前角色没有普通授权记录</p>}</div>{!selected.isSystem && capabilities.canAssignRolePermission ? <div className="grid gap-2 rounded-2xl border border-dashed p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"><Select value={permissionId} onValueChange={selectPermission}><SelectTrigger><SelectValue placeholder="选择权限码" /></SelectTrigger><SelectContent>{permissions.map((permission) => <SelectItem key={permission.id} value={String(permission.id)}>{permission.code}</SelectItem>)}</SelectContent></Select><Select value={scope} onValueChange={(value) => setScope(value as GrantableDataScope)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectedPermission?.allowedScopes.map((item) => <SelectItem key={item} value={item}>{scopeLabels[item]}</SelectItem>)}</SelectContent></Select><Button disabled={!permissionId || Boolean(pendingAction)} onClick={() => void runMutation('assign-role-permission', '角色授权已添加', () => assignOrganizationRolePermission(selected.id, { permissionId: Number(permissionId), scopeType: scope }))}>添加授权</Button></div> : null}</section></> : <p className="text-sm text-muted-foreground">暂无角色</p>}
        {capabilities.canCreateRole ? <form className="grid gap-3 rounded-2xl border border-dashed p-4" onSubmit={handleCreate}><div><h3 className="font-semibold">创建自定义角色</h3><p className="mt-1 text-xs text-muted-foreground">系统角色由代码目录维护，自定义角色用于组织内特定职责。</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="new-role-code">稳定代码</Label><Input id="new-role-code" value={code} onChange={(event) => setCode(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="new-role-name">角色名称</Label><Input id="new-role-name" value={name} onChange={(event) => setName(event.target.value)} /></div></div><div className="grid gap-1.5"><Label htmlFor="new-role-description">角色说明</Label><Textarea id="new-role-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><Button className="justify-self-start" disabled={!code.trim() || !name.trim() || Boolean(pendingAction)}>创建角色</Button></form> : null}
      </div>
    </section>
  );
}
