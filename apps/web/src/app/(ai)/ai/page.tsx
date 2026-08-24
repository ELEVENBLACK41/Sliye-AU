/**
 * 本文件提供 AI 实验室入口；当前仅渲染静态页面，后续接入 AI Thread 和业务上下文数据。
 */
import { AiWorkspaceStatic } from '@/features/ai/components/ai-workspace-static';

/** 渲染 AI 实验室的首屏静态工作台。 */
export default function AiPage() {
  return <AiWorkspaceStatic />;
}
