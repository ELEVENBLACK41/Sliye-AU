/** 本文件组合 AI 工作台的真实 Thread 路由数据与既有页面布局。 */
'use client';

import { useMemo } from 'react';

import { AiWorkspaceMobileHeader, AiWorkspaceSidebar } from './ai-workspace-sidebar';
import { AiChatSurface } from './ai-chat-surface';
import { useAiThreadWorkspace } from '../hooks/use-ai-thread-workspace';
import { toAiWorkspaceMessages } from '../utils/ai-workspace-message';

/** 渲染由 URL 驱动的 AI Thread 工作区，并连接真实 Thread 命令。 */
export function AiWorkspace() {
  // hooks/useAiThreadWorkspace 负责在 URL threadId 变化时加载 Thread 数据，并提供对 Thread 的操作方法。
  const workspace = useAiThreadWorkspace();
  const sidebarData = {
    pinnedThreads: workspace.pinnedThreads,
    recentThreads: workspace.recentThreads,
    archivedThreads: workspace.archivedThreads,
    listState: workspace.listState,
    listError: workspace.listError,
    archivedListState: workspace.archivedListState,
    archivedListError: workspace.archivedListError,
    metadataError: workspace.metadataError,
    metadataPendingThreadId: workspace.metadataPendingThreadId,
  };

  const sidebarActions = {
    onThreadSelect: workspace.selectThread,
    onNewThread: workspace.startNewThread,
    onShowArchived: workspace.loadArchivedThreads,
    onTogglePinned: workspace.setThreadPinned,
    onRenameThread: workspace.renameThread,
    onToggleArchived: workspace.setThreadArchived,
  };

  return (
    <section
      className="mt-6 flex min-h-[calc(100dvh-8rem)] min-w-0 flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-card/75 shadow-sm lg:min-h-0"
      aria-label="AI 实验室"
    >
      <AiWorkspaceSidebar
        data={sidebarData}
        {...sidebarActions}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AiWorkspaceMobileHeader
          data={sidebarData}
          {...sidebarActions}
        />
        <AiWorkspaceContent workspace={workspace} />
      </div>
    </section>
  );
}

/** 渲染详情、历史消息、实时事件、Thread 命令和四态反馈。 */
function AiWorkspaceContent({ workspace }: { workspace: ReturnType<typeof useAiThreadWorkspace> }) {
  const messages = useMemo(
    () => toAiWorkspaceMessages(workspace.threadState.messages, workspace.runEventState),
    [workspace.runEventState, workspace.threadState.messages],
  );
  const activeRunStatus = workspace.runEventState?.status ?? workspace.threadState.activeRun?.status ?? null;

  if (!workspace.threadId) {
    return (
      <AiChatSurface
        messages={[]}
        activeRunStatus={null}
        streamState={workspace.streamState}
        streamError={workspace.streamError}
        queuedMessages={workspace.queuedMessages}
        commandState={workspace.commandState}
        commandError={workspace.commandError}
        onSubmitMessage={workspace.submitMessage}
        onStop={() => void workspace.stopCurrentRun()}
        onRetry={(runId) => void workspace.retryRun(runId)}
      />
    );
  }

  if (workspace.threadLoadState === 'LOADING') {
    return <p className="p-6 text-sm text-muted-foreground">正在加载会话…</p>;
  }

  if (workspace.threadLoadState === 'ERROR') {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {workspace.threadError}
      </p>
    );
  }

  if (workspace.messageLoadState === 'ERROR') {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {workspace.messageError}
      </p>
    );
  }

  if (workspace.messageLoadState === 'LOADING') {
    return <p className="p-6 text-sm text-muted-foreground">正在加载消息…</p>;
  }

  return (
    <AiChatSurface
      messages={messages}
      activeRunStatus={activeRunStatus}
      streamState={workspace.streamState}
      streamError={workspace.streamError}
      queuedMessages={workspace.queuedMessages}
      commandState={workspace.commandState}
      commandError={workspace.commandError}
      onSubmitMessage={workspace.submitMessage}
      onStop={() => void workspace.stopCurrentRun()}
      onRetry={(runId) => void workspace.retryRun(runId)}
    />
  );
}
