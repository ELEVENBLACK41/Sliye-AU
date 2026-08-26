/** 本文件组合 AI 工作台的真实 Thread 路由数据与既有页面布局。 */
'use client';

import { useMemo } from 'react';

import { AiWorkspaceMobileHeader, AiWorkspaceSidebar } from './ai-workspace-sidebar';
import { AiChatSurface } from './ai-chat-surface';
import { useAiThreadWorkspace } from '../hooks/use-ai-thread-workspace';
import { toAiWorkspaceMessages } from '../utils/ai-workspace-message';

/** 渲染由 URL 驱动的 AI Thread 工作区；运行控制留给后续增量。 */
export function AiWorkspace() {
  const workspace = useAiThreadWorkspace();
  const sidebarData = {
    pinnedThreads: workspace.pinnedThreads,
    recentThreads: workspace.recentThreads,
    listState: workspace.listState,
    listError: workspace.listError,
  };

  return (
    <section
      className="mt-6 flex min-h-[calc(100dvh-8rem)] min-w-0 flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-card/75 shadow-sm lg:min-h-0"
      aria-label="AI 实验室"
    >
      <AiWorkspaceSidebar
        data={sidebarData}
        onThreadSelect={workspace.selectThread}
        onNewThread={workspace.startNewThread}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AiWorkspaceMobileHeader
          data={sidebarData}
          onThreadSelect={workspace.selectThread}
          onNewThread={workspace.startNewThread}
        />
        <AiWorkspaceContent workspace={workspace} />
      </div>
    </section>
  );
}

/** 渲染 2.6-B 的详情、历史消息、实时事件和四态反馈。 */
function AiWorkspaceContent({ workspace }: { workspace: ReturnType<typeof useAiThreadWorkspace> }) {
  const messages = useMemo(
    () => toAiWorkspaceMessages(workspace.threadState.messages, workspace.runEventState),
    [workspace.runEventState, workspace.threadState.messages],
  );
  const activeRunStatus = workspace.runEventState?.status ?? workspace.threadState.activeRun?.status ?? null;

  if (!workspace.threadId) {
    return <AiWorkspaceEmpty />;
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
      readOnly
    />
  );
}

/** 渲染还没有任何历史消息的真实空工作区。 */
function AiWorkspaceEmpty({ title }: { title?: string } = {}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title ?? '开始一段新的决策对话'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">会话消息将在下一步接入发送与实时运行能力。</p>
      </div>
    </div>
  );
}
