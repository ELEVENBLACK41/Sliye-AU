/**
 * 本文件将浏览器的关系图谱刷新请求通过受认证 BFF 转发到 NestJS。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发当前用户可见的完整关系图谱查询。 */
export function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/relationship-graph',
    fallbackMessage: '关系图谱加载失败，请稍后重试',
  });
}
