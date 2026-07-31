/**
 * 本文件提供独立的私有项目内容审计入口，要求填写明确目标与访问原因并只读展示结果。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { SearchCheck } from 'lucide-react';
import type { ProjectAuditReadResponse } from '@workspace/contracts/projects';

import { readPrivateProjectContent } from '../services/access-management-client.service';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Textarea } from '@workspace/ui/components/textarea';

/** 渲染必须留痕且不提供实时订阅的私有内容审计表单。 */
export function ProjectPrivateAuditAction() {
  const [projectId, setProjectId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProjectAuditReadResponse | null>(null);

  /** 提交明确的私有目标和访问原因，并只读保存当前审计快照。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedProjectId = Number(projectId);
    const parsedAreaId = Number(areaId);
    const parsedMeetingId = meetingId ? Number(meetingId) : undefined;
    if (![parsedProjectId, parsedAreaId].every((value) => Number.isInteger(value) && value > 0)) return;
    if (parsedMeetingId !== undefined && (!Number.isInteger(parsedMeetingId) || parsedMeetingId < 1)) return;
    if (reason.trim().length < 10) return;

    setPending(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await readPrivateProjectContent({
          projectId: parsedProjectId,
          areaId: parsedAreaId,
          ...(parsedMeetingId ? { meetingId: parsedMeetingId } : {}),
          reason: reason.trim(),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '审计读取失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="rounded-md border-amber-500/40 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SearchCheck className="size-4" aria-hidden />
          私有项目内容审计
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>这是独立审计入口</AlertTitle>
          <AlertDescription>
            每次读取都会记录目标、原因、请求编号和客户端信息；结果只读，不会获得私有分区实时订阅能力。
          </AlertDescription>
        </Alert>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
          <AuditIdField id="audit-project-id" label="项目 ID" value={projectId} onChange={setProjectId} />
          <AuditIdField id="audit-area-id" label="私有分区 ID" value={areaId} onChange={setAreaId} />
          <AuditIdField id="audit-meeting-id" label="会议 ID（可选）" value={meetingId} onChange={setMeetingId} />
          <div className="grid gap-2 md:col-span-3">
            <Label htmlFor="audit-reason">访问原因（至少 10 个字）</Label>
            <Textarea
              id="audit-reason"
              value={reason}
              maxLength={500}
              placeholder="说明本次查看私有内容的业务原因"
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </div>
          <Button className="md:col-span-3 md:justify-self-start" disabled={pending || reason.trim().length < 10}>
            {pending ? '正在审计读取…' : '记录原因并只读查看'}
          </Button>
        </form>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {result ? <AuditResult result={result} /> : null}
      </CardContent>
    </Card>
  );
}

/** 渲染一个数字审计目标字段。 */
function AuditIdField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="numeric" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </div>
  );
}

/** 展示一次不可编辑的审计读取快照。 */
function AuditResult({ result }: { result: ProjectAuditReadResponse }) {
  return (
    <section className="space-y-3 rounded-md border bg-muted/30 p-4" aria-label="审计读取结果">
      <div>
        <p className="font-medium">审计记录 #{result.auditLogId}</p>
        <p className="text-sm text-muted-foreground">
          {result.project.title} · {result.area.name}
          {result.meeting ? ` · ${result.meeting.title}` : ''}
        </p>
      </div>
      {result.messages.length ? (
        <ol className="max-h-96 space-y-2 overflow-y-auto">
          {result.messages.map((message) => (
            <li key={message.id} className="rounded-md border bg-background p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {message.author?.name || '系统'} · {new Date(message.createdAt).toLocaleString('zh-CN')}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{message.content || '消息已删除'}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">当前审计目标暂无消息。</p>
      )}
    </section>
  );
}
