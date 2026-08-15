/**
 * 本文件通过登录态 BFF 返回受保护的用户头像资源。
 */
import { proxyAuthenticatedNestAssetRequest } from '@/server/bff/authenticated-nest-proxy';

/** 头像文件动态路由参数。 */
type RouteContext = {
  /** 服务端生成的不可变头像文件名。 */
  params: Promise<{ fileName: string }>;
};

/** 读取并流式转发当前系统内的头像资源。 */
export async function GET(request: Request, context: RouteContext) {
  const { fileName } = await context.params;

  return proxyAuthenticatedNestAssetRequest(
    request,
    `/auth/profile/avatar/${encodeURIComponent(fileName)}`,
    '头像读取失败，请稍后再试',
  );
}
