/**
 * 本文件代理议事列表和创建请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发当前用户的议事列表查询。 */
export function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/matters',
    fallbackMessage: '议事列表加载失败，请稍后重试',
  });
}

/** 转发议事创建请求。 */
export function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/matters',
    fallbackMessage: '议事创建失败，请稍后重试',
  });
}
