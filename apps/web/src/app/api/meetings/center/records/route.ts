/**
 * 本文件代理会议中心历史记录查询并透传浏览器筛选参数。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发会议中心历史记录请求。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/meetings/center/records',
    fallbackMessage: '会议记录加载失败，请稍后重试',
  });
}
