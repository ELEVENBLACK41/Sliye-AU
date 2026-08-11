/** 本文件代理当前用户待处理快速来电查询。 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 查询仍在响应窗口内的来电。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/meetings/incoming-calls',
    fallbackMessage: '待处理来电加载失败',
  });
}
