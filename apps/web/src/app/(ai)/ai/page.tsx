/**
 * 本文件提供新 AI 会话工作区入口；现有会话由动态 Thread 路由恢复。
 */
import { AiWorkspace } from '@/features/ai/components/ai-workspace';

/** 渲染没有指定 Thread 的新会话工作区。 */
export default function AiPage() {
  return <AiWorkspace />;
}
