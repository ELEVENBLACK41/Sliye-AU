/**
 * 本文件封装浏览器侧的决策 BFF 请求，并复用统一 ApiClientError。
 */
import type {
  CreateDecisionRequestPayload,
  DecisionDetail,
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
  return requestData<DecisionDetail, UpdateDecisionStatusRequestPayload>(
    `/api/decisions/${decisionId}/status`,
    {
      method: 'PATCH',
      body: payload,
      errorMessage: '决策状态更新失败，请稍后重试',
    },
  );
}
