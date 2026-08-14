/**
 * 本文件实现新版成员分页目录、筛选器和用户授权详情抽屉。
 */
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, LoaderCircle, Search, ShieldCheck, UserRoundSearch } from 'lucide-react';
import type {
  AccessDataScope,
  AccessDepartmentTreeNode,
  AccessPermission,
  AccessPermissionEffect,
  AccessRole,
  AccessUserAuthorizationDetail,
  AccessUserListItem,
  AccessUserListResult,
  AccessUserStatus,
  GrantableDataScope,
} from '@workspace/contracts/access';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet';

import { useOrganizationMutation } from '../hooks/use-organization-mutation';
import {
  assignOrganizationDirectPermission,
  assignOrganizationUserRole,
  getOrganizationUserAuthorizationClient,
  removeOrganizationDirectPermission,
  removeOrganizationUserRole,
  updateOrganizationUserDepartment,
  updateOrganizationUserStatus,
} from '../services/organization-access-client.service';
import type { OrganizationCapabilities, OrganizationPageQuery } from '../types/organization-access.types';
import { flattenOrganizationDepartments } from '../utils/department-tree';

/** 成员目录属性。 */
type MemberDirectoryProps = {
  /** 当前 URL 查询状态。 */
  query: OrganizationPageQuery;
  /** 服务端分页成员数据。 */
  users: AccessUserListResult;
  /** 当前可用部门树。 */
  departments: AccessDepartmentTreeNode[];
  /** 当前可用角色。 */
  roles: AccessRole[];
  /** 权限目录，用于直接授权表单。 */
  permissions: AccessPermission[];
  /** 当前操作者页面能力。 */
  capabilities: OrganizationCapabilities;
};

/** 成员状态中文名称。 */
const statusLabels: Record<AccessUserStatus, string> = {
  PENDING: '待验证',
  ACTIVE: '正常',
  DISABLED: '已禁用',
  LOCKED: '已锁定',
};

/** 数据范围中文名称。 */
const scopeLabels: Record<AccessDataScope, string> = {
  ALL: '全部数据',
  OWN: '本人数据',
  DEPT: '本部门',
  DEPT_AND_CHILD: '本部门及下级',
  PARTICIPATED: '参与的数据',
  CUSTOM: '历史自定义范围',
};

/** 渲染分页成员目录和同页授权详情抽屉。 */
export function MemberDirectory({
  query,
  users,
  departments,
  roles,
  permissions,
  capabilities,
}: MemberDirectoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const flattenedDepartments = flattenOrganizationDepartments(departments);
  const [selectedUser, setSelectedUser] = useState<AccessUserListItem | null>(null);

  /** 合并成员筛选条件并回到指定页。 */
  function updateQuery(changes: Record<string, string | number | undefined>): void {
    const params = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, String(value));
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-organization-surface shadow-sm">
      <div className="flex flex-col gap-4 border-b p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground">MEMBER DIRECTORY</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">成员目录</h2>
          </div>
          <p className="text-sm text-muted-foreground">当前范围共 {users.total} 名成员</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(15rem,1fr)_10rem_12rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              defaultValue={query.keyword ?? ''}
              className="rounded-full bg-background/55 pl-9"
              placeholder="搜索姓名或邮箱，按 Enter 查询"
              onKeyDown={(event) => {
                if (event.key === 'Enter') updateQuery({ keyword: event.currentTarget.value.trim() || undefined, page: undefined });
              }}
            />
          </div>
          <Select
            value={query.status ?? 'ALL'}
            onValueChange={(value) => updateQuery({ status: value === 'ALL' ? undefined : value, page: undefined })}
          >
            <SelectTrigger className="w-full rounded-full bg-background/55"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={query.withoutDepartment ? 'UNASSIGNED' : query.departmentId ? String(query.departmentId) : 'ALL'}
            onValueChange={(value) => updateQuery({
              departmentId: value !== 'ALL' && value !== 'UNASSIGNED' ? value : undefined,
              withoutDepartment: value === 'UNASSIGNED' ? 'true' : undefined,
              page: undefined,
            })}
          >
            <SelectTrigger className="w-full rounded-full bg-background/55"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部部门</SelectItem>
              <SelectItem value="UNASSIGNED">未分配部门</SelectItem>
              {flattenedDepartments.map(({ department, depth }) => (
                <SelectItem key={department.id} value={String(department.id)}>{`${'　'.repeat(depth)}${department.name}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={query.roleId ? String(query.roleId) : 'ALL'}
            onValueChange={(value) => updateQuery({ roleId: value === 'ALL' ? undefined : value, page: undefined })}
          >
            <SelectTrigger className="w-full rounded-full bg-background/55"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部角色</SelectItem>
              {roles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {users.items.length === 0 ? (
        <div className="grid min-h-72 place-items-center p-8 text-center">
          <div>
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-organization-accent-soft text-organization-ink"><UserRoundSearch aria-hidden /></span>
            <h3 className="mt-4 font-semibold">没有符合条件的成员</h3>
            <p className="mt-1 text-sm text-muted-foreground">调整关键词、部门、角色或账号状态后再试。</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {users.items.map((user) => (
            <li key={user.id}>
              <Button
                variant="ghost"
                className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-none px-5 py-4 text-left sm:grid-cols-[auto_minmax(13rem,1.3fr)_minmax(8rem,1fr)_minmax(10rem,1fr)_auto] sm:items-center sm:px-6"
                onClick={() => setSelectedUser(user)}
              >
                <Avatar className="size-10 rounded-xl"><AvatarImage src={user.avatarUrl ?? undefined} alt="" /><AvatarFallback className="rounded-xl">{getInitial(user)}</AvatarFallback></Avatar>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{user.name || '未设置姓名'}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
                </span>
                <span className="col-start-2 text-xs font-normal text-muted-foreground sm:col-start-auto">{user.department?.name ?? '未分配部门'}</span>
                <span className="col-start-2 flex flex-wrap gap-1 sm:col-start-auto">
                  {user.roles.length ? user.roles.slice(0, 2).map((role) => <Badge key={role.id} variant="outline">{role.name}</Badge>) : <span className="text-xs font-normal text-muted-foreground">暂无角色</span>}
                  {user.roles.length > 2 ? <Badge variant="secondary">+{user.roles.length - 2}</Badge> : null}
                </span>
                <span className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                  <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>{statusLabels[user.status]}</Badge>
                  <span className="text-xs font-normal text-muted-foreground">直接授权 {user.directPermissionCount}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground sm:px-6">
        <span>第 {users.page} / {Math.max(1, users.totalPages)} 页</span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" className="rounded-full" disabled={users.page <= 1} aria-label="上一页" onClick={() => updateQuery({ page: users.page - 1 })}><ChevronLeft aria-hidden /></Button>
          <Button variant="outline" size="icon-sm" className="rounded-full" disabled={users.page >= users.totalPages} aria-label="下一页" onClick={() => updateQuery({ page: users.page + 1 })}><ChevronRight aria-hidden /></Button>
        </div>
      </footer>

      <MemberAuthorizationSheet
        user={selectedUser}
        open={selectedUser !== null}
        onOpenChange={(open) => { if (!open) setSelectedUser(null); }}
        departments={departments}
        roles={roles}
        permissions={permissions}
        capabilities={capabilities}
      />
    </section>
  );
}

/** 成员授权详情抽屉属性。 */
type MemberAuthorizationSheetProps = {
  /** 当前选中的成员摘要。 */
  user: AccessUserListItem | null;
  /** 抽屉是否打开。 */
  open: boolean;
  /** 抽屉状态回调。 */
  onOpenChange: (open: boolean) => void;
  /** 可选部门树。 */
  departments: AccessDepartmentTreeNode[];
  /** 可选角色。 */
  roles: AccessRole[];
  /** 权限目录。 */
  permissions: AccessPermission[];
  /** 当前操作者能力。 */
  capabilities: OrganizationCapabilities;
};

/** 读取并渲染成员完整授权，所有变更仍由后端执行安全校验。 */
function MemberAuthorizationSheet({ user, open, onOpenChange, departments, roles, permissions, capabilities }: MemberAuthorizationSheetProps) {
  const userId = user?.id;
  const [detailState, setDetailState] = useState<{
    userId: number;
    detail?: AccessUserAuthorizationDetail;
    error?: string;
  }>({ userId: 0 });
  const detail = userId === detailState.userId ? detailState.detail ?? null : null;
  const error = userId === detailState.userId ? detailState.error ?? null : null;
  const loading = Boolean(open && userId && detailState.userId !== userId);
  const [departmentId, setDepartmentId] = useState('NONE');
  const [status, setStatus] = useState<AccessUserStatus>('ACTIVE');
  const [roleId, setRoleId] = useState('');
  const [permissionId, setPermissionId] = useState('');
  const [effect, setEffect] = useState<AccessPermissionEffect>('ALLOW');
  const [scope, setScope] = useState<GrantableDataScope>('ALL');
  const [expiresAt, setExpiresAt] = useState('');
  const { pendingAction, message, runMutation } = useOrganizationMutation();
  const flattenedDepartments = flattenOrganizationDepartments(departments);
  const selectedPermission = permissions.find((item) => String(item.id) === permissionId);

  /** 每次切换成员时读取最新授权解析并初始化编辑值。 */
  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    void getOrganizationUserAuthorizationClient(userId)
      .then((value) => {
        if (!active) return;
        setDetailState({ userId, detail: value });
        setDepartmentId(value.user.deptId?.toString() ?? 'NONE');
        setStatus(value.user.status);
      })
      .catch((reason: unknown) => {
        if (active) setDetailState({ userId, error: reason instanceof Error ? reason.message : '用户授权详情加载失败' });
      });
    return () => { active = false; };
  }, [open, userId]);

  /** 写操作成功后重新读取当前用户详情。 */
  async function mutateAndReload(action: string, success: string, callback: () => Promise<void>): Promise<void> {
    if (!user) return;
    const completed = await runMutation(action, success, callback);
    if (completed) setDetailState({ userId: user.id, detail: await getOrganizationUserAuthorizationClient(user.id) });
  }

  /** 切换直接授权权限码并重置到允许的首个范围。 */
  function handlePermissionChange(value: string): void {
    const permission = permissions.find((item) => String(item.id) === value);
    setPermissionId(value);
    setScope(permission?.allowedScopes[0] ?? 'ALL');
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-5">
          <SheetTitle className="text-xl">{user?.name || '成员授权'}</SheetTitle>
          <SheetDescription>{user?.email} · 查看并维护组织归属与最终权限</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-5 pb-8">
          {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground"><LoaderCircle className="animate-spin" aria-hidden />正在解析最终权限…</div> : null}
          {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
          {message ? <div className={message.type === 'error' ? 'rounded-2xl border border-destructive/30 p-3 text-sm text-destructive' : 'rounded-2xl border border-organization-accent/40 bg-organization-accent-soft p-3 text-sm'}>{message.text}</div> : null}
          {detail ? (
            <>
              <section className="grid gap-3 rounded-2xl border bg-muted/30 p-4" aria-labelledby="member-organization-title">
                <h3 id="member-organization-title" className="font-semibold">组织归属与账号状态</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5"><Label>主部门</Label><Select value={departmentId} onValueChange={setDepartmentId} disabled={!capabilities.canUpdateUserDepartment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">不分配部门</SelectItem>{flattenedDepartments.filter(({ department }) => department.status === 'ACTIVE').map(({ department, depth }) => <SelectItem key={department.id} value={String(department.id)}>{`${'　'.repeat(depth)}${department.name}`}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-1.5"><Label>账号状态</Label><Select value={status} onValueChange={(value) => setStatus(value as AccessUserStatus)} disabled={!capabilities.canUpdateUserStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).filter(([value]) => value !== 'PENDING').map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {capabilities.canUpdateUserDepartment ? <Button variant="outline" disabled={Boolean(pendingAction)} onClick={() => void mutateAndReload('department', '主部门已更新', () => updateOrganizationUserDepartment(detail.user.id, { departmentId: departmentId === 'NONE' ? null : Number(departmentId) }))}>保存部门</Button> : null}
                  {capabilities.canUpdateUserStatus ? <Button disabled={Boolean(pendingAction)} onClick={() => void mutateAndReload('status', '账号状态已更新', () => updateOrganizationUserStatus(detail.user.id, { status }))}>保存状态</Button> : null}
                </div>
              </section>

              <section className="grid gap-3" aria-labelledby="member-roles-title">
                <div className="flex items-center justify-between"><h3 id="member-roles-title" className="font-semibold">角色</h3><span className="text-xs text-muted-foreground">{detail.user.roles.length} 个</span></div>
                <div className="flex flex-wrap gap-2">{detail.user.roles.length ? detail.user.roles.map((assigned) => <Badge key={assigned.id} variant="outline" className="gap-2 py-1.5">{assigned.name}{capabilities.canAssignUserRole ? <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => void mutateAndReload(`role-${assigned.id}`, '角色已解除', () => removeOrganizationUserRole(detail.user.id, assigned.id))} aria-label={`解除${assigned.name}`}>×</button> : null}</Badge>) : <span className="text-sm text-muted-foreground">尚未分配角色</span>}</div>
                {capabilities.canAssignUserRole ? <div className="flex gap-2"><Select value={roleId} onValueChange={setRoleId}><SelectTrigger className="flex-1"><SelectValue placeholder="选择角色" /></SelectTrigger><SelectContent>{roles.filter((role) => !detail.user.roles.some((assigned) => assigned.id === role.id)).map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}</SelectContent></Select><Button disabled={!roleId || Boolean(pendingAction)} onClick={() => void mutateAndReload('assign-role', '角色已分配', () => assignOrganizationUserRole(detail.user.id, { roleId: Number(roleId) }))}>分配角色</Button></div> : null}
              </section>

              <section className="grid gap-3" aria-labelledby="effective-permissions-title">
                <div><h3 id="effective-permissions-title" className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-organization-ink" aria-hidden />最终生效权限</h3><p className="mt-1 text-xs text-muted-foreground">由后端合并角色、直接允许、直接拒绝和有效期后生成。</p></div>
                <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">{detail.effectivePermissions.length ? detail.effectivePermissions.map((grant) => <div key={grant.permission.code} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-xs">{grant.permission.code}</p><p className="mt-1 text-sm font-medium">{grant.permission.name ?? grant.permission.desc ?? '未命名权限'}</p></div><div className="flex flex-wrap gap-1">{grant.scopes.map((item) => <Badge key={item} variant="secondary">{scopeLabels[item]}</Badge>)}</div></div><p className="mt-2 text-xs text-muted-foreground">来源：{grant.sources.map((source) => source.type === 'SUPER_ADMIN' ? '超级管理员' : source.type === 'ROLE' ? `角色「${source.roleName}」` : '直接允许').join('、')}</p></div>) : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">当前没有生效权限</p>}</div>
                {detail.deniedPermissionCodes.length ? <p className="text-xs text-destructive">直接拒绝：{detail.deniedPermissionCodes.join('、')}</p> : null}
              </section>

              <section className="grid gap-3" aria-labelledby="direct-permissions-title">
                <div><h3 id="direct-permissions-title" className="font-semibold">直接授权</h3><p className="mt-1 text-xs text-muted-foreground">直接拒绝会覆盖同一权限码的所有角色授权，且范围只能为“全部数据”。</p></div>
                <div className="grid gap-2">{detail.user.directPermissions.length ? detail.user.directPermissions.map((grant) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><p className="font-mono text-xs">{grant.permission.code}</p><p className="mt-1 text-xs text-muted-foreground">{grant.effect === 'ALLOW' ? '直接允许' : '直接拒绝'} · {scopeLabels[grant.scopeType]}{grant.expiresAt ? ` · ${formatDateTime(grant.expiresAt)} 到期` : ' · 长期有效'}</p></div>{capabilities.canAssignUserPermission ? <Button variant="ghost" size="sm" disabled={Boolean(pendingAction)} onClick={() => void mutateAndReload(`remove-permission-${grant.id}`, '直接授权已移除', () => removeOrganizationDirectPermission(detail.user.id, grant.id))}>移除</Button> : null}</div>) : <p className="text-sm text-muted-foreground">没有直接授权记录</p>}</div>
                {capabilities.canAssignUserPermission ? <div className="grid gap-2 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2"><div className="grid gap-1.5 sm:col-span-2"><Label>权限码</Label><Select value={permissionId} onValueChange={handlePermissionChange}><SelectTrigger><SelectValue placeholder="选择权限码" /></SelectTrigger><SelectContent>{permissions.map((permission) => <SelectItem key={permission.id} value={String(permission.id)}>{permission.code}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>效果</Label><Select value={effect} onValueChange={(value) => { const next = value as AccessPermissionEffect; setEffect(next); if (next === 'DENY') setScope('ALL'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALLOW">直接允许</SelectItem><SelectItem value="DENY">直接拒绝</SelectItem></SelectContent></Select></div><div className="grid gap-1.5"><Label>数据范围</Label><Select value={scope} onValueChange={(value) => setScope(value as GrantableDataScope)} disabled={effect === 'DENY'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(effect === 'DENY' ? (['ALL'] as GrantableDataScope[]) : selectedPermission?.allowedScopes ?? []).map((item) => <SelectItem key={item} value={item}>{scopeLabels[item]}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="direct-permission-expiration">到期时间（可选）</Label><Input id="direct-permission-expiration" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div><Button className="sm:col-span-2" disabled={!permissionId || Boolean(pendingAction)} onClick={() => void mutateAndReload('assign-permission', '直接授权已添加', () => assignOrganizationDirectPermission(detail.user.id, { permissionId: Number(permissionId), effect, scopeType: effect === 'DENY' ? 'ALL' : scope, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }))}>添加直接授权</Button></div> : null}
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** 生成成员头像占位字符。 */
function getInitial(user: AccessUserListItem): string {
  return (user.name || user.email).trim().charAt(0).toUpperCase() || '?';
}

/** 将 ISO 时间格式化为中文本地时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
