/**
 * 本文件渲染会议中心真实历史记录、状态筛选和服务端分页。
 */
import type { ReactNode } from 'react';
import { Ban, CalendarX2, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import type { MeetingCenterListItem, MeetingCenterRecordsResponse } from '@workspace/contracts/meetings';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

import type { MeetingCenterPageQuery } from '../types/meeting-center.types';

/** 历史记录组件属性。 */
type MeetingRecordsProps = {
  /** 当前 URL 状态。 */
  query: MeetingCenterPageQuery;
  /** 分页记录响应。 */
  data: MeetingCenterRecordsResponse;
  /** 搜索输入插槽。 */
  searchSlot: ReactNode;
  /** UTC+8 日期范围筛选插槽。 */
  dateRangeSlot: ReactNode;
  /** 状态筛选回调。 */
  onStatusChange: (status: string | undefined) => void;
  /** 页码切换回调。 */
  onPageChange: (page: number) => void;
  /** 打开详情回调。 */
  onSelect: (meeting: MeetingCenterListItem) => void;
};

/** 渲染会议记录列表与分页。 */
export function MeetingRecords({
  query,
  data,
  searchSlot,
  dateRangeSlot,
  onStatusChange,
  onPageChange,
  onSelect,
}: MeetingRecordsProps) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <section
      className="overflow-hidden rounded-3xl border bg-card/80 shadow-sm"
      aria-labelledby="meeting-records-title"
    >
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <h2 id="meeting-records-title" className="text-xl font-semibold">
            会议记录
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">共 {data.total} 场已结束或已取消会议</p>
        </div>
        <div className="flex flex-col gap-2 xl:flex-row">
          {searchSlot}
          {dateRangeSlot}
          <Select
            value={query.status ?? 'all'}
            onValueChange={(value) => onStatusChange(value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="w-36 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="ENDED">已结束</SelectItem>
              <SelectItem value="CANCELLED">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {data.items.length === 0 ? (
        <div className="grid min-h-80 place-items-center px-6 text-center">
          <div>
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <CalendarX2 aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold">没有符合条件的会议记录</h3>
            <p className="mt-1 text-sm text-muted-foreground">可以调整关键词、项目、角色或状态筛选。</p>
          </div>
        </div>
      ) : (
        <div className="divide-y">
          {data.items.map((meeting) => (
            <Button
              key={meeting.id}
              variant="ghost"
              className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-none px-5 py-5 text-left sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-7"
              onClick={() => onSelect(meeting)}
            >
              <span className="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {meeting.status === 'CANCELLED' ? (
                  <Ban aria-hidden className="size-4" />
                ) : (
                  <ListChecks aria-hidden className="size-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{meeting.title}</span>
                  <Badge variant="outline">{meeting.status === 'ENDED' ? '已结束' : '已取消'}</Badge>
                </span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {meeting.projectTitle} · {meeting.areaName} · {formatRecordTime(meeting)}
                </span>
              </span>
              <span className="col-start-2 text-xs font-normal text-muted-foreground sm:col-start-auto">
                {roleLabel(meeting.currentUserRole)}
              </span>
            </Button>
          ))}
        </div>
      )}
      <footer className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground sm:px-7">
        <span>
          第 {data.page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={data.page <= 1}
            aria-label="上一页"
            onClick={() => onPageChange(data.page - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={data.page >= totalPages}
            aria-label="下一页"
            onClick={() => onPageChange(data.page + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </footer>
    </section>
  );
}

/** 格式化记录实际时间，缺失时退回创建时间。 */
function formatRecordTime(meeting: MeetingCenterListItem): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(meeting.startedAt ?? meeting.createdAt));
}

/** 转换当前用户会议角色文案。 */
function roleLabel(role: MeetingCenterListItem['currentUserRole']): string {
  return role === 'HOST' ? '主持人' : role === 'CO_HOST' ? '协助主持' : '受邀人';
}
