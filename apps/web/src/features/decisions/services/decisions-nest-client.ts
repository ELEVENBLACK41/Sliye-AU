/**
 * 本文件封装决策模块在 Next.js 服务端调用 NestJS 的类型化请求。
 */
import type {
  CloseDecisionProposalRequestPayload,
  CreateDecisionProposalRequestPayload,
  CreateDecisionResolutionRequestPayload,
  CreateDecisionVoteRoundRequestPayload,
  DecisionBallotReceipt,
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionProposal,
  DecisionProposalListResponse,
  DecisionResolution,
  DecisionResolutionListResponse,
  DecisionSummary,
  DecisionVoteRound,
  DecisionVoteRoundListResponse,
  SubmitDecisionBallotRequestPayload,
  UpdateDecisionStatusRequestPayload,
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
  return requestNest<DecisionEventTimelineResponse>(`/decisions/${decisionId}/events`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 按资源 ID 查询授权范围内的决策提案列表。 */
export function requestDecisionProposalsFromNest(
  accessToken: string,
  decisionId: number,
): Promise<NestResponse<DecisionProposalListResponse>> {
  return requestNest<DecisionProposalListResponse>(`/decisions/${decisionId}/proposals`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 按资源 ID 查询授权范围内的正式决议列表。 */
export function requestDecisionResolutionsFromNest(
  accessToken: string,
  decisionId: number,
): Promise<NestResponse<DecisionResolutionListResponse>> {
  return requestNest<DecisionResolutionListResponse>(`/decisions/${decisionId}/resolutions`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 按资源 ID 查询授权范围内的决策投票轮次。 */
export function requestDecisionVoteRoundsFromNest(
  accessToken: string,
  decisionId: number,
): Promise<NestResponse<DecisionVoteRoundListResponse>> {
  return requestNest<DecisionVoteRoundListResponse>(`/decisions/${decisionId}/vote-rounds`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 为指定决策中的开放提案创建并开启投票。 */
export function requestDecisionVoteRoundCreateFromNest(
  accessToken: string,
  decisionId: number,
  payload: CreateDecisionVoteRoundRequestPayload,
): Promise<NestResponse<DecisionVoteRound>> {
  return requestNest<DecisionVoteRound, CreateDecisionVoteRoundRequestPayload>(`/decisions/${decisionId}/vote-rounds`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
    body: payload,
  });
}

/** 向指定决策投票轮次提交当前参与者的单选选票。 */
export function requestDecisionBallotSubmitFromNest(
  accessToken: string,
  decisionId: number,
  voteRoundId: number,
  payload: SubmitDecisionBallotRequestPayload,
): Promise<NestResponse<DecisionBallotReceipt>> {
  return requestNest<DecisionBallotReceipt, SubmitDecisionBallotRequestPayload>(
    `/decisions/${decisionId}/vote-rounds/${voteRoundId}/ballots`,
    {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: payload,
    },
  );
}

/** 关闭指定决策中的开放投票轮次并返回最终统计。 */
export function requestDecisionVoteRoundCloseFromNest(
  accessToken: string,
  decisionId: number,
  voteRoundId: number,
): Promise<NestResponse<DecisionVoteRound>> {
  return requestNest<DecisionVoteRound>(`/decisions/${decisionId}/vote-rounds/${voteRoundId}/close`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
  });
}

/** 在指定决策中创建开放提案，并保留 NestJS 的统一响应和业务错误。 */
export function requestDecisionProposalCreateFromNest(
  accessToken: string,
  decisionId: number,
  payload: CreateDecisionProposalRequestPayload,
): Promise<NestResponse<DecisionProposal>> {
  return requestNest<DecisionProposal, CreateDecisionProposalRequestPayload>(`/decisions/${decisionId}/proposals`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
    body: payload,
  });
}

/** 拒绝或取消指定决策中的开放提案。 */
export function requestDecisionProposalCloseFromNest(
  accessToken: string,
  decisionId: number,
  proposalId: number,
  payload: CloseDecisionProposalRequestPayload,
): Promise<NestResponse<DecisionProposal>> {
  return requestNest<DecisionProposal, CloseDecisionProposalRequestPayload>(
    `/decisions/${decisionId}/proposals/${proposalId}/status`,
    {
      method: 'PATCH',
      headers: createAuthHeaders(accessToken),
      body: payload,
    },
  );
}

/** 采纳开放提案并创建最终正式决议。 */
export function requestDecisionResolutionCreateFromNest(
  accessToken: string,
  decisionId: number,
  payload: CreateDecisionResolutionRequestPayload,
): Promise<NestResponse<DecisionResolution>> {
  return requestNest<DecisionResolution, CreateDecisionResolutionRequestPayload>(
    `/decisions/${decisionId}/resolutions`,
    {
      method: 'POST',
      headers: createAuthHeaders(accessToken),
      body: payload,
    },
  );
}

/** 按资源 ID 更新决策状态，并保留 NestJS 的统一响应和业务错误。 */
export function requestDecisionStatusUpdateFromNest(
  accessToken: string,
  decisionId: number,
  payload: UpdateDecisionStatusRequestPayload,
): Promise<NestResponse<DecisionDetail>> {
  return requestNest<DecisionDetail, UpdateDecisionStatusRequestPayload>(`/decisions/${decisionId}/status`, {
    method: 'PATCH',
    headers: createAuthHeaders(accessToken),
    body: payload,
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 认证请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
