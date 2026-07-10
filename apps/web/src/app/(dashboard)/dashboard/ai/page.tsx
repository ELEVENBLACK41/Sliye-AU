/**
 * 本文件是 AI 对话页面入口，在服务端校验 `ai:chat:use` 权限码。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { AiChatPanel } from '@/features/ai/components/ai-chat-panel';
import { requireServerPermission } from '@/features/auth/services/auth-server.service';

/** 渲染已授权用户的 AI 对话测试页。 */
export default async function AiPage() {
  await requireServerPermission(SYSTEM_PERMISSIONS.ai.chatUse);

  return <AiChatPanel />;
}
