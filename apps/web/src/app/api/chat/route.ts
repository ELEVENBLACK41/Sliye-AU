/**
 * 本文件保留旧 `/api/chat` 路径的明确迁移错误；真实 AI 流已迁到 `/api/ai/*`。
 */

import { apiError } from '@/app/api/_utils/response';

/** 拒绝继续使用已经移除天气 Mock 工具的旧入口。 */
export function POST(): Response {
  return apiError({
    status: 400,
    message: '旧 AI 测试入口已停用，请使用绑定决策的 /api/ai/threads',
    path: '/api/chat',
  });
}
