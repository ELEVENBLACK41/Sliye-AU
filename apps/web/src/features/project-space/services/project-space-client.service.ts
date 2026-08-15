/**
 * 本文件封装新版项目空间在浏览器侧使用的项目、聊天和决策回放 BFF 请求。
 */
import type {
  CloseDecisionProposalRequestPayload,
  CreateDecisionProposalRequestPayload,
  CreateDecisionRequestPayload,
  CreateDecisionResolutionRequestPayload,
  CreateDecisionVoteRoundRequestPayload,
  DecisionBallotReceipt,
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionProposal,
  DecisionProposalListResponse,
  DecisionResolution,
  DecisionResolutionListResponse,
  DecisionVoteRound,
  DecisionVoteRoundListResponse,
  SubmitDecisionBallotRequestPayload,
  UpdateDecisionStatusRequestPayload,
} from '@workspace/contracts/decisions';
import type {
  AddDiscussionAreaMemberRequestPayload,
  AddProjectMemberRequestPayload,
  CreateProjectChatMessageRequestPayload,
  CreateDiscussionAreaRequestPayload,
  CreateProjectRequestPayload,
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectChatMessage,
  ProjectChatMessageListQuery,
  ProjectChatMessagePage,
  ProjectChatTicket,
  ProjectDetail,
  ProjectMember,
} from '@workspace/contracts/projects';

import { requestData } from '@/services/request';
import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';

/** 创建项目并返回服务端初始化后的项目详情。 */
export function createProjectSpaceProject(payload: CreateProjectRequestPayload): Promise<ProjectDetail> {
  return requestData<ProjectDetail, CreateProjectRequestPayload>('/api/projects', {
    method: 'POST',
    body: payload,
    errorMessage: '项目创建失败，请稍后重试',
  });
}

/** 向新版项目空间当前项目添加一名组织用户。 */
export function addProjectSpaceMember(
  projectId: number,
  payload: AddProjectMemberRequestPayload,
): Promise<ProjectMember> {
  return requestData<ProjectMember, AddProjectMemberRequestPayload>(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: payload,
    errorMessage: '项目成员添加失败',
  });
}

/** 创建新版项目空间私有小群组及其初始成员。 */
export function createProjectSpaceArea(
  projectId: number,
  payload: CreateDiscussionAreaRequestPayload,
): Promise<DiscussionAreaSummary> {
  return requestData<DiscussionAreaSummary, CreateDiscussionAreaRequestPayload>(`/api/projects/${projectId}/areas`, {
    method: 'POST',
    body: payload,
    errorMessage: '小群组创建失败',
  });
}

/** 读取新版项目空间一个私有小群组的显式成员。 */
export function getProjectSpaceAreaMembers(
  projectId: number,
  areaId: number,
): Promise<DiscussionAreaMember[]> {
  return requestData<DiscussionAreaMember[]>(`/api/projects/${projectId}/areas/${areaId}/members`, {
    errorMessage: '小群组成员加载失败',
  });
}

/** 把一名已有项目成员加入新版项目空间私有小群组。 */
export function addProjectSpaceAreaMember(
  projectId: number,
  areaId: number,
  payload: AddDiscussionAreaMemberRequestPayload,
): Promise<DiscussionAreaMember> {
  return requestData<DiscussionAreaMember, AddDiscussionAreaMemberRequestPayload>(
    `/api/projects/${projectId}/areas/${areaId}/members`,
    { method: 'POST', body: payload, errorMessage: '加入小群组失败' },
  );
}

/** 加载新版项目空间当前分区的消息页。 */
export function getProjectSpaceMessages(
  projectId: number,
  areaId: number,
  query: ProjectChatMessageListQuery,
): Promise<ProjectChatMessagePage> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
  });
  return requestData<ProjectChatMessagePage>(`/api/projects/${projectId}/areas/${areaId}/messages?${searchParams}`, {
    errorMessage: '分区消息加载失败',
  });
}

/** 在新版项目空间当前分区发送一条带可选业务关联的消息。 */
export function createProjectSpaceMessage(
  projectId: number,
  areaId: number,
  payload: CreateProjectChatMessageRequestPayload,
): Promise<ProjectChatMessage> {
  return requestData<ProjectChatMessage, CreateProjectChatMessageRequestPayload>(
    `/api/projects/${projectId}/areas/${areaId}/messages`,
    { method: 'POST', body: payload, errorMessage: '消息发送失败' },
  );
}

/** 为新版项目空间当前分区签发短期实时连接 Ticket。 */
export function getProjectSpaceChatTicket(projectId: number, areaId: number): Promise<ProjectChatTicket> {
  return requestData<ProjectChatTicket>(`/api/projects/${projectId}/areas/${areaId}/chat-ticket`, {
    method: 'POST',
    errorMessage: '实时连接凭证获取失败',
  });
}

/** 查询单项决策的完整事件时间线，供新版项目空间按需加载回放。 */
export function getProjectSpaceDecisionEvents(decisionId: number): Promise<DecisionEventTimelineResponse> {
  return requestData<DecisionEventTimelineResponse>(`/api/decisions/${decisionId}/events`, {
    method: 'GET',
    errorMessage: '决策过程加载失败，请稍后重试',
  });
}

/** 在新版项目空间中创建项目级或私有分区级决策。 */
export function createProjectSpaceDecision(
  projectId: number,
  payload: CreateDecisionRequestPayload,
): Promise<DecisionDetail> {
  return requestData<DecisionDetail, CreateDecisionRequestPayload>(`/api/projects/${projectId}/decisions`, {
    method: 'POST',
    body: payload,
    errorMessage: '决策创建失败，请稍后重试',
  });
}

/** 并行加载新版工作台当前决策的详情、提案、投票、决议和事件。 */
export async function getProjectSpaceDecisionWorkspace(decisionId: number): Promise<ProjectDecisionWorkspaceData> {
  const [decision, proposals, voteRounds, resolutions, events] = await Promise.all([
    requestData<DecisionDetail>(`/api/decisions/${decisionId}`, { errorMessage: '决策详情加载失败' }),
    requestData<DecisionProposalListResponse>(`/api/decisions/${decisionId}/proposals`, {
      errorMessage: '提案加载失败',
    }),
    requestData<DecisionVoteRoundListResponse>(`/api/decisions/${decisionId}/vote-rounds`, {
      errorMessage: '投票加载失败',
    }),
    requestData<DecisionResolutionListResponse>(`/api/decisions/${decisionId}/resolutions`, {
      errorMessage: '正式决议加载失败',
    }),
    getProjectSpaceDecisionEvents(decisionId),
  ]);

  return { decision, proposals, voteRounds, resolutions, events };
}

/** 将新版工作台中的草稿决策推进到讨论阶段。 */
export function startProjectSpaceDecisionDiscussion(decisionId: number): Promise<DecisionDetail> {
  const payload: UpdateDecisionStatusRequestPayload = { status: 'DISCUSSING' };
  return requestData<DecisionDetail, UpdateDecisionStatusRequestPayload>(`/api/decisions/${decisionId}/status`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '开始讨论失败，请稍后重试',
  });
}

/** 在新版工作台当前决策中创建开放提案。 */
export function createProjectSpaceDecisionProposal(
  decisionId: number,
  payload: CreateDecisionProposalRequestPayload,
): Promise<DecisionProposal> {
  return requestData<DecisionProposal, CreateDecisionProposalRequestPayload>(
    `/api/decisions/${decisionId}/proposals`,
    { method: 'POST', body: payload, errorMessage: '提案创建失败，请稍后重试' },
  );
}

/** 拒绝或取消新版工作台中的开放提案。 */
export function closeProjectSpaceDecisionProposal(
  decisionId: number,
  proposalId: number,
  payload: CloseDecisionProposalRequestPayload,
): Promise<DecisionProposal> {
  return requestData<DecisionProposal, CloseDecisionProposalRequestPayload>(
    `/api/decisions/${decisionId}/proposals/${proposalId}/status`,
    { method: 'PATCH', body: payload, errorMessage: '提案状态更新失败，请稍后重试' },
  );
}

/** 为新版工作台中的开放提案创建并立即开启投票。 */
export function createProjectSpaceDecisionVoteRound(
  decisionId: number,
  payload: CreateDecisionVoteRoundRequestPayload,
): Promise<DecisionVoteRound> {
  return requestData<DecisionVoteRound, CreateDecisionVoteRoundRequestPayload>(
    `/api/decisions/${decisionId}/vote-rounds`,
    { method: 'POST', body: payload, errorMessage: '投票开启失败，请稍后重试' },
  );
}

/** 提交当前用户在新版工作台中的单选选票。 */
export function submitProjectSpaceDecisionBallot(
  decisionId: number,
  voteRoundId: number,
  payload: SubmitDecisionBallotRequestPayload,
): Promise<DecisionBallotReceipt> {
  return requestData<DecisionBallotReceipt, SubmitDecisionBallotRequestPayload>(
    `/api/decisions/${decisionId}/vote-rounds/${voteRoundId}/ballots`,
    { method: 'POST', body: payload, errorMessage: '投票提交失败，请稍后重试' },
  );
}

/** 关闭新版工作台中的开放投票并固化统计结果。 */
export function closeProjectSpaceDecisionVoteRound(
  decisionId: number,
  voteRoundId: number,
): Promise<DecisionVoteRound> {
  return requestData<DecisionVoteRound>(`/api/decisions/${decisionId}/vote-rounds/${voteRoundId}/close`, {
    method: 'POST',
    errorMessage: '投票关闭失败，请稍后重试',
  });
}

/** 创建正式决议并原子收口当前决策。 */
export function createProjectSpaceDecisionResolution(
  decisionId: number,
  payload: CreateDecisionResolutionRequestPayload,
): Promise<DecisionResolution> {
  return requestData<DecisionResolution, CreateDecisionResolutionRequestPayload>(
    `/api/decisions/${decisionId}/resolutions`,
    { method: 'POST', body: payload, errorMessage: '正式决议创建失败，请稍后重试' },
  );
}
