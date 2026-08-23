/**
 * 本文件提供第 2.6 阶段新建决策过程 AI 会话的工作区入口。
 */

import { AiWorkspace } from '@/features/ai/components/ai-workspace';

/** 新会话页面属性。 */
type AiPageProps = {
  /** 允许从决策页跳转时预填真实 Decision 主键。 */
  searchParams: Promise<{ decisionId?: string }>;
};

/** 渲染未绑定 Thread 的新会话工作区。 */
export default async function AiPage({ searchParams }: AiPageProps) {
  const params = await searchParams;
  const parsedDecisionId = Number(params.decisionId);
  const initialDecisionId = Number.isInteger(parsedDecisionId) && parsedDecisionId > 0 ? parsedDecisionId : undefined;

  return <AiWorkspace initialDecisionId={initialDecisionId} initialThreadId={null} />;
}
