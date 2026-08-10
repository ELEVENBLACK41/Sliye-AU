/**
 * 本文件封装决策中心 Server Component 调用 NestJS 的类型化只读请求。
 */
import type {
  DecisionCenterActivityResponse,
  DecisionCenterAnalyticsResponse,
  DecisionCenterArchiveQuery,
  DecisionCenterArchiveResponse,
} from '@workspace/contracts/decisions';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询最近一年的决策活动热力图。 */
export function requestDecisionCenterActivity(
  accessToken: string,
): Promise<NestResponse<DecisionCenterActivityResponse>> {
  return requestNest<DecisionCenterActivityResponse>('/decision-center/activity', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询跨项目决策过程指标与观察。 */
export function requestDecisionCenterAnalytics(
  accessToken: string,
): Promise<NestResponse<DecisionCenterAnalyticsResponse>> {
  return requestNest<DecisionCenterAnalyticsResponse>('/decision-center/analytics', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询当前用户可见的跨项目决策档案。 */
export function requestDecisionCenterArchive(
  accessToken: string,
  query: DecisionCenterArchiveQuery = {},
): Promise<NestResponse<DecisionCenterArchiveResponse>> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
  });
  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';
  return requestNest<DecisionCenterArchiveResponse>(`/decision-center/archive${suffix}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
