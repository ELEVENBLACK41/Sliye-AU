/**
 * 本文件代理项目列表和创建请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发当前用户的项目列表查询。 */
export function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/projects',
    fallbackMessage: '项目列表加载失败，请稍后重试',
  });
}

/** 转发项目创建请求。 */
export function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/projects',
    fallbackMessage: '项目创建失败，请稍后重试',
  });
}
