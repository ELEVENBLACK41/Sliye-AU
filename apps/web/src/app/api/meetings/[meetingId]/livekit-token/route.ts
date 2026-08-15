/**
 * 本文件代理受邀用户获取会议 LiveKit 音视频加入凭证的请求。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** LiveKit 凭证 BFF 动态路由参数。 */
type MeetingLiveKitTokenRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 转发会议 LiveKit 短期凭证申请。 */
export async function POST(request: Request, context: MeetingLiveKitTokenRouteContext) {
  const { meetingId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/meetings/${meetingId}/livekit-token`,
    fallbackMessage: '音视频凭证获取失败，请稍后重试',
  });
}
