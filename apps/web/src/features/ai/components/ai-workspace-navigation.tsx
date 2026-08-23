/**
 * 本文件组合 AI 工作区的桌面可收起侧栏与移动端历史 Sheet。
 */
'use client';

import { ChevronRight, History, Plus } from 'lucide-react';

import type { AiThreadArchiveState, AiThreadListItem } from '@workspace/contracts/ai';
import { Button } from '@workspace/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet';

import { AiThreadHistory } from './ai-thread-history';

/** 工作区历史导航属性。 */
export type AiWorkspaceNavigationProps = {
  /** 当前路由选中的 Thread。 */
  activeThreadId: string | null;
  /** 当前归档筛选。 */
  archiveState: AiThreadArchiveState;
  /** 当前历史列表。 */
  threads: AiThreadListItem[];
  /** 列表是否正在加载。 */
  loading: boolean;
  /** 列表加载错误。 */
  error: string | null;
  /** 当前筛选是否仍有下一页。 */
  hasMore: boolean;
  /** 正在执行管理操作的 Thread。 */
  pendingThreadId: string | null;
  /** 移动端 Sheet 是否打开。 */
  sheetOpen: boolean;
  /** 桌面侧栏是否收起。 */
  collapsed: boolean;
  /** 更新移动端 Sheet。 */
  onSheetOpenChange: (open: boolean) => void;
  /** 更新桌面侧栏。 */
  onCollapsedChange: (collapsed: boolean) => void;
  /** 切换归档筛选。 */
  onArchiveStateChange: (state: AiThreadArchiveState) => void;
  /** 新建前端草稿。 */
  onCreate: () => void;
  /** 选择 Thread。 */
  onSelect: (threadId: string) => void;
  /** 重命名 Thread。 */
  onRename: (threadId: string, title: string) => Promise<boolean>;
  /** 归档或恢复 Thread。 */
  onSetArchived: (threadId: string, archived: boolean) => Promise<boolean>;
  /** 重新读取当前列表。 */
  onReload: () => void;
  /** 读取下一页列表。 */
  onLoadMore: () => void;
};

/** 渲染响应式会话历史导航，并把收起按钮放入桌面头部操作区。 */
export function AiWorkspaceNavigation({
  activeThreadId,
  archiveState,
  threads,
  loading,
  error,
  hasMore,
  pendingThreadId,
  sheetOpen,
  collapsed,
  onSheetOpenChange,
  onCollapsedChange,
  onArchiveStateChange,
  onCreate,
  onSelect,
  onRename,
  onSetArchived,
  onReload,
  onLoadMore,
}: AiWorkspaceNavigationProps) {
  const historyProps = {
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
  };

  return (
    <>
      <div className="hidden min-h-0 border-r lg:block">
        {collapsed ? (
          <div className="flex h-full w-14 flex-col items-center gap-2 py-3">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="展开 AI 会话历史"
              onClick={() => onCollapsedChange(false)}
            >
              <ChevronRight aria-hidden />
            </Button>
            <Button type="button" size="icon-sm" aria-label="新建 AI 会话" onClick={onCreate}>
              <Plus aria-hidden />
            </Button>
            <History aria-hidden className="mt-2 size-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="h-full w-80 min-h-0">
            <AiThreadHistory {...historyProps} onCollapse={() => onCollapsedChange(true)} />
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent side="left" className="w-[min(22rem,92vw)] gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>AI 会话历史</SheetTitle>
            <SheetDescription>选择、重命名、归档或恢复一条决策过程 AI 会话。</SheetDescription>
          </SheetHeader>
          <AiThreadHistory {...historyProps} />
        </SheetContent>
      </Sheet>
    </>
  );
}
