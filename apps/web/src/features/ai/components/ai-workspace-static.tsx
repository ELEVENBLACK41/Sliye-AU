/**
 * 本文件组合 AI 工作台的线程导航状态与对话画布，是 AI 页面当前的客户端入口。
 */
'use client';

import { useState } from 'react';

import { AiChatSurface } from './ai-chat-surface';
import { AiWorkspaceMobileHeader, AiWorkspaceSidebar } from './ai-workspace-sidebar';
import type { AiWorkspaceStaticData } from './ai-workspace-types';

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
        <AiWorkspaceMobileHeader data={workspaceData} onThreadPinToggle={handleThreadPinToggle} />
        <AiChatSurface userName={workspaceData.userName} />
      </div>
    </section>
  );
}
