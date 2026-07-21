/**
 * 本文件封装决策模块在 Next.js 服务端调用 NestJS 的类型化只读请求。
 */
import type {
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionSummary,
} from '@workspace/contracts/decisions';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前用户数据范围内的决策列表。 */
export function requestDecisionsFromNest(accessToken: string): Promise<NestResponse<DecisionSummary[]>> {
  return requestNest<DecisionSummary[]>('/decisions', {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 按资源 ID 查询授权范围内的决策详情。 */
export function requestDecisionDetailFromNest(
  accessToken: string,
  decisionId: number,
): Promise<NestResponse<DecisionDetail>> {
  return requestNest<DecisionDetail>(`/decisions/${decisionId}`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 按资源 ID 查询授权范围内的决策事件时间线。 */
export function requestDecisionEventsFromNest(
  accessToken: string,
  decisionId: number,
): Promise<NestResponse<DecisionEventTimelineResponse>> {
  return requestNest<DecisionEventTimelineResponse>(
    `/decisions/${decisionId}/events`,
    {
      method: 'GET',
      headers: createAuthHeaders(accessToken),
    },
  );
}

/** 构造只在服务端使用的 Bearer 认证请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
