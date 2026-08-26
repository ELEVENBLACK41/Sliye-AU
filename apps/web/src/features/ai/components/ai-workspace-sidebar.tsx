/**
 * 本文件提供 AI 工作台的桌面侧栏和移动端会话记录抽屉。
 */
'use client';

import { useState } from 'react';
import { Archive, MoreHorizontal, PanelLeft, Pencil, Pin, Plus } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';

import type { AiWorkspaceLoadState, AiWorkspaceThreadPreview } from '../types/ai-workspace';

/** 侧栏展示所需的真实 Thread 列表与加载状态。 */
type AiWorkspaceSidebarData = {
  pinnedThreads: AiWorkspaceThreadPreview[];
  recentThreads: AiWorkspaceThreadPreview[];
  listState: AiWorkspaceLoadState;
  listError: string | null;
};

/** 渲染仅包含已固定和最近会话的桌面端侧栏。 */
export function AiWorkspaceSidebar({
  data,
  onThreadSelect,
  onNewThread,
}: {
  data: AiWorkspaceSidebarData;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}) {
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-muted/30 p-3 pt-6 lg:flex"
      aria-label="AI 对话导航"
    >
      <AiWorkspaceSidebarContent data={data} onThreadSelect={onThreadSelect} onNewThread={onNewThread} />
    </aside>
  );
}

/** 渲染移动端的对话记录抽屉入口。 */
export function AiWorkspaceMobileHeader({
  data,
  onThreadSelect,
  onNewThread,
}: {
  data: AiWorkspaceSidebarData;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}) {
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
          </SheetHeader>
          <AiWorkspaceSidebarContent data={data} onThreadSelect={onThreadSelect} onNewThread={onNewThread} />
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
}: {
  data: AiWorkspaceSidebarData;
  onThreadSelect: (threadId: string) => void;
  onNewThread: () => void;
}) {
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
      {data.listState === 'LOADING' ? <p className="px-2 text-sm text-muted-foreground">正在加载会话…</p> : null}
      {data.listState === 'ERROR' ? (
        <p role="alert" className="px-2 text-sm text-destructive">
          {data.listError}
        </p>
      ) : null}
      {data.listState === 'SUCCESS' ? (
        <>
          <AiThreadGroup label="已固定" threads={data.pinnedThreads} onThreadSelect={onThreadSelect} />
          <AiThreadGroup label="最近" threads={data.recentThreads} onThreadSelect={onThreadSelect} />
        </>
      ) : null}
      <div className="mt-auto border-t border-border/70 pt-3">
        <Button type="button" variant="ghost" className="w-full justify-start px-2 text-muted-foreground">
          <Archive aria-hidden />
          查看已归档的聊天
        </Button>
      </div>
    </>
  );
}

/** 渲染一组按时间或用途归类的会话预览。 */
function AiThreadGroup({
  label,
  threads,
  onThreadSelect,
}: {
  label: string;
  threads: AiWorkspaceThreadPreview[];
  onThreadSelect: (threadId: string) => void;
}) {
  return (
    <section className="mt-5 first:mt-0" aria-labelledby={`ai-thread-group-${label}`}>
      <h2 id={`ai-thread-group-${label}`} className="px-2 text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="mt-2 space-y-1">
        {threads.length === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">暂无会话</p> : null}
        {threads.map((thread) => (
          <AiThreadPreview key={thread.id} thread={thread} onThreadSelect={onThreadSelect} />
        ))}
      </div>
    </section>
  );
}

/** 渲染单条会话及其悬浮时才出现的固定和更多操作。 */
function AiThreadPreview({
  thread,
  onThreadSelect,
}: {
  thread: AiWorkspaceThreadPreview;
  onThreadSelect: (threadId: string) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
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
          aria-label={`置顶操作将在后续步骤接入：${thread.title}`}
          disabled
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
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={6}>
            <DropdownMenuItem>
              <Pencil aria-hidden />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem disabled>置顶将在后续步骤接入</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>归档将在后续步骤接入</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
