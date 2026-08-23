/**
 * 本文件展示可分页、可重命名、可归档和恢复的 AI Thread 历史导航。
 */
'use client';

import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bot,
  LoaderCircle,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';

import type { AiRunStatus, AiThreadArchiveState, AiThreadListItem } from '@workspace/contracts/ai';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@workspace/ui/components/popover';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { cn } from '@workspace/ui/lib/utils';

import { getAiThreadScopeLabel } from '../utils/ai-thread-response';

/** AI 会话历史导航属性。 */
export type AiThreadHistoryProps = {
  /** 当前路由选中的 Thread。 */
  activeThreadId: string | null;
  /** 当前浏览的归档范围。 */
  archiveState: AiThreadArchiveState;
  /** 当前分页结果。 */
  threads: AiThreadListItem[];
  /** 首屏是否仍在加载。 */
  loading: boolean;
  /** 加载或变更失败时的用户可读信息。 */
  error: string | null;
  /** 当前筛选是否还有下一页。 */
  hasMore: boolean;
  /** 某个 Thread 是否正在提交管理操作。 */
  pendingThreadId: string | null;
  /** 切换归档范围。 */
  onArchiveStateChange: (state: AiThreadArchiveState) => void;
  /** 创建一个尚未绑定 Thread 的新工作区。 */
  onCreate: () => void;
  /** 选择历史 Thread。 */
  onSelect: (threadId: string) => void;
  /** 保存新标题。 */
  onRename: (threadId: string, title: string) => Promise<boolean>;
  /** 归档或恢复 Thread。 */
  onSetArchived: (threadId: string, archived: boolean) => Promise<boolean>;
  /** 重新加载当前筛选首屏。 */
  onReload: () => void;
  /** 读取下一页。 */
  onLoadMore: () => void;
  /** 桌面端把侧栏收起；移动端不提供。 */
  onCollapse?: () => void;
};

/** 渲染会话历史导航及其完整加载、空、错误和成功状态。 */
export function AiThreadHistory({
  activeThreadId,
  archiveState,
  threads,
  loading,
  error,
  hasMore,
  pendingThreadId,
  onArchiveStateChange,
  onCreate,
  onSelect,
  onRename,
  onSetArchived,
  onReload,
  onLoadMore,
  onCollapse,
}: AiThreadHistoryProps) {
  return (
    <aside className="flex size-full min-h-0 flex-col bg-card" aria-label="AI 会话历史">
      <header className="shrink-0 space-y-3 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-semibold">
              <Bot aria-hidden className="size-4 text-primary" />
              决策过程 AI
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">每条会话固定绑定一项决策</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              新对话
            </Button>
            {onCollapse ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="收起 AI 会话历史"
                onClick={onCollapse}
              >
                <ChevronLeft aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>
        <Tabs
          value={archiveState}
          onValueChange={(value) => onArchiveStateChange(value as AiThreadArchiveState)}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">进行中</TabsTrigger>
            <TabsTrigger value="archived">已归档</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && threads.length === 0 ? <AiThreadHistorySkeleton /> : null}

        {error && threads.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-4 text-center" role="alert">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={onReload}>
              <RefreshCw aria-hidden />
              重新加载
            </Button>
          </div>
        ) : null}

        {!loading && !error && threads.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-4 text-center">
            {archiveState === 'active' ? (
              <Plus aria-hidden className="size-5 text-muted-foreground" />
            ) : (
              <Archive aria-hidden className="size-5 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {archiveState === 'active' ? '还没有 AI 会话' : '没有已归档会话'}
            </p>
            <p className="text-xs text-muted-foreground">
              {archiveState === 'active' ? '创建后可从这里切换和恢复' : '归档的会话会保留完整运行记录'}
            </p>
          </div>
        ) : null}

        {threads.length > 0 ? (
          <ul className="space-y-1" aria-label={archiveState === 'active' ? '进行中的会话' : '已归档的会话'}>
            {threads.map((thread) => (
              <li key={thread.id}>
                <AiThreadHistoryItem
                  active={thread.id === activeThreadId}
                  archived={archiveState === 'archived'}
                  pending={pendingThreadId === thread.id}
                  thread={thread}
                  onRename={onRename}
                  onSelect={onSelect}
                  onSetArchived={onSetArchived}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {error && threads.length > 0 ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-destructive/30 p-2" role="alert">
            <p className="text-xs text-destructive">{error}</p>
            <Button type="button" size="sm" variant="ghost" onClick={onReload}>
              重试
            </Button>
          </div>
        ) : null}

        {hasMore ? (
          <Button className="mt-2 w-full" type="button" variant="ghost" disabled={loading} onClick={onLoadMore}>
            {loading ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
            {loading ? '正在加载' : '加载更早会话'}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

/** 单条历史会话属性。 */
type AiThreadHistoryItemProps = {
  /** 是否为当前会话。 */
  active: boolean;
  /** 当前列表是否展示已归档数据。 */
  archived: boolean;
  /** 是否正在保存该会话。 */
  pending: boolean;
  /** 真实 Thread 摘要。 */
  thread: AiThreadListItem;
  /** 选择会话。 */
  onSelect: (threadId: string) => void;
  /** 保存标题。 */
  onRename: (threadId: string, title: string) => Promise<boolean>;
  /** 切换归档状态。 */
  onSetArchived: (threadId: string, archived: boolean) => Promise<boolean>;
};

/** 渲染单条历史摘要和基于 Popover 的管理操作。 */
function AiThreadHistoryItem({
  active,
  archived,
  pending,
  thread,
  onSelect,
  onRename,
  onSetArchived,
}: AiThreadHistoryItemProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(thread.title);

  /** 校验并提交 Unicode 1～60 字符的新标题。 */
  const handleRename = async (): Promise<void> => {
    const normalized = title.trim();
    if (!normalized || Array.from(normalized).length > 60) {
      return;
    }

    const succeeded = await onRename(thread.id, normalized);
    if (succeeded) {
      setOpen(false);
    }
  };

  /** 提交归档或恢复，并在成功后关闭浮层。 */
  const handleArchiveChange = async (): Promise<void> => {
    const succeeded = await onSetArchived(thread.id, !archived);
    if (succeeded) {
      setOpen(false);
    }
  };

  return (
    <div
      className={cn(
        'group flex min-w-0 items-start rounded-lg border border-transparent p-1 transition-colors',
        active ? 'border-border bg-accent' : 'hover:bg-muted/60',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start rounded-md px-2 py-2 text-left hover:bg-transparent"
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(thread.id)}
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block truncate text-sm font-medium">{thread.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {getAiThreadScopeLabel(thread)}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{formatThreadUpdatedAt(thread.updatedAt)}</span>
            {thread.latestRun ? <Badge variant="outline">{getRunStatusLabel(thread.latestRun.status)}</Badge> : null}
          </span>
        </span>
      </Button>

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setTitle(thread.title);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="mt-1 shrink-0"
            aria-label={`管理会话：${thread.title}`}
          >
            {pending ? (
              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : (
              <MoreHorizontal aria-hidden />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="space-y-4">
          <PopoverHeader>
            <PopoverTitle>管理会话</PopoverTitle>
            <PopoverDescription>标题和归档状态不会改变绑定的决策范围。</PopoverDescription>
          </PopoverHeader>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRename();
            }}
          >
            <Input
              value={title}
              aria-label="会话标题"
              maxLength={120}
              disabled={pending}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={!title.trim() || Array.from(title.trim()).length > 60 || pending}
            >
              <PencilLine aria-hidden />
              保存标题
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => void handleArchiveChange()}
          >
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {archived ? '恢复会话' : '归档会话'}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** 渲染历史首屏加载骨架。 */
function AiThreadHistorySkeleton() {
  return (
    <div className="space-y-3 p-2" aria-label="正在加载 AI 会话历史" role="status">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** 把 ISO 时间转换为当前语言环境的紧凑日期时间。 */
function formatThreadUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更新时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 把持久化 Run 状态映射为历史列表中的紧凑中文标签。 */
function getRunStatusLabel(status: AiRunStatus): string {
  const labels: Record<AiRunStatus, string> = {
    QUEUED: '等待中',
    RUNNING: '运行中',
    WAITING_APPROVAL: '待审批',
    CANCELLATION_REQUESTED: '停止中',
    CANCELLED: '已取消',
    COMPLETED: '已完成',
    FAILED: '失败',
  };

  return labels[status];
}
