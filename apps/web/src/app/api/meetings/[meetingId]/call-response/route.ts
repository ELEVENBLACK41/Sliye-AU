/** 本文件代理快速通话接听或拒绝请求。 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 快速通话响应路由参数。 */
type MeetingCallResponseRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 转发当前用户的来电响应。 */
export async function POST(request: Request, context: MeetingCallResponseRouteContext) {
  const { meetingId } = await context.params;
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/meetings/${meetingId}/call-response`,
    fallbackMessage: '来电响应失败，请稍后重试',
  });
}
