/**
 * 本文件封装浏览器创建决策的 BFF 请求，并复用统一 ApiClientError。
 */
import type { CreateDecisionRequestPayload, DecisionDetail } from '@workspace/contracts/decisions';

import { requestData } from '@/services/request';

/** 创建决策，成功后返回包含创建人参与关系的完整详情。 */
export function createDecision(payload: CreateDecisionRequestPayload): Promise<DecisionDetail> {
  return requestData<DecisionDetail, CreateDecisionRequestPayload>('/api/decisions', {
    method: 'POST',
    body: payload,
    errorMessage: '决策创建失败，请稍后重试',
  });
}
