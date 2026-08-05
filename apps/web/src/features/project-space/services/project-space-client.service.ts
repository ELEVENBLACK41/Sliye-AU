/**
 * 本文件封装新版项目空间在浏览器侧使用的项目、聊天和决策回放 BFF 请求。
 */
import type { DecisionEventTimelineResponse } from '@workspace/contracts/decisions';
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
