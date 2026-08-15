/**
 * 本文件展示分页访问控制审计，并保留独立私有项目只读审计入口。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, SearchCheck } from 'lucide-react';
import type { AccessAuditListResult } from '@workspace/contracts/access';
import type { ProjectAuditReadResponse } from '@workspace/contracts/projects';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Textarea } from '@workspace/ui/components/textarea';

import { readOrganizationPrivateProject } from '../services/organization-access-client.service';
import type { OrganizationCapabilities, OrganizationPageQuery } from '../types/organization-access.types';

/** 授权审计工作区属性。 */
type AuditWorkspaceProps = {
  /** 当前 URL 查询状态。 */
  query: OrganizationPageQuery;
  /** 服务端分页审计结果。 */
  audit: AccessAuditListResult;
  /** 当前操作者能力。 */
  capabilities: OrganizationCapabilities;
};

/** 常用审计动作中文名称。 */
const actionLabels: Record<string, string> = {
  DEPARTMENT_CREATED: '创建部门', DEPARTMENT_UPDATED: '修改部门', DEPARTMENT_MOVED: '移动部门', DEPARTMENT_STATUS_UPDATED: '部门状态变更', ROLE_CREATED: '创建角色', ROLE_UPDATED: '修改角色', ROLE_DELETED: '删除角色', ROLE_PERMISSION_ASSIGNED: '角色增加授权', ROLE_PERMISSION_REMOVED: '角色移除授权', USER_ROLE_ASSIGNED: '成员分配角色', USER_ROLE_REMOVED: '成员解除角色', USER_PERMISSION_ASSIGNED: '成员直接授权', USER_PERMISSION_REMOVED: '成员移除直接授权', USER_STATUS_UPDATED: '成员状态变更', USER_DEPARTMENT_UPDATED: '成员部门变更', PERMISSION_CATALOG_SYNCED: '权限目录同步',
};

/** 渲染分页授权审计和高级私有内容审计。 */
export function AuditWorkspace({ query, audit, capabilities }: AuditWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();

  /** 更新审计筛选或页码。 */
  function updateQuery(changes: Record<string, string | number | undefined>): void {
    const params = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => value === undefined ? params.delete(key) : params.set(key, String(value)));
    router.push(`${pathname}?${params.toString()}`);
  }

  return <div className="grid gap-5">{capabilities.canReadAudit ? <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-organization-surface shadow-sm" aria-labelledby="audit-title"><div className="flex flex-col gap-4 border-b p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground">ACCESS AUDIT</p><h2 id="audit-title" className="mt-1 text-xl font-semibold tracking-tight">授权变更记录</h2></div><p className="text-sm text-muted-foreground">共 {audit.total} 条记录</p></div><div className="grid gap-2 sm:grid-cols-2"><Select value={query.auditAction ?? 'ALL'} onValueChange={(value) => updateQuery({ action: value === 'ALL' ? undefined : value, page: undefined })}><SelectTrigger className="rounded-full bg-background/55"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部动作</SelectItem>{Object.entries(actionLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={query.auditTargetType ?? 'ALL'} onValueChange={(value) => updateQuery({ targetType: value === 'ALL' ? undefined : value, page: undefined })}><SelectTrigger className="rounded-full bg-background/55"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部目标</SelectItem>{['DEPARTMENT', 'ROLE', 'PERMISSION', 'USER', 'SYSTEM'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></div>{audit.items.length ? <ul className="divide-y">{audit.items.map((item) => <li key={item.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{actionLabels[item.action] ?? item.action}</span><Badge variant="outline">{item.targetType}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.actor.name || item.actor.email} · {item.targetType}:{item.targetId}</p></div><div className="text-xs text-muted-foreground sm:text-right"><p>{formatDateTime(item.createdAt)}</p><p className="mt-1 font-mono">{item.requestId}</p></div></li>)}</ul> : <p className="p-10 text-center text-sm text-muted-foreground">当前筛选条件下没有审计记录</p>}<footer className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground sm:px-6"><span>第 {audit.page} / {Math.max(1, audit.totalPages)} 页</span><div className="flex gap-2"><Button variant="outline" size="icon-sm" className="rounded-full" disabled={audit.page <= 1} aria-label="上一页" onClick={() => updateQuery({ page: audit.page - 1 })}><ChevronLeft aria-hidden /></Button><Button variant="outline" size="icon-sm" className="rounded-full" disabled={audit.page >= audit.totalPages} aria-label="下一页" onClick={() => updateQuery({ page: audit.page + 1 })}><ChevronRight aria-hidden /></Button></div></footer></section> : null}{capabilities.canReadProjectAudit ? <PrivateProjectAudit /> : null}</div>;
}

/** 渲染必须说明原因并留痕的私有项目审计表单。 */
function PrivateProjectAudit() {
  const [projectId, setProjectId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProjectAuditReadResponse | null>(null);

  /** 提交审计目标和原因，并只读保存本次结果。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true); setError(''); setResult(null);
    try { setResult(await readOrganizationPrivateProject({ projectId: Number(projectId), areaId: Number(areaId), ...(meetingId ? { meetingId: Number(meetingId) } : {}), reason: reason.trim() })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '审计读取失败'); }
    finally { setPending(false); }
  }

  return <section className="rounded-[1.75rem] border border-border/70 bg-organization-surface p-5 shadow-sm sm:p-6" aria-labelledby="private-audit-title"><div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-organization-accent-soft text-organization-ink"><SearchCheck aria-hidden /></span><div><h2 id="private-audit-title" className="font-semibold">私有项目内容审计</h2><p className="mt-1 text-sm text-muted-foreground">每次读取都会记录目标、原因、请求编号与客户端信息，不会获得实时订阅能力。</p></div></div><form className="mt-5 grid gap-3 md:grid-cols-3" onSubmit={handleSubmit}>{[['audit-project', '项目 ID', projectId, setProjectId], ['audit-area', '私有分区 ID', areaId, setAreaId], ['audit-meeting', '会议 ID（可选）', meetingId, setMeetingId]].map(([id, label, value, setter]) => <div key={id as string} className="grid gap-1.5"><Label htmlFor={id as string}>{label as string}</Label><Input id={id as string} inputMode="numeric" value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} /></div>)}<div className="grid gap-1.5 md:col-span-3"><Label htmlFor="audit-reason">访问原因（至少 10 个字）</Label><Textarea id="audit-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></div><Button className="md:col-span-3 md:justify-self-start" disabled={pending || reason.trim().length < 10 || !projectId || !areaId}>{pending ? '正在审计读取…' : '记录原因并只读查看'}</Button></form>{error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}{result ? <div className="mt-4 rounded-2xl border bg-background/45 p-4"><p className="font-medium">审计记录 #{result.auditLogId}</p><p className="mt-1 text-sm text-muted-foreground">{result.project.title} · {result.area.name}{result.meeting ? ` · ${result.meeting.title}` : ''}</p><ol className="mt-3 grid max-h-80 gap-2 overflow-y-auto">{result.messages.map((message) => <li key={message.id} className="rounded-xl border p-3 text-sm"><p className="text-xs text-muted-foreground">{message.author?.name || '系统'} · {formatDateTime(message.createdAt)}</p><p className="mt-1 whitespace-pre-wrap">{message.content || '消息已删除'}</p></li>)}</ol></div> : null}</section>;
}

/** 格式化审计时间。 */
function formatDateTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
