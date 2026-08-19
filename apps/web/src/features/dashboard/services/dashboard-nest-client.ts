/**
 * 本文件封装新版工作台在 Next.js 服务端调用 NestJS 的类型化只读请求。
 */
import type { DashboardInsightsResponse, DashboardSummaryResponse } from '@workspace/contracts/dashboard';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前用户的工作台参与摘要。 */
export function requestDashboardSummaryFromNest(accessToken: string): Promise<NestResponse<DashboardSummaryResponse>> {
  return requestNest<DashboardSummaryResponse>('/dashboard/summary', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询工作台趋势、提案、项目与决策洞察。 */
export function requestDashboardInsightsFromNest(
  accessToken: string,
): Promise<NestResponse<DashboardInsightsResponse>> {
  return requestNest<DashboardInsightsResponse>('/dashboard/insights', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
