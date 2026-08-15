/**
 * 本文件代理会议开始请求。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 会议开始 BFF 动态路由参数。 */
type MeetingStartRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 转发会议开始操作。 */
export async function POST(request: Request, context: MeetingStartRouteContext) {
  const { meetingId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/meetings/${meetingId}/start`,
    fallbackMessage: '会议开始失败，请稍后重试',
  });
}
