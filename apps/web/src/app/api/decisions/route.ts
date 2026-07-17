/**
 * 本文件代理决策列表与创建请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发决策列表查询。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/decisions',
    fallbackMessage: '决策列表加载失败，请稍后重试',
  });
}

/** 转发决策创建请求。 */
export async function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/decisions',
    fallbackMessage: '决策创建失败，请稍后重试',
  });
}
