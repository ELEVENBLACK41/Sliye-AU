/**
 * 本文件代理单场会议详情请求。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 会议详情 BFF 动态路由参数。 */
type MeetingRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 转发会议详情查询。 */
export async function GET(request: Request, context: MeetingRouteContext) {
  const { meetingId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/meetings/${meetingId}`,
    fallbackMessage: '会议详情加载失败，请稍后重试',
  });
}
