/**
 * 本文件把权限管理浏览器请求安全转发到 NestJS，并复用统一认证刷新与错误响应逻辑。
 */
import { proxyAuthenticatedNestRequest } from '@/features/auth/services/authenticated-bff-proxy.service';

/** 动态权限管理路由参数。 */
type RouteContext = {
  /** 权限管理子路径片段。 */
  params: Promise<{ path: string[] }>;
};

/** 转发权限管理 GET 请求。 */
export async function GET(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest(request, context, 'GET');
}

/** 转发权限管理 POST 请求。 */
export async function POST(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest(request, context, 'POST');
}

/** 转发权限管理 PATCH 请求。 */
export async function PATCH(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest(request, context, 'PATCH');
}

/** 转发权限管理 DELETE 请求。 */
export async function DELETE(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest(request, context, 'DELETE');
}

/** 解析动态子路径并调用通用受保护 BFF 转发服务。 */
async function proxyAccessManagementRequest(
  request: Request,
  context: RouteContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
) {
  const { path } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method,
    nestPath: `/access-management/${path.join('/')}`,
    fallbackMessage: '权限管理请求失败，请稍后再试',
  });
}
