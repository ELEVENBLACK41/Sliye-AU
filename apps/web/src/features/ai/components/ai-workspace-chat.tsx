/**
 * 本文件提供 C3 官方 useChat 工作台入口。
 * 动态 Thread 使用 UI Message Stream；无 Thread 的 `/ai` 仍由旧工作台提供临时回退。
 */
'use client';

import { AiWorkspaceMobileHeader, AiWorkspaceSidebar } from './ai-workspace-sidebar';
import { AiChatSurface } from './ai-chat-surface';
import { useAiChat } from '../hooks/use-ai-chat';

/** 渲染动态 Thread 的官方 useChat 工作台及既有侧栏布局。 */
export function AiWorkspaceChat() {
  const chat = useAiChat();
  const sidebarData = {
    pinnedThreads: chat.pinnedThreads,
    recentThreads: chat.recentThreads,
    archivedThreads: chat.archivedThreads,
    listState: chat.listState,
    listError: chat.listError,
    archivedListState: chat.archivedListState,
    archivedListError: chat.archivedListError,
    metadataError: chat.metadataError,
    metadataPendingThreadId: chat.metadataPendingThreadId,
  };
  const sidebarActions = {
    onThreadSelect: chat.selectThread,
    onNewThread: chat.startNewThread,
    onShowArchived: chat.loadArchivedThreads,
    onTogglePinned: chat.setThreadPinned,
    onRenameThread: chat.renameThread,
    onToggleArchived: chat.setThreadArchived,
  };

  return (
    <section
      className="mt-6 flex min-h-[calc(100dvh-8rem)] min-w-0 flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-card/75 shadow-sm lg:min-h-0"
      aria-label="AI 实验室"
    >
      <AiWorkspaceSidebar data={sidebarData} {...sidebarActions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AiWorkspaceMobileHeader data={sidebarData} {...sidebarActions} />
        <AiWorkspaceChatContent chat={chat} />
      </div>
    </section>
  );
}

/** 渲染 useChat 工作台的加载、错误、空会话和正常对话状态。 */
function AiWorkspaceChatContent({ chat }: { chat: ReturnType<typeof useAiChat> }) {
  if (chat.threadLoadState === 'LOADING') {
    return <p className="p-6 text-sm text-muted-foreground">正在加载会话…</p>;
  }

  if (chat.threadLoadState === 'ERROR') {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {chat.threadError}
      </p>
    );
  }

  if (chat.messageLoadState === 'ERROR') {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {chat.messageError}
      </p>
    );
  }

  if (chat.messageLoadState === 'LOADING') {
    return <p className="p-6 text-sm text-muted-foreground">正在加载消息…</p>;
  }

  return (
    <AiChatSurface
      messages={chat.workspaceMessages}
      activeRunStatus={chat.activeRunStatus}
      streamState={chat.streamState}
      streamError={chat.chatError}
      queuedMessages={[]}
      commandState={chat.commandState}
      commandError={null}
      onSubmitMessage={chat.submitMessage}
      onStop={chat.stopChat}
      onRetry={() => chat.retryLastMessage()}
    />
  );
}
