/**
 * 本文件把当前用户头像上传和移除请求安全转发到 NestJS。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 上传并替换当前用户头像。 */
export async function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/auth/profile/avatar',
    fallbackMessage: '头像上传失败，请稍后再试',
  });
}

/** 移除当前用户头像。 */
export async function DELETE(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'DELETE',
    nestPath: '/auth/profile/avatar',
    fallbackMessage: '头像移除失败，请稍后再试',
  });
}
