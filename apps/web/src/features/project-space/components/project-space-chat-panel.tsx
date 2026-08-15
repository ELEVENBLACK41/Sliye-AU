/**
 * 本文件把已验证的聊天状态能力接入新版项目空间的群组头部、消息流和输入区域。
 */
'use client';

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MoreHorizontal, Paperclip, Search, Send, UsersRound, Video, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectChatMessagePage,
  ProjectMember,
  ProjectDetail,
  ProjectUserSummary,
} from '@workspace/contracts/projects';

import { ProjectCurrentAreaMembersSheet } from './project-current-area-members';
import { ProjectDecisionCreateSheet } from './project-decision-create-sheet';
import { ProjectSpaceChatMessageList } from './project-space-chat-message-list';
import { useProjectSpaceChat, type ProjectSpaceChatViewMessage } from '../hooks/use-project-space-chat';
import type { ProjectSpaceChatConnectionStatus } from '../hooks/use-project-space-chat-realtime';
import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';

/** 新版项目空间聊天面板属性。 */
type ProjectSpaceChatPanelProps = {
  /** 当前项目主键。 */
  projectId: number;
  /** 当前项目详情。 */
  project: ProjectDetail;
  /** 当前讨论分区。 */
  area: DiscussionAreaSummary;
  /** 当前私有分区的显式成员。 */
  privateAreaMembers: DiscussionAreaMember[];
  /** 当前项目全部成员。 */
  projectMembers: ProjectMember[];
  /** 当前分区首屏消息页。 */
  initialPage: ProjectChatMessagePage;
  /** 当前认证用户安全摘要。 */
  currentUser: ProjectUserSummary;
  /** 当前用户是否可以发送消息。 */
  canSend: boolean;
  /** 当前用户是否拥有创建决策权限。 */
  canCreateDecision: boolean;
  /** 禁止发送时展示的明确原因。 */
  readOnlyReason: string;
};

/** 实时连接状态的新版轻量文案。 */
const connectionText: Record<ProjectSpaceChatConnectionStatus, string> = {
  unavailable: '实时服务未配置',
  connecting: '实时连接中',
  connected: '实时已连接',
  reconnecting: '实时重连中',
  disconnected: '实时已断开',
};

/** 聊天视口上一次渲染后的滚动快照。 */
type ChatScrollSnapshot = {
  /** 当时第一条消息的稳定标识。 */
  firstMessageKey: string | null;
  /** 当时最后一条消息的稳定标识。 */
  lastMessageKey: string | null;
  /** 当时消息内容的完整高度。 */
  scrollHeight: number;
};

/** 渲染新版聊天视觉，同时复用真实分页、乐观发送和 Socket 状态。 */
export function ProjectSpaceChatPanel(props: ProjectSpaceChatPanelProps) {
  const { projectId, project, area, privateAreaMembers, initialPage, projectMembers, currentUser, canSend, canCreateDecision, readOnlyReason } = props;
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const scrollSnapshotRef = useRef<ChatScrollSnapshot | null>(null);
  const isNearBottomRef = useRef(true);
  const chat = useProjectSpaceChat({
    projectId,
    areaId: area.id,
    initialPage,
    currentUser,
    canSend,
    onAccessRevoked: () => {
      router.replace(`/projects?projectId=${projectId}`);
      router.refresh();
    },
  });

  /** 初次进入定位最新消息，新增消息按阅读位置跟随，加载历史时保持原视口。 */
  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    const firstMessage = chat.messages[0];
    const lastMessage = chat.messages.at(-1);
    const firstMessageKey = firstMessage ? getMessageKey(firstMessage) : null;
    const lastMessageKey = lastMessage ? getMessageKey(lastMessage) : null;
    const previousSnapshot = scrollSnapshotRef.current;

    if (!previousSnapshot) {
      viewport.scrollTop = viewport.scrollHeight;
      isNearBottomRef.current = true;
    } else {
      const historyWasPrepended =
        previousSnapshot.firstMessageKey !== firstMessageKey &&
        previousSnapshot.lastMessageKey === lastMessageKey;
      const latestMessageChanged = previousSnapshot.lastMessageKey !== lastMessageKey;

      if (historyWasPrepended) {
        viewport.scrollTop += viewport.scrollHeight - previousSnapshot.scrollHeight;
      } else if (
        latestMessageChanged &&
        (lastMessage?.author?.id === currentUser.id || isNearBottomRef.current)
      ) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    scrollSnapshotRef.current = { firstMessageKey, lastMessageKey, scrollHeight: viewport.scrollHeight };
  }, [chat.messages, currentUser.id]);

  /** 记录用户是否仍在消息底部附近，避免阅读历史时被实时消息强制打断。 */
  function handleMessageScroll(): void {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    isNearBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 72;
  }

  /** 提交当前草稿，并在乐观入队成功后清空输入。 */
  function submitDraft(): void {
    if (chat.sendMessage(draft)) setDraft('');
  }

  /** 处理聊天输入表单提交。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  /** 创建当前群组范围的决策后直接进入新版决策工作区。 */
  function handleDecisionCreated(decision: { id: number }): void {
    router.push(`/projects?projectId=${projectId}&areaId=${area.id}&section=decisions&decisionId=${decision.id}`);
  }

  /** 处理 Enter 发送和 Shift+Enter 换行。 */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitDraft();
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col" aria-labelledby="active-group-title">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-black/8 bg-white/28 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f5bf19]">
          <UsersRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="active-group-title" className="text-sm font-semibold">{area.name}</h2>
            <span className="inline-flex items-center gap-1 text-[9px] text-black/35">
              <span className={`size-1.5 rounded-full ${chat.connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-black/20'}`} aria-hidden />
              {connectionText[chat.connectionStatus]}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-black/60">
            {area.type === 'PUBLIC' ? `全部 ${area.memberCount} 位项目成员` : `${area.memberCount} 位分区成员 · 私有群组`}
          </p>
        </div>
        <div className="flex items-center gap-1.5" aria-label="群组操作">
          <ProjectCurrentAreaMembersSheet
            area={area}
            projectMembers={projectMembers}
            privateAreaMembers={privateAreaMembers}
          />
          <Button type="button" variant="outline" size="icon" className="size-8 rounded-lg border-black/10 bg-white/55 shadow-none" aria-label="搜索群消息">
            <Search className="size-3.5" aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-8 rounded-lg border-black/10 bg-white/55 shadow-none" aria-label="发起群会议">
            <Video className="size-3.5" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="更多群组操作">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <div
        ref={messageViewportRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="项目群聊天消息"
        onScroll={handleMessageScroll}
      >
        <ProjectSpaceChatMessageList
          messages={chat.messages}
          currentUserId={currentUser.id}
          canSend={canSend}
          hasMoreHistory={chat.hasMoreHistory}
          isLoadingHistory={chat.isLoadingHistory}
          historyError={chat.historyError}
          onLoadOlder={() => void chat.loadOlderMessages()}
          onReply={chat.setReplyTo}
        />
      </div>

      <footer className="shrink-0 border-t border-black/8 bg-white/35 p-3">
        {canSend ? (
          <form className="rounded-2xl border border-black/10 bg-white/70 p-2 shadow-sm shadow-black/[0.02]" onSubmit={handleSubmit}>
            {chat.replyTo ? (
              <div className="mb-1 flex items-center justify-between rounded-xl bg-black/[0.04] px-2.5 py-1.5 text-[10px] text-black/55">
                <span className="truncate">回复：{chat.replyTo.content || '该消息已删除'}</span>
                <Button type="button" variant="ghost" size="icon" className="size-6 rounded-full" aria-label="取消回复" onClick={chat.clearReply}>
                  <X className="size-3" aria-hidden />
                </Button>
              </div>
            ) : null}
            <Textarea
              value={draft}
              maxLength={2000}
              rows={2}
              aria-label="发送项目群消息"
              placeholder="发送消息，或从讨论中发起决策、提案……"
              className="min-h-12 resize-none border-0 bg-transparent px-2 py-1 text-xs shadow-none focus-visible:ring-0"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-7 rounded-lg" aria-label="添加附件">
                  <Paperclip className="size-3.5" aria-hidden />
                </Button>
                <ProjectDecisionCreateSheet
                  project={project}
                  currentArea={area}
                  canCreate={canCreateDecision}
                  onCreated={handleDecisionCreated}
                  composer
                />
              </div>
              <Button type="submit" size="sm" disabled={!draft.trim()} className="h-7 rounded-full bg-[#292a27] px-3 text-[10px] text-white hover:bg-[#3b3c38]">
                发送 <Send className="size-3" aria-hidden />
              </Button>
            </div>
          </form>
        ) : (
          <p className="rounded-xl border border-black/8 bg-white/55 px-3 py-2 text-xs text-black/45">{readOnlyReason}</p>
        )}
      </footer>
    </section>
  );
}

/** 返回乐观消息和持久化消息都稳定一致的客户端标识。 */
function getMessageKey(message: ProjectSpaceChatViewMessage): string {
  return message.clientMessageId ? `client:${message.clientMessageId}` : `id:${message.id}`;
}
