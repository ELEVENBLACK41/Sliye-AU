/**
 * 本文件封装浏览器通过 Next.js BFF 执行项目、分区、聊天和会议交互的请求。
 */
import type {
  AddDiscussionAreaMemberRequestPayload,
  AddProjectMemberRequestPayload,
  CreateDiscussionAreaRequestPayload,
  CreateProjectChatMessageRequestPayload,
  CreateProjectRequestPayload,
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectChatMessage,
  ProjectChatMessageListQuery,
  ProjectChatMessagePage,
  ProjectChatTicket,
  ProjectDetail,
  ProjectMember,
  UpdateDiscussionAreaRequestPayload,
  UpdateProjectMemberRequestPayload,
  UpdateProjectStatusRequestPayload,
} from '@workspace/contracts/projects';
import type { CreateDecisionRequestPayload, DecisionDetail } from '@workspace/contracts/decisions';
import type { CreateMeetingRequestPayload, MeetingDetail } from '@workspace/contracts/meetings';

import { requestData } from '@/services/request';

/** 创建项目并返回初始化后的详情。 */
export function createProject(payload: CreateProjectRequestPayload): Promise<ProjectDetail> {
  return requestData<ProjectDetail, CreateProjectRequestPayload>('/api/projects', {
    method: 'POST',
    body: payload,
    errorMessage: '项目创建失败，请稍后重试',
  });
}

/** 更新项目生命周期。 */
export function updateProjectStatus(projectId: number, payload: UpdateProjectStatusRequestPayload): Promise<ProjectDetail> {
  return requestData<ProjectDetail, UpdateProjectStatusRequestPayload>(`/api/projects/${projectId}/status`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '项目状态更新失败',
  });
}

/** 向项目添加成员。 */
export function addProjectMember(projectId: number, payload: AddProjectMemberRequestPayload): Promise<ProjectMember> {
  return requestData<ProjectMember, AddProjectMemberRequestPayload>(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: payload,
    errorMessage: '项目成员添加失败',
  });
}

/** 修改一名非负责人的项目角色。 */
export function updateProjectMember(
  projectId: number,
  userId: number,
  payload: UpdateProjectMemberRequestPayload,
): Promise<ProjectMember> {
  return requestData<ProjectMember, UpdateProjectMemberRequestPayload>(`/api/projects/${projectId}/members/${userId}`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '项目成员角色更新失败',
  });
}

/** 从项目中移除一名非负责人，并由服务端同步撤销关联访问。 */
export function removeProjectMember(projectId: number, userId: number): Promise<{ removed: true }> {
  return requestData<{ removed: true }>(`/api/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
    errorMessage: '项目成员移除失败',
  });
}

/** 创建项目私有分区。 */
export function createProjectArea(
  projectId: number,
  payload: CreateDiscussionAreaRequestPayload,
): Promise<DiscussionAreaSummary> {
  return requestData<DiscussionAreaSummary, CreateDiscussionAreaRequestPayload>(`/api/projects/${projectId}/areas`, {
    method: 'POST',
    body: payload,
    errorMessage: '私有分区创建失败',
  });
}

/** 更新讨论分区资料或私有分区状态。 */
export function updateProjectArea(
  projectId: number,
  areaId: number,
  payload: UpdateDiscussionAreaRequestPayload,
): Promise<DiscussionAreaSummary> {
  return requestData<DiscussionAreaSummary, UpdateDiscussionAreaRequestPayload>(
    `/api/projects/${projectId}/areas/${areaId}`,
    { method: 'PATCH', body: payload, errorMessage: '讨论分区更新失败' },
  );
}

/** 向私有分区添加一名项目成员。 */
export function addAreaMember(
  projectId: number,
  areaId: number,
  payload: AddDiscussionAreaMemberRequestPayload,
): Promise<DiscussionAreaMember> {
  return requestData<DiscussionAreaMember, AddDiscussionAreaMemberRequestPayload>(
    `/api/projects/${projectId}/areas/${areaId}/members`,
    { method: 'POST', body: payload, errorMessage: '分区成员添加失败' },
  );
}

/** 从私有分区移除一名成员并立即撤销其实时访问。 */
export function removeAreaMember(projectId: number, areaId: number, userId: number): Promise<{ removed: true }> {
  return requestData<{ removed: true }>(`/api/projects/${projectId}/areas/${areaId}/members/${userId}`, {
    method: 'DELETE',
    errorMessage: '分区成员移除失败',
  });
}

/** 在项目中创建决策。 */
export function createProjectDecision(projectId: number, payload: CreateDecisionRequestPayload): Promise<DecisionDetail> {
  return requestData<DecisionDetail, CreateDecisionRequestPayload>(`/api/projects/${projectId}/decisions`, {
    method: 'POST',
    body: payload,
    errorMessage: '决策创建失败',
  });
}

/** 在当前项目分区中创建会议。 */
export function createProjectMeeting(projectId: number, payload: CreateMeetingRequestPayload): Promise<MeetingDetail> {
  return requestData<MeetingDetail, CreateMeetingRequestPayload>(`/api/projects/${projectId}/meetings`, {
    method: 'POST',
    body: payload,
    errorMessage: '会议创建失败',
  });
}

/** 加载分区聊天消息页。 */
export function getProjectChatMessages(
  projectId: number,
  areaId: number,
  query: ProjectChatMessageListQuery,
): Promise<ProjectChatMessagePage> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });
  return requestData<ProjectChatMessagePage>(`/api/projects/${projectId}/areas/${areaId}/messages?${searchParams}`, {
    errorMessage: '分区消息加载失败',
  });
}

/** 发送一条带可选业务关联的分区消息。 */
export function createProjectChatMessage(
  projectId: number,
  areaId: number,
  payload: CreateProjectChatMessageRequestPayload,
): Promise<ProjectChatMessage> {
  return requestData<ProjectChatMessage, CreateProjectChatMessageRequestPayload>(
    `/api/projects/${projectId}/areas/${areaId}/messages`,
    { method: 'POST', body: payload, errorMessage: '消息发送失败' },
  );
}

/** 签发当前分区的短期 Socket Ticket。 */
export function getProjectChatTicket(projectId: number, areaId: number): Promise<ProjectChatTicket> {
  return requestData<ProjectChatTicket>(`/api/projects/${projectId}/areas/${areaId}/chat-ticket`, {
    method: 'POST',
    errorMessage: '实时连接凭证获取失败',
  });
}
