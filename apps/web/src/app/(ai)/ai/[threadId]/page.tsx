/** 本文件提供 AI Thread 的深链接入口，具体工作区状态由 feature Hook 管理。 */

import { AiWorkspace } from '@/features/ai/components/ai-workspace';

/** 渲染 URL 指定的 AI Thread 工作区。 */
export default function AiThreadPage() {
  return <AiWorkspace />;
}
