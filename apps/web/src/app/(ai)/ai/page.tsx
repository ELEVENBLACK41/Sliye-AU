/**
 * 本文件提供第 2.4 阶段绑定单项决策的真实 AI Agent 测试入口。
 */

import { AiChatPanel } from '@/features/ai/components/ai-chat-panel';

/** 渲染 Decision Agent 页面，并允许通过查询参数预填 decisionId。 */
export default async function AiPage({ searchParams }: { searchParams: Promise<{ decisionId?: string }> }) {
  const params = await searchParams;
  const parsedDecisionId = Number(params.decisionId);
  const initialDecisionId = Number.isInteger(parsedDecisionId) && parsedDecisionId > 0 ? parsedDecisionId : undefined;

  return (
    <div className="flex min-h-0 flex-1 p-4 md:p-6">
      <AiChatPanel initialDecisionId={initialDecisionId} />
    </div>
  );
}
