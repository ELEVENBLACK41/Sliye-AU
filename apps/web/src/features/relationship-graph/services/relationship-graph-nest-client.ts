/**
 * 本文件封装关系图谱 Server Component 调用 NestJS 的类型化只读请求。
 */
import type { RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前用户有权查看的完整个人关系图谱快照。 */
export function requestRelationshipGraphFromNest(
  accessToken: string,
): Promise<NestResponse<RelationshipGraphResponse>> {
  return requestNest<RelationshipGraphResponse>('/relationship-graph', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
