/**
 * 本文件提供不预绑定组织、项目或决策的新建 AI 会话工作区入口。
 */

import { AiWorkspace } from '@/features/ai/components/ai-workspace';

/** 渲染未绑定 Thread 的新会话工作区。 */
export default function AiPage() {
  return <AiWorkspace initialThreadId={null} />;
}
