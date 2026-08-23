/**
 * 本文件通过稳定 Thread 路径恢复一条已授权的决策过程 AI 会话。
 */

import { AiWorkspace } from '@/features/ai/components/ai-workspace';

/** AI Thread 深链接页面属性。 */
type AiThreadPageProps = {
  /** Next.js 动态路径参数。 */
  params: Promise<{ threadId: string }>;
};

/** 渲染指定 Thread 的可恢复工作区，最终权限由 NestJS 重新裁决。 */
export default async function AiThreadPage({ params }: AiThreadPageProps) {
  const { threadId } = await params;
  return <AiWorkspace initialThreadId={threadId} />;
}
