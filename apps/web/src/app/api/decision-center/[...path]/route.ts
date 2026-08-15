/**
 * 本文件将决策中心的浏览器按需读取安全转发到 NestJS。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策中心动态 BFF 路由参数。 */
type DecisionCenterProxyContext = {
  /** 需要原样转发的安全路径片段。 */
  params: Promise<{ path: string[] }>;
};

/** 转发决策中心只读查询。 */
export async function GET(request: Request, context: DecisionCenterProxyContext) {
  const { path } = await context.params;
  const safePath = path.map(encodeURIComponent).join('/');

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decision-center/${safePath}`,
    fallbackMessage: '决策中心请求处理失败，请稍后重试',
  });
}
