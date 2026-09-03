/**
 * 本文件代理固定会话列表查询。
 *
 * 该静态路由必须与 `[threadId]` 动态路由区分：Next.js 会优先匹配静态段，
 * 因此 `/api/ai/threads/pinned` 不会被当作 `threadId` 为 `pinned` 的会话详情。
 * 固定数量有上限、由服务端一次性返回，因此这里没有分页参数。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发固定会话列表查询。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/ai/threads/pinned',
    fallbackMessage: '固定会话加载失败，请稍后重试',
  });
}
