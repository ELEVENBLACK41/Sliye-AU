/**
 * 本文件提供 AI 运行事件的 SSE 订阅接口。
 * 该接口只按服务端事件序号补拉已持久化事件，绝不启动新的执行器；
 * 刷新、重连和多标签页订阅都可以安全复用同一个 Run。
 */
import { apiError } from '@/app/api/_utils/response';
import { createAiRunEventStreamResponse } from '@/features/ai/runtime/ai-stream.server';
import { resolveAuthenticatedAccessToken } from '@/server/bff/authenticated-nest-proxy';

/** AI 会话流路由参数。 */
type AiThreadStreamRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 订阅指定 Run 的事件流，并从浏览器给出的序号开始补拉。 */
export async function GET(request: Request, context: AiThreadStreamRouteContext) {
  const { threadId } = await context.params;
  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');

  if (!runId) {
    return apiError({
      status: 400,
      message: '缺少要订阅的 AI 运行标识',
      path: url.pathname,
    });
  }

  const accessToken = await resolveAuthenticatedAccessToken();

  if (!accessToken) {
    return apiError({
      status: 401,
      message: '登录状态已失效，请重新登录',
      path: url.pathname,
    });
  }

  return createAiRunEventStreamResponse({
    runId,
    threadId,
    afterSequence: toAfterSequence(url.searchParams.get('afterSequence')),
    accessToken,
    signal: request.signal,
  });
}

/** 解析浏览器已收到的最后一个事件序号；非法取值一律从头补拉。 */
function toAfterSequence(rawValue: string | null): number {
  const parsed = Number(rawValue ?? 0);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}
