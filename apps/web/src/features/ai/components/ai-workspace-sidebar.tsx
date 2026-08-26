/**
 * 本文件提供 AI 工作台的桌面侧栏和移动端会话记录抽屉。
 */
'use client';

import { useState } from 'react';
import { Archive, MoreHorizontal, PanelLeft, Pencil, Pin, Plus } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';

import type { AiWorkspaceLoadState, AiWorkspaceThreadPreview } from '../types/ai-workspace';

/** 侧栏展示所需的真实 Thread 列表与加载状态。 */
type AiWorkspaceSidebarData = {
  pinnedThreads: AiWorkspaceThreadPreview[];
  recentThreads: AiWorkspaceThreadPreview[];
  archivedThreads: AiWorkspaceThreadPreview[];
  listState: AiWorkspaceLoadState;
  listError: string | null;
  archivedListState: AiWorkspaceLoadState;
  archivedListError: string | null;
  metadataError: string | null;
  metadataPendingThreadId: string | null;
};

/** 侧栏中 Thread 选择、归档列表和元数据变更的操作集合。 */
type AiWorkspaceSidebarActions = {
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
  onShowArchived: () => void | Promise<void>;
  onTogglePinned: (threadId: string, pinned: boolean) => Promise<boolean>;
  onRenameThread: (threadId: string, title: string) => Promise<boolean>;
  onToggleArchived: (threadId: string, archived: boolean) => Promise<boolean>;
};

/** 渲染仅包含已固定和最近会话的桌面端侧栏。 */
export function AiWorkspaceSidebar({ data, ...actions }: { data: AiWorkspaceSidebarData } & AiWorkspaceSidebarActions) {
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-muted/30 p-3 pt-6 lg:flex"
      aria-label="AI 对话导航"
    >
      <AiWorkspaceSidebarContent data={data} {...actions} />
    </aside>
  );
}

/** 渲染移动端的对话记录抽屉入口。 */
export function AiWorkspaceMobileHeader({
  data,
  ...actions
}: { data: AiWorkspaceSidebarData } & AiWorkspaceSidebarActions) {
  return (
    <header className="relative flex h-15 shrink-0 items-center px-4 sm:px-6 lg:hidden" aria-label="AI 工作区模式">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute left-4 rounded-full lg:hidden"
            aria-label="查看对话记录"
          >
            <PanelLeft aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(18rem,86vw)] bg-background p-3 pt-6 lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>对话记录</SheetTitle>
            <SheetDescription>查看和管理最近、已固定及已归档的 AI 会话。</SheetDescription>
          </SheetHeader>
          <AiWorkspaceSidebarContent data={data} {...actions} />
        </SheetContent>
      </Sheet>
    </header>
  );
}

/** 渲染可同时供桌面侧栏和移动端抽屉复用的会话导航内容。 */
function AiWorkspaceSidebarContent({
  data,
  onThreadSelect,
  onNewThread,
  onShowArchived,
  onTogglePinned,
  onRenameThread,
  onToggleArchived,
}: {
  data: AiWorkspaceSidebarData;
} & AiWorkspaceSidebarActions) {
  const [showArchived, setShowArchived] = useState(false);

  /** 切换归档视图并触发一次服务端归档列表查询。 */
  function handleShowArchived(): void {
    setShowArchived(true);
    void onShowArchived();
  }

  /** 返回活动会话视图，不丢失当前列表数据。 */
  function handleShowActive(): void {
    setShowArchived(false);
  }

  const isMetadataPending = data.metadataPendingThreadId !== null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="mb-4 h-10 w-full justify-start rounded-xl px-3 text-sm"
        onClick={onNewThread}
      >
        <Plus aria-hidden />
        新聊天
      </Button>
      {data.metadataError ? (
        <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {data.metadataError}
        </p>
      ) : null}
      {showArchived ? (
        <AiArchivedThreadView
          data={data}
          isMetadataPending={isMetadataPending}
          onThreadSelect={onThreadSelect}
          onTogglePinned={onTogglePinned}
          onRenameThread={onRenameThread}
          onToggleArchived={onToggleArchived}
        />
      ) : (
        <AiActiveThreadView
          data={data}
          isMetadataPending={isMetadataPending}
          onThreadSelect={onThreadSelect}
          onTogglePinned={onTogglePinned}
          onRenameThread={onRenameThread}
          onToggleArchived={onToggleArchived}
        />
      )}
      <div className="mt-auto border-t border-border/70 pt-3">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start px-2 text-muted-foreground"
          onClick={showArchived ? handleShowActive : handleShowArchived}
        >
          <Archive aria-hidden />
          {showArchived ? '返回最近的聊天' : '查看已归档的聊天'}
        </Button>
      </div>
    </>
  );
}

/** 渲染已固定和最近会话列表，并保持原有侧栏信息架构。 */
function AiActiveThreadView({
  data,
  isMetadataPending,
  onThreadSelect,
  onTogglePinned,
  onRenameThread,
  onToggleArchived,
}: {
  data: AiWorkspaceSidebarData;
  isMetadataPending: boolean;
  onThreadSelect: (threadId: string) => void;
  onTogglePinned: (threadId: string, pinned: boolean) => Promise<boolean>;
  onRenameThread: (threadId: string, title: string) => Promise<boolean>;
  onToggleArchived: (threadId: string, archived: boolean) => Promise<boolean>;
}) {
  if (data.listState === 'LOADING') return <p className="px-2 text-sm text-muted-foreground">正在加载会话…</p>;
  if (data.listState === 'ERROR') {
    return (
      <p role="alert" className="px-2 text-sm text-destructive">
        {data.listError}
      </p>
    );
  }

  return (
    <>
      <AiThreadGroup
        label="已固定"
        threads={data.pinnedThreads}
        isMetadataPending={isMetadataPending}
        onThreadSelect={onThreadSelect}
        onTogglePinned={onTogglePinned}
        onRenameThread={onRenameThread}
        onToggleArchived={onToggleArchived}
      />
      <AiThreadGroup
        label="最近"
        threads={data.recentThreads}
        isMetadataPending={isMetadataPending}
        onThreadSelect={onThreadSelect}
        onTogglePinned={onTogglePinned}
        onRenameThread={onRenameThread}
        onToggleArchived={onToggleArchived}
      />
    </>
  );
}

/** 渲染归档会话列表的加载、空态和恢复入口。 */
function AiArchivedThreadView({
  data,
  isMetadataPending,
  onThreadSelect,
  onTogglePinned,
  onRenameThread,
  onToggleArchived,
}: {
  data: AiWorkspaceSidebarData;
  isMetadataPending: boolean;
  onThreadSelect: (threadId: string) => void;
  onTogglePinned: (threadId: string, pinned: boolean) => Promise<boolean>;
  onRenameThread: (threadId: string, title: string) => Promise<boolean>;
  onToggleArchived: (threadId: string, archived: boolean) => Promise<boolean>;
}) {
  if (data.archivedListState === 'LOADING') {
    return <p className="px-2 text-sm text-muted-foreground">正在加载已归档会话…</p>;
  }
  if (data.archivedListState === 'ERROR') {
    return (
      <p role="alert" className="px-2 text-sm text-destructive">
        {data.archivedListError}
      </p>
    );
  }

  return (
    <AiThreadGroup
      label="已归档"
      threads={data.archivedThreads}
      isMetadataPending={isMetadataPending}
      onThreadSelect={onThreadSelect}
      onTogglePinned={onTogglePinned}
      onRenameThread={onRenameThread}
      onToggleArchived={onToggleArchived}
      isArchivedView
    />
  );
}

/** 渲染一组按时间或用途归类的会话预览。 */
function AiThreadGroup({
  label,
  threads,
  isMetadataPending,
  onThreadSelect,
  onTogglePinned,
  onRenameThread,
  onToggleArchived,
  isArchivedView = false,
}: {
  label: string;
  threads: AiWorkspaceThreadPreview[];
  isMetadataPending: boolean;
  onThreadSelect: (threadId: string) => void;
  onTogglePinned: (threadId: string, pinned: boolean) => Promise<boolean>;
  onRenameThread: (threadId: string, title: string) => Promise<boolean>;
  onToggleArchived: (threadId: string, archived: boolean) => Promise<boolean>;
  isArchivedView?: boolean;
}) {
  return (
    <section className="mt-5 first:mt-0" aria-labelledby={`ai-thread-group-${label}`}>
      <h2 id={`ai-thread-group-${label}`} className="px-2 text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="mt-2 space-y-1">
        {threads.length === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">暂无会话</p> : null}
        {threads.map((thread) => (
          <AiThreadPreview
            key={thread.id}
            thread={thread}
            isMetadataPending={isMetadataPending}
            isArchivedView={isArchivedView}
            onThreadSelect={onThreadSelect}
            onTogglePinned={onTogglePinned}
            onRenameThread={onRenameThread}
            onToggleArchived={onToggleArchived}
          />
        ))}
      </div>
    </section>
  );
}

/** 渲染单条会话及其悬浮时才出现的固定和更多操作。 */
function AiThreadPreview({
  thread,
  isMetadataPending,
  isArchivedView,
  onThreadSelect,
  onTogglePinned,
  onRenameThread,
  onToggleArchived,
}: {
  thread: AiWorkspaceThreadPreview;
  isMetadataPending: boolean;
  isArchivedView: boolean;
  onThreadSelect: (threadId: string) => void;
  onTogglePinned: (threadId: string, pinned: boolean) => Promise<boolean>;
  onRenameThread: (threadId: string, title: string) => Promise<boolean>;
  onToggleArchived: (threadId: string, archived: boolean) => Promise<boolean>;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(thread.title);

  /** 打开重命名弹窗时以服务端当前标题初始化表单。 */
  function handleRenameOpenChange(open: boolean): void {
    setIsRenameOpen(open);
    if (open) setRenameTitle(thread.title);
  }

  /** 提交重命名并仅在服务端成功后关闭弹窗。 */
  async function handleRenameSubmit(): Promise<void> {
    const title = renameTitle.trim();
    if (!title || isMetadataPending) return;

    const renamed = await onRenameThread(thread.id, title);
    if (renamed) setIsRenameOpen(false);
  }

  const actionDisabled = isMetadataPending;

  return (
    <>
      <div className="group/thread relative">
        <Button
          type="button"
          variant={thread.isActive ? 'secondary' : 'ghost'}
          className="h-9 w-full justify-start rounded-lg px-2.5 pr-16 text-left text-sm"
          onClick={() => onThreadSelect(thread.id)}
        >
          <span className="truncate">{thread.title}</span>
        </Button>
        <div
          className={`absolute top-1/2 right-1 z-10 flex -translate-y-1/2 items-center gap-0.5 transition-opacity ${
            isMenuOpen
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 group-hover/thread:pointer-events-auto group-hover/thread:opacity-100'
          }`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="bg-muted/80"
            aria-label={
              isArchivedView
                ? `归档会话不能置顶：${thread.title}`
                : thread.pinnedAt
                  ? `取消置顶：${thread.title}`
                  : `置顶：${thread.title}`
            }
            disabled={actionDisabled || isArchivedView}
            onClick={() => void onTogglePinned(thread.id, thread.pinnedAt === null)}
          >
            <Pin aria-hidden />
          </Button>
          <DropdownMenu onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="bg-muted/80"
                aria-label={`更多操作：${thread.title}`}
                disabled={actionDisabled}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={6}>
              <DropdownMenuItem onSelect={() => handleRenameOpenChange(true)}>
                <Pencil aria-hidden />
                重命名
              </DropdownMenuItem>
              {!isArchivedView ? (
                <DropdownMenuItem onSelect={() => void onTogglePinned(thread.id, thread.pinnedAt === null)}>
                  <Pin aria-hidden />
                  {thread.pinnedAt ? '取消置顶' : '置顶'}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onToggleArchived(thread.id, !thread.archivedAt)}>
                <Archive aria-hidden />
                {thread.archivedAt ? '恢复会话' : '归档会话'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Dialog open={isRenameOpen} onOpenChange={handleRenameOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription>标题只用于侧栏识别，不会改变会话中的消息内容。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`ai-thread-title-${thread.id}`}>会话标题</Label>
            <Input
              id={`ai-thread-title-${thread.id}`}
              value={renameTitle}
              maxLength={100}
              autoFocus
              onChange={(event) => setRenameTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleRenameSubmit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isMetadataPending}>
                取消
              </Button>
            </DialogClose>
            <Button type="button" disabled={!renameTitle.trim() || isMetadataPending} onClick={() => void handleRenameSubmit()}>
              {isMetadataPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
