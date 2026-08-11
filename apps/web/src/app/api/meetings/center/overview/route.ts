/**
 * 本文件代理会议中心日程概览查询并透传浏览器筛选参数。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发会议中心日程概览请求。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/meetings/center/overview',
    fallbackMessage: '会议日程加载失败，请稍后重试',
  });
}
