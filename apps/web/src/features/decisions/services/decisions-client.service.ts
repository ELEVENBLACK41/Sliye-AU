/**
 * 本文件封装浏览器侧的决策 BFF 请求，并复用统一 ApiClientError。
 */
import type {
  AddDecisionParticipantRequestPayload,
  CreateDecisionProposalRequestPayload,
  CreateDecisionRequestPayload,
  DecisionDetail,
  DecisionParticipant,
  DecisionParticipantCandidateListResponse,
  DecisionProposal,
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
