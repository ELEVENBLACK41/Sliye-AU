/**
 * 本文件封装新版项目空间在浏览器侧使用的项目、聊天和决策回放 BFF 请求。
 */
import type { DecisionEventTimelineResponse } from '@workspace/contracts/decisions';
import type {
  CreateProjectChatMessageRequestPayload,
  CreateProjectRequestPayload,
  ProjectChatMessage,
  ProjectChatMessageListQuery,
  ProjectChatMessagePage,
  ProjectChatTicket,
  ProjectDetail,
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
