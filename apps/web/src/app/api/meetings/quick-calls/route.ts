/** 本文件代理快速通话创建请求。 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发快速通话创建。 */
export async function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/meetings/quick-calls',
    fallbackMessage: '快速通话发起失败，请稍后重试',
  });
}
