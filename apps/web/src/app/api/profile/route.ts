/**
 * 本文件把当前用户个人资料修改请求安全转发到 NestJS。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 修改当前用户的基本资料。 */
export async function PATCH(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'PATCH',
    nestPath: '/auth/profile',
    fallbackMessage: '个人资料保存失败，请稍后再试',
  });
}
