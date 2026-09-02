/** 本文件提供 AI Thread 的深链接入口，并接入 C3 官方 useChat 工作台。 */

import { AiWorkspaceChat } from '@/features/ai/components/ai-workspace-chat';

/** 渲染 URL 指定的官方 UI Message Stream 工作区。 */
export default function AiThreadPage() {
  return <AiWorkspaceChat />;
}
