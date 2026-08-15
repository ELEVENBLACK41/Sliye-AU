/** 本文件代理预约会议创建请求。 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发预约会议创建。 */
export async function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/meetings/appointments',
    fallbackMessage: '预约会议创建失败，请稍后重试',
  });
}
