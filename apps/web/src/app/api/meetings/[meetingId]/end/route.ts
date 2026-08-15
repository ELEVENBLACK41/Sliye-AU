/**
 * 本文件代理会议结束请求。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 会议结束 BFF 动态路由参数。 */
type MeetingEndRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 转发会议结束操作。 */
export async function POST(request: Request, context: MeetingEndRouteContext) {
  const { meetingId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/meetings/${meetingId}/end`,
    fallbackMessage: '会议结束失败，请稍后重试',
  });
}
