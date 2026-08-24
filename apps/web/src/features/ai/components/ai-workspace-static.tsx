/**
 * 本文件提供 AI 实验室的静态工作台外壳，后续由线程列表和消息流真实数据替换预置内容。
 */
'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import {
  Archive,
  ArrowUp,
  Copy,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';
import { Textarea } from '@workspace/ui/components/textarea';

/** AI 工作台历史条目的静态展示结构，后续替换为 AI Thread 摘要契约。 */
type AiWorkspaceThreadPreview = {
  /** 线程稳定标识，后续用于跳转和恢复会话。 */
  id: string;
  /** 用户在侧栏中识别会话的标题。 */
  title: string;
  /** 是否作为当前会话的视觉选中态。 */
  isActive?: boolean;
};

/** AI 工作台静态数据边界，真实数据接入时保持页面组件不变。 */
type AiWorkspaceStaticData = {
  /** 当前展示的用户称呼，后续由认证资料提供。 */
  userName: string;
  /** 可固定在侧栏的决策档案入口。 */
  pinnedThreads: AiWorkspaceThreadPreview[];
  /** 最近创建或访问的 AI 会话。 */
  recentThreads: AiWorkspaceThreadPreview[];
};

/** 静态首屏的临时数据；后续接入线程列表接口时替换为服务端数据。 */
const AI_WORKSPACE_STATIC_DATA: AiWorkspaceStaticData = {
  userName: 'Sliye',
  pinnedThreads: [
    { id: 'project-weekly-review', title: '本周项目决策复盘', isActive: true },
    { id: 'proposal-comparison', title: '比较三个提案的风险' },
  ],
  recentThreads: [
    { id: 'meeting-summary', title: '整理会议讨论要点' },
    { id: 'decision-brief', title: '生成产品决策简报' },
    { id: 'vote-analysis', title: '分析投票分歧原因' },
    { id: 'timeline-review', title: '回看关键过程节点' },
  ],
};

/** 渲染 AI 实验室的简洁静态主工作台。 */
export function AiWorkspaceStatic() {
  const [workspaceData, setWorkspaceData] = useState(AI_WORKSPACE_STATIC_DATA);

  /** 在静态页面中演示会话在“已固定”和“最近”之间的移动，后续替换为 Thread 更新请求。 */
  function handleThreadPinToggle(threadId: string): void {
    setWorkspaceData((currentData) => {
      const pinnedThread = currentData.pinnedThreads.find((thread) => thread.id === threadId);
      if (pinnedThread) {
        return {
          ...currentData,
          pinnedThreads: currentData.pinnedThreads.filter((thread) => thread.id !== threadId),
          recentThreads: [pinnedThread, ...currentData.recentThreads],
        };
      }

      const recentThread = currentData.recentThreads.find((thread) => thread.id === threadId);
      if (!recentThread) return currentData;

      return {
        ...currentData,
        pinnedThreads: [recentThread, ...currentData.pinnedThreads],
        recentThreads: currentData.recentThreads.filter((thread) => thread.id !== threadId),
      };
    });
  }

  return (
    <section
      className="mt-6 flex min-h-[calc(100dvh-8rem)] min-w-0 flex-1 overflow-hidden rounded-[1.4rem] border border-border/70 bg-card/75 shadow-sm lg:min-h-0"
      aria-label="AI 实验室"
    >
      <AiWorkspaceSidebar data={workspaceData} onThreadPinToggle={handleThreadPinToggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AiWorkspaceHeader data={workspaceData} onThreadPinToggle={handleThreadPinToggle} />
        <AiChatSurface userName={workspaceData.userName} />
      </div>
    </section>
  );
}

/** 渲染仅包含已固定和最近会话的桌面端侧栏。 */
function AiWorkspaceSidebar({
  data,
  onThreadPinToggle,
}: {
  data: AiWorkspaceStaticData;
  onThreadPinToggle: (threadId: string) => void;
}) {
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-muted/30 p-3 pt-6 lg:flex"
      aria-label="AI 对话导航"
    >
      <AiWorkspaceSidebarContent data={data} onThreadPinToggle={onThreadPinToggle} />
    </aside>
  );
}

/** 渲染可同时供桌面侧栏和移动端抽屉复用的会话导航内容。 */
function AiWorkspaceSidebarContent({
  data,
  onThreadPinToggle,
}: {
  data: AiWorkspaceStaticData;
  onThreadPinToggle: (threadId: string) => void;
}) {
  return (
    <>
      <Button type="button" variant="secondary" className="mb-4 h-10 w-full justify-start rounded-xl px-3 text-sm">
        <Plus aria-hidden />
        新聊天
      </Button>
      <AiThreadGroup label="已固定" threads={data.pinnedThreads} isPinned onThreadPinToggle={onThreadPinToggle} />
      <AiThreadGroup label="最近" threads={data.recentThreads} isPinned={false} onThreadPinToggle={onThreadPinToggle} />
      <div className="mt-auto border-t border-border/70 pt-3">
        <Button type="button" variant="ghost" className="w-full justify-start px-2 text-muted-foreground">
          <Archive aria-hidden />
          查看已归档的聊天
        </Button>
      </div>
    </>
  );
}

/** 渲染移动端的对话记录抽屉入口。 */
function AiWorkspaceHeader({
  data,
  onThreadPinToggle,
}: {
  data: AiWorkspaceStaticData;
  onThreadPinToggle: (threadId: string) => void;
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
          <AiWorkspaceSidebarContent data={data} onThreadPinToggle={onThreadPinToggle} />
        </SheetContent>
      </Sheet>
    </header>
  );
}

/** 渲染一组按时间或用途归类的会话预览。 */
function AiThreadGroup({
  label,
  threads,
  isPinned,
  onThreadPinToggle,
}: {
  label: string;
  threads: AiWorkspaceThreadPreview[];
  isPinned: boolean;
  onThreadPinToggle: (threadId: string) => void;
}) {
  return (
    <section className="mt-5 first:mt-0" aria-labelledby={`ai-thread-group-${label}`}>
      <h2 id={`ai-thread-group-${label}`} className="px-2 text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="mt-2 space-y-1">
        {threads.map((thread) => (
          <AiThreadPreview key={thread.id} thread={thread} isPinned={isPinned} onPinToggle={onThreadPinToggle} />
        ))}
      </div>
    </section>
  );
}

/** 渲染单条会话及其悬浮时才出现的固定和更多操作。 */
function AiThreadPreview({
  thread,
  isPinned,
  onPinToggle,
}: {
  thread: AiWorkspaceThreadPreview;
  isPinned: boolean;
  onPinToggle: (threadId: string) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="group/thread relative">
      <Button
        type="button"
        variant={thread.isActive ? 'secondary' : 'ghost'}
        className="h-9 w-full justify-start rounded-lg px-2.5 pr-16 text-left text-sm"
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
          aria-label={isPinned ? `取消固定 ${thread.title}` : `固定 ${thread.title}`}
          onClick={() => onPinToggle(thread.id)}
        >
          {isPinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
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
            <DropdownMenuItem onSelect={() => onPinToggle(thread.id)}>
              {isPinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
              {isPinned ? '取消置顶' : '置顶'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 aria-hidden />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** 渲染复用既有 `/api/chat` 流式测试机器人的 AI 对话主画布。 */
function AiChatSurface({ userName }: { userName: string }) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop, error } = useChat();
  const isRunning = status === 'submitted' || status === 'streaming';

  /** 提交当前输入内容，并交给既有 AI SDK 流式聊天链路处理。 */
  function handleMessageSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = input.trim();
    if (!text || isRunning) return;

    void sendMessage({ text });
    setInput('');
  }

  if (messages.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        <AiConversation messages={messages} />
        <div className="mx-auto w-full max-w-3xl pt-4">
          <AiComposer
            input={input}
            isRunning={isRunning}
            onInputChange={setInput}
            onStop={stop}
            onSubmit={handleMessageSubmit}
          />
          <AiChatError error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-1 flex-col justify-center px-4 py-8 lg:min-h-0 lg:px-8">
      <div className="mx-auto w-full max-w-3xl -translate-y-8 sm:-translate-y-12">
        <h1 className="mb-7 text-center text-2xl font-semibold tracking-tight text-foreground sm:mb-8 sm:text-3xl">
          {userName}，今天想推进哪一项决策？
        </h1>
        <AiComposer
          input={input}
          isRunning={isRunning}
          onInputChange={setInput}
          onStop={stop}
          onSubmit={handleMessageSubmit}
        />
        <AiChatError error={error} />
      </div>
    </div>
  );
}

/** 渲染消息流中的用户和 AI 文本，保留测试机器人工具调用的可见回退。 */
function AiConversation({ messages }: { messages: UIMessage[] }) {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto py-5"
      aria-live="polite"
    >
      {messages.map((message) => (
        <article key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[85%]'}>
          <div
            className={
              message.role === 'user'
                ? 'rounded-2xl rounded-tr-md bg-decision-accent-soft px-4 py-2.5 text-sm leading-6 text-decision-ink'
                : 'rounded-2xl rounded-tl-md bg-muted/60 px-4 py-2.5 text-sm leading-6 text-foreground'
            }
          >
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }

              if (part.type === 'tool-weather' || part.type === 'tool-convertFahrenheitToCelsius') {
                return (
                  <pre key={`${message.id}-${index}`} className="overflow-x-auto text-xs text-muted-foreground">
                    {JSON.stringify(part, null, 2)}
                  </pre>
                );
              }

              return null;
            })}
          </div>
          {message.role === 'assistant' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-1 text-muted-foreground"
              aria-label="复制 AI 回复"
            >
              <Copy aria-hidden />
            </Button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/** 渲染对话请求失败时的统一错误提示。 */
function AiChatError({ error }: { error: Error | undefined }) {
  if (!error) return null;

  return (
    <p
      role="alert"
      className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error.message || 'AI 对话暂时不可用，请稍后重试'}
    </p>
  );
}

/** 渲染连接既有流式聊天能力的消息输入框。 */
function AiComposer({
  input,
  isRunning,
  onInputChange,
  onStop,
  onSubmit,
}: {
  input: string;
  isRunning: boolean;
  onInputChange: (value: string) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="flex items-end gap-2 rounded-[1.35rem] border border-border bg-background p-2 shadow-sm"
      aria-label="发送 AI 消息"
      onSubmit={onSubmit}
    >
      <Textarea
        aria-label="向 Decision AI 提问"
        placeholder="描述你正在推进的决策，或粘贴一段讨论内容…"
        className="min-h-12 resize-none border-0 px-3 py-2 shadow-none focus-visible:ring-0"
        value={input}
        disabled={isRunning}
        onChange={(event) => onInputChange(event.currentTarget.value)}
      />
      {isRunning ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="mb-0.5 rounded-full"
          aria-label="停止生成"
          onClick={onStop}
        >
          <Square aria-hidden />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon-sm"
          className="mb-0.5 rounded-full"
          aria-label="发送消息"
          disabled={!input.trim()}
        >
          <ArrowUp aria-hidden />
        </Button>
      )}
    </form>
  );
}
