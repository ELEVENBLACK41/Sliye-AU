/**
 * 本文件实现会议中心会议详情 Sheet，并在打开时懒加载现有详情接口。
 */
'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, CalendarRange, LoaderCircle, RotateCw, UsersRound, X } from 'lucide-react';
import type { MeetingCenterListItem, MeetingDetail } from '@workspace/contracts/meetings';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet';

import { getMeetingCenterDetail } from '../services/meeting-center-client.service';

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
            {meeting ? `${meeting.projectTitle} · ${meeting.areaName}` : '加载会议详情'}
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

  return (
    <div className="grid gap-5">
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
    </div>
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
  return { SCHEDULED: '待开始', LIVE: '进行中', ENDED: '已结束', CANCELLED: '已取消' }[status];
}

/** 转换参与角色文案。 */
function roleLabel(role: MeetingCenterListItem['currentUserRole'] | undefined): string {
  return role === 'HOST' ? '主持人' : role === 'CO_HOST' ? '协助主持' : '受邀人';
}
