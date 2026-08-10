/**
 * 本文件封装热力图按日读取与只读决策详情抽屉的浏览器请求。
 */
import type {
  DecisionCenterActivityDayDetail,
  DecisionCenterArchiveQuery,
  DecisionCenterArchiveResponse,
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionProposalListResponse,
  DecisionResolutionListResponse,
  DecisionVoteRoundListResponse,
} from '@workspace/contracts/decisions';

import { requestData } from '@/services/request';
import type { DecisionCenterReadOnlyDetail } from '../types/decision-center.type';

/** 读取热力图中一个日期的关键过程档案。 */
export function getDecisionCenterActivityDay(date: string): Promise<DecisionCenterActivityDayDetail> {
  return requestData<DecisionCenterActivityDayDetail>(`/api/decision-center/activity/${encodeURIComponent(date)}`, {
    errorMessage: '当日过程档案加载失败，请稍后重试',
  });
}

/** 按筛选条件读取一页跨项目决策档案。 */
export function getDecisionCenterArchivePage(
  query: DecisionCenterArchiveQuery,
  signal?: AbortSignal,
): Promise<DecisionCenterArchiveResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
  });
  return requestData<DecisionCenterArchiveResponse>(`/api/decision-center/archive?${searchParams}`, {
    signal,
    errorMessage: '决策档案加载失败，请稍后重试',
  });
}

/** 并行读取决策的五类现有只读资源，组合为详情抽屉快照。 */
export async function getDecisionCenterReadOnlyDetail(decisionId: number): Promise<DecisionCenterReadOnlyDetail> {
  const basePath = `/api/decisions/${decisionId}`;
  const [decision, proposals, voteRounds, resolutions, events] = await Promise.all([
    requestData<DecisionDetail>(basePath),
    requestData<DecisionProposalListResponse>(`${basePath}/proposals`),
    requestData<DecisionVoteRoundListResponse>(`${basePath}/vote-rounds`),
    requestData<DecisionResolutionListResponse>(`${basePath}/resolutions`),
    requestData<DecisionEventTimelineResponse>(`${basePath}/events`),
  ]);

  return { decision, proposals, voteRounds, resolutions, events };
}
