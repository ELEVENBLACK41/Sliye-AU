/**
 * 本文件封装浏览器侧的决策 BFF 请求，并复用统一 ApiClientError。
 */
import type {
  AddDecisionParticipantRequestPayload,
  CloseDecisionProposalRequestPayload,
  CreateDecisionProposalRequestPayload,
  CreateDecisionRequestPayload,
  CreateDecisionResolutionRequestPayload,
  CreateDecisionVoteRoundRequestPayload,
  DecisionBallotReceipt,
  DecisionDetail,
  DecisionParticipant,
  DecisionParticipantCandidateListResponse,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
  SubmitDecisionBallotRequestPayload,
  UpdateDecisionStatusRequestPayload,
} from '@workspace/contracts/decisions';

import { requestData } from '@/services/request';

/** 创建决策，成功后返回包含创建人参与关系的完整详情。 */
export function createDecision(payload: CreateDecisionRequestPayload): Promise<DecisionDetail> {
  return requestData<DecisionDetail, CreateDecisionRequestPayload>('/api/decisions', {
    method: 'POST',
    body: payload,
    errorMessage: '决策创建失败，请稍后重试',
  });
}

/** 更新决策状态，当前共享契约仅允许提交开始讨论状态。 */
export function updateDecisionStatus(
  decisionId: number,
  payload: UpdateDecisionStatusRequestPayload,
): Promise<DecisionDetail> {
  return requestData<DecisionDetail, UpdateDecisionStatusRequestPayload>(`/api/decisions/${decisionId}/status`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '决策状态更新失败，请稍后重试',
  });
}

/** 查询当前决策尚可添加的参与者候选列表。 */
export function getDecisionParticipantCandidates(
  decisionId: number,
): Promise<DecisionParticipantCandidateListResponse> {
  return requestData<DecisionParticipantCandidateListResponse>(`/api/decisions/${decisionId}/participant-candidates`, {
    method: 'GET',
    errorMessage: '参与者候选列表加载失败，请稍后重试',
  });
}

/** 向当前决策添加一名非负责人参与者。 */
export function addDecisionParticipant(
  decisionId: number,
  payload: AddDecisionParticipantRequestPayload,
): Promise<DecisionParticipant> {
  return requestData<DecisionParticipant, AddDecisionParticipantRequestPayload>(
    `/api/decisions/${decisionId}/participants`,
    {
      method: 'POST',
      body: payload,
      errorMessage: '添加参与者失败，请稍后重试',
    },
  );
}

/** 在当前决策中创建一条开放提案。 */
export function createDecisionProposal(
  decisionId: number,
  payload: CreateDecisionProposalRequestPayload,
): Promise<DecisionProposal> {
  return requestData<DecisionProposal, CreateDecisionProposalRequestPayload>(`/api/decisions/${decisionId}/proposals`, {
    method: 'POST',
    body: payload,
    errorMessage: '创建提案失败，请稍后重试',
  });
}

/** 拒绝或取消当前决策中的开放提案。 */
export function closeDecisionProposal(
  decisionId: number,
  proposalId: number,
  payload: CloseDecisionProposalRequestPayload,
): Promise<DecisionProposal> {
  return requestData<DecisionProposal, CloseDecisionProposalRequestPayload>(
    `/api/decisions/${decisionId}/proposals/${proposalId}/status`,
    {
      method: 'PATCH',
      body: payload,
      errorMessage: '提案关闭失败，请稍后重试',
    },
  );
}

/** 采纳开放提案并形成当前决策的最终正式决议。 */
export function createDecisionResolution(
  decisionId: number,
  payload: CreateDecisionResolutionRequestPayload,
): Promise<DecisionResolution> {
  return requestData<DecisionResolution, CreateDecisionResolutionRequestPayload>(
    `/api/decisions/${decisionId}/resolutions`,
    {
      method: 'POST',
      body: payload,
      errorMessage: '正式决议创建失败，请稍后重试',
    },
  );
}

/** 为当前决策中的开放提案创建并立即开启投票。 */
export function createDecisionVoteRound(
  decisionId: number,
  payload: CreateDecisionVoteRoundRequestPayload,
): Promise<DecisionVoteRound> {
  return requestData<DecisionVoteRound, CreateDecisionVoteRoundRequestPayload>(
    `/api/decisions/${decisionId}/vote-rounds`,
    {
      method: 'POST',
      body: payload,
      errorMessage: '创建投票失败，请稍后重试',
    },
  );
}

/** 为当前决策中的开放投票提交一张单选选票。 */
export function submitDecisionBallot(
  decisionId: number,
  voteRoundId: number,
  payload: SubmitDecisionBallotRequestPayload,
): Promise<DecisionBallotReceipt> {
  return requestData<DecisionBallotReceipt, SubmitDecisionBallotRequestPayload>(
    `/api/decisions/${decisionId}/vote-rounds/${voteRoundId}/ballots`,
    {
      method: 'POST',
      body: payload,
      errorMessage: '提交选票失败，请稍后重试',
    },
  );
}

/** 关闭当前决策中的开放投票轮次并返回最终统计。 */
export function closeDecisionVoteRound(decisionId: number, voteRoundId: number): Promise<DecisionVoteRound> {
  return requestData<DecisionVoteRound>(`/api/decisions/${decisionId}/vote-rounds/${voteRoundId}/close`, {
    method: 'POST',
    errorMessage: '关闭投票失败，请稍后重试',
  });
}
