/** 本文件代理主持人取消预约会议请求。 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 取消预约会议路由参数。 */
type MeetingCancelRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 转发取消预约会议操作。 */
export async function POST(request: Request, context: MeetingCancelRouteContext) {
  const { meetingId } = await context.params;
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/meetings/${meetingId}/cancel`,
    fallbackMessage: '预约会议取消失败，请稍后重试',
  });
}
