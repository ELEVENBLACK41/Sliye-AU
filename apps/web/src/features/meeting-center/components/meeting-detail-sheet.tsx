/**
 * 本文件实现会议中心会议详情 Sheet，并在打开时懒加载现有详情接口。
 */
'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CalendarRange, LoaderCircle, Pencil, RotateCw, UsersRound, Video, X } from 'lucide-react';
import type { MeetingCenterListItem, MeetingDetail } from '@workspace/contracts/meetings';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { toast } from '@workspace/ui/components/sonner';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet';

import {
  cancelAppointment,
  getMeetingCenterDetail,
  updateAppointment,
} from '../services/meeting-center-client.service';

/** 详情抽屉属性。 */
type MeetingDetailSheetProps = {
  /** 已选会议摘要。 */
  meeting: MeetingCenterListItem | null;
  /** 抽屉开关状态。 */
  open: boolean;
  /** 抽屉开关回调。 */
  onOpenChange: (open: boolean) => void;
  /** 从历史记录切换到会议所在日程的可选回调。 */
  onShowInSchedule?: () => void;
};

/** 渲染懒加载会议详情抽屉。 */
export function MeetingDetailSheet({ meeting, open, onOpenChange, onShowInSchedule }: MeetingDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden border-meeting-line bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-xl lg:inset-y-4 lg:right-4 lg:h-auto lg:rounded-3xl lg:border"
      >
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-5 top-5 z-10 rounded-full"
            aria-label="关闭会议详情"
          >
            <X aria-hidden />
          </Button>
        </SheetClose>
        <SheetHeader className="shrink-0 border-b border-meeting-line bg-meeting-accent-soft/40 px-6 py-5 pr-16">
          <p className="text-xs font-medium text-meeting-accent-foreground">会议详情</p>
          <SheetTitle className="mt-1 text-xl font-semibold tracking-tight">{meeting?.title ?? '会议详情'}</SheetTitle>
          <SheetDescription className="mt-1">
            {meeting
              ? meeting.projectTitle
                ? `${meeting.projectTitle} · ${meeting.areaName}`
                : '独立会议 · 仅受邀人可见'
              : '加载会议详情'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 pb-8">
          {meeting && onShowInSchedule ? (
            <Button variant="outline" className="mb-5 w-full rounded-xl" onClick={onShowInSchedule}>
              <CalendarRange aria-hidden />
              在日程中查看
            </Button>
          ) : null}
          {open && meeting ? <MeetingDetailContent key={meeting.id} meeting={meeting} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** 负责单场会议详情的异步加载与重试状态。 */
function MeetingDetailContent({ meeting }: { meeting: MeetingCenterListItem }) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<{ detail: MeetingDetail | null; error: string | null; loading: boolean }>({
    detail: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    getMeetingCenterDetail(meeting.id).then(
      (detail) => {
        if (!cancelled) setState({ detail, error: null, loading: false });
      },
      (reason: unknown) => {
        if (!cancelled)
          setState({
            detail: null,
            error: reason instanceof Error ? reason.message : '会议详情加载失败',
            loading: false,
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [meeting.id, requestVersion]);

  if (state.loading)
    return (
      <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
        <LoaderCircle className="animate-spin" aria-hidden />
        正在加载会议详情
      </div>
    );
  if (state.error)
    return (
      <div className="grid min-h-64 place-items-center text-center">
        <div>
          <p className="text-sm text-destructive">{state.error}</p>
          <Button
            variant="outline"
            className="mt-4 rounded-xl"
            onClick={() => {
              setState({ detail: null, error: null, loading: true });
              setRequestVersion((value) => value + 1);
            }}
          >
            <RotateCw aria-hidden />
            重试
          </Button>
        </div>
      </div>
    );
  if (!state.detail) return null;
  const detail = state.detail;
  const canJoin = isMeetingJoinable(detail);

  return (
    <div className="grid gap-5">
      {canJoin ? (
        <Button
          type="button"
          onClick={() => window.location.assign(`/meetings/${detail.id}/room`)}
          className="h-11 rounded-xl bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85"
        >
          <Video aria-hidden />
          进入会议
        </Button>
      ) : detail.status === 'SCHEDULED' ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-center text-sm text-muted-foreground">
          会议将在计划时间前 30 分钟开放
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Badge>{statusLabel(detail.status)}</Badge>
        <Badge variant="outline">{roleLabel(meeting.currentUserRole)}</Badge>
        {detail.scheduledDurationMinutes ? (
          <Badge variant="outline">计划 {detail.scheduledDurationMinutes} 分钟</Badge>
        ) : (
          <Badge variant="outline">时长未设置</Badge>
        )}
      </div>
      <section className="rounded-2xl border border-meeting-line bg-background/55 p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <CalendarClock aria-hidden className="size-4" />
          时间与状态
        </h3>
        <dl className="mt-3 grid gap-2 text-sm">
          <DetailRow label="计划时间" value={formatDateTime(detail.scheduledAt)} />
          <DetailRow label="实际开始" value={formatDateTime(detail.startedAt)} />
          <DetailRow label="实际结束" value={formatDateTime(detail.endedAt)} />
          <DetailRow label="主持人" value={detail.createdBy.name ?? '未命名用户'} />
        </dl>
      </section>
      <section className="rounded-2xl border border-meeting-line bg-background/55 p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <UsersRound aria-hidden className="size-4" />
          参与人（{detail.participants.length}）
        </h3>
        <div className="mt-3 grid gap-2">
          {detail.participants.map((participant) => (
            <div
              key={participant.id}
              className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm"
            >
              <span>{participant.user.name ?? '未命名用户'}</span>
              <span className="text-xs text-muted-foreground">{roleLabel(participant.role)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-meeting-line bg-background/55 p-4">
        <h3 className="font-medium">关联决策</h3>
        {detail.decisions.length ? (
          <div className="mt-3 grid gap-2">
            {detail.decisions.map((decision) => (
              <div key={decision.id} className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
                {decision.title}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">未关联决策</p>
        )}
      </section>
      {detail.description ? (
        <section className="rounded-2xl border border-meeting-line bg-background/55 p-4">
          <h3 className="font-medium">会议说明</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detail.description}</p>
        </section>
      ) : null}
      {detail.kind === 'APPOINTMENT' && detail.status === 'SCHEDULED' && meeting.currentUserRole !== 'ATTENDEE' ? (
        <AppointmentManagement
          detail={detail}
          onUpdated={(updated) => setState({ detail: updated, error: null, loading: false })}
        />
      ) : null}
    </div>
  );
}

/** 渲染主持人可用的预约修改和取消操作。 */
function AppointmentManagement({
  detail,
  onUpdated,
}: {
  detail: MeetingDetail;
  onUpdated: (detail: MeetingDetail) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(detail.title);
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(detail.scheduledAt));
  const [duration, setDuration] = useState(String(detail.scheduledDurationMinutes ?? 60));
  const [submitting, setSubmitting] = useState(false);

  /** 保存预约标题、时间和时长。 */
  async function handleSave(): Promise<void> {
    setSubmitting(true);
    try {
      const updated = await updateAppointment(detail.id, {
        title: title.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        scheduledDurationMinutes: Number(duration),
      });
      onUpdated(updated);
      setEditing(false);
      toast.success('预约会议已更新');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约会议修改失败');
    } finally {
      setSubmitting(false);
    }
  }

  /** 二次确认后取消预约会议。 */
  async function handleCancel(): Promise<void> {
    if (!window.confirm('确定取消这场预约会议吗？')) return;
    setSubmitting(true);
    try {
      const updated = await cancelAppointment(detail.id);
      onUpdated(updated);
      toast.success('预约会议已取消');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约会议取消失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-meeting-line bg-background/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">预约管理</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((value) => !value)}>
          <Pencil aria-hidden />
          {editing ? '收起' : '修改'}
        </Button>
      </div>
      {editing ? (
        <div className="mt-3 grid gap-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="会议标题" />
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            aria-label="计划开始时间"
          />
          <Input
            type="number"
            min={15}
            max={480}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-label="计划时长分钟数"
          />
          <Button type="button" disabled={submitting} onClick={() => void handleSave()} className="rounded-xl">
            {submitting ? <LoaderCircle aria-hidden className="animate-spin" /> : null}保存修改
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={submitting}
        onClick={() => void handleCancel()}
        className="mt-3 w-full rounded-xl text-destructive"
      >
        取消预约会议
      </Button>
    </section>
  );
}

/** 渲染详情定义列表行。 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/** 格式化 UTC+8 时间。 */
function formatDateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '未设置';
}

/** 转换会议状态文案。 */
function statusLabel(status: MeetingDetail['status']): string {
  return { SCHEDULED: '待开始', LIVE: '进行中', ENDED: '已结束', CANCELLED: '已取消', EXPIRED: '已过期' }[status];
}

/** 判断当前会议是否处于可签发 LiveKit 令牌的入场窗口。 */
function isMeetingJoinable(detail: MeetingDetail): boolean {
  if (detail.status === 'LIVE') return true;
  if (detail.status !== 'SCHEDULED' || !detail.scheduledAt || !detail.scheduledDurationMinutes) return false;
  const now = Date.now();
  const scheduled = new Date(detail.scheduledAt).getTime();
  return now >= scheduled - 30 * 60_000 && now < scheduled + detail.scheduledDurationMinutes * 60_000;
}

/** 把 ISO 时间转换为 datetime-local 控件值。 */
function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** 转换参与角色文案。 */
function roleLabel(role: MeetingCenterListItem['currentUserRole'] | undefined): string {
  return role === 'HOST' ? '主持人' : role === 'CO_HOST' ? '协助主持' : '受邀人';
}
