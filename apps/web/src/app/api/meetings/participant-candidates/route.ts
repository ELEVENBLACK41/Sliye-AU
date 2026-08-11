/** 本文件代理独立会议联系人候选查询。 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发联系人分页搜索。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    // 通用代理会统一透传浏览器查询串，此处只提供不带查询参数的 Nest 路径。
    nestPath: '/meetings/participant-candidates',
    fallbackMessage: '联系人加载失败，请稍后重试',
  });
}
