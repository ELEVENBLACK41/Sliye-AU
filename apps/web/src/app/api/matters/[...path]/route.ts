/**
 * 本文件以受保护的动态 BFF 转发议事、分区、消息、决策和会议子资源。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 议事子资源的 Next.js 16 异步路由参数。 */
type MatterProxyContext = {
  /** 需要原样转发给 NestJS 的路径片段。 */
  params: Promise<{ path: string[] }>;
};

/** 转发议事子资源查询。 */
export function GET(request: Request, context: MatterProxyContext) {
  return forward(request, context, 'GET');
}

/** 转发议事子资源创建或业务动作。 */
export function POST(request: Request, context: MatterProxyContext) {
  return forward(request, context, 'POST');
}

/** 转发议事子资源更新。 */
export function PATCH(request: Request, context: MatterProxyContext) {
  return forward(request, context, 'PATCH');
}

/** 转发议事或分区成员移除。 */
export function DELETE(request: Request, context: MatterProxyContext) {
  return forward(request, context, 'DELETE');
}

/** 构造受限议事路径，并保留原请求查询参数。 */
async function forward(request: Request, context: MatterProxyContext, method: 'GET' | 'POST' | 'PATCH' | 'DELETE') {
  const { path } = await context.params;
  const safePath = path.map(encodeURIComponent).join('/');

  return proxyAuthenticatedNestRequest({
    request,
    method,
    nestPath: `/matters/${safePath}`,
    fallbackMessage: '议事请求处理失败，请稍后重试',
  });
}
