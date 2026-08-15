/**
 * 本文件封装浏览器通过 Next.js BFF 主动刷新关系图谱快照的类型化请求。
 */
import type { RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';

import { requestData } from '@/services/request';

/** 通过受认证 BFF 重新读取当前用户的关系图谱快照。 */
export function fetchRelationshipGraph(): Promise<RelationshipGraphResponse> {
  return requestData<RelationshipGraphResponse>('/api/relationship-graph', {
    method: 'GET',
    errorMessage: '关系图谱刷新失败，请稍后重试',
  });
}
