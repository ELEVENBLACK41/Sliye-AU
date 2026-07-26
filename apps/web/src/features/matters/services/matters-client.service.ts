/**
 * 本文件封装浏览器通过 Next.js BFF 执行议事、分区、聊天和会议交互的请求。
 */
import type {
  AddDiscussionAreaMemberRequestPayload,
  AddMatterMemberRequestPayload,
  CreateDiscussionAreaRequestPayload,
  CreateDiscussionPublicationRequestPayload,
  CreateMatterChatMessageRequestPayload,
  CreateMatterRequestPayload,
  DiscussionAreaMember,
  DiscussionAreaSummary,
  MatterChatMessage,
  MatterChatMessageListQuery,
  MatterChatMessagePage,
  MatterChatTicket,
  MatterDetail,
  MatterMember,
  UpdateDiscussionAreaRequestPayload,
  UpdateMatterMemberRequestPayload,
  UpdateMatterStatusRequestPayload,
} from '@workspace/contracts/matters';
import type { CreateDecisionRequestPayload, DecisionDetail } from '@workspace/contracts/decisions';
import type { CreateMeetingRequestPayload, MeetingDetail } from '@workspace/contracts/meetings';

import { requestData } from '@/services/request';

/** 创建议事并返回初始化后的详情。 */
export function createMatter(payload: CreateMatterRequestPayload): Promise<MatterDetail> {
  return requestData<MatterDetail, CreateMatterRequestPayload>('/api/matters', {
    method: 'POST',
    body: payload,
    errorMessage: '议事创建失败，请稍后重试',
  });
}

/** 更新议事生命周期。 */
export function updateMatterStatus(matterId: number, payload: UpdateMatterStatusRequestPayload): Promise<MatterDetail> {
  return requestData<MatterDetail, UpdateMatterStatusRequestPayload>(`/api/matters/${matterId}/status`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '议事状态更新失败',
  });
}

/** 向议事添加成员。 */
export function addMatterMember(matterId: number, payload: AddMatterMemberRequestPayload): Promise<MatterMember> {
  return requestData<MatterMember, AddMatterMemberRequestPayload>(`/api/matters/${matterId}/members`, {
    method: 'POST',
    body: payload,
    errorMessage: '议事成员添加失败',
  });
}

/** 修改一名非负责人的议事角色。 */
export function updateMatterMember(
  matterId: number,
  userId: number,
  payload: UpdateMatterMemberRequestPayload,
): Promise<MatterMember> {
  return requestData<MatterMember, UpdateMatterMemberRequestPayload>(`/api/matters/${matterId}/members/${userId}`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '议事成员角色更新失败',
  });
}

/** 从议事中移除一名非负责人，并由服务端同步撤销关联访问。 */
export function removeMatterMember(matterId: number, userId: number): Promise<{ removed: true }> {
  return requestData<{ removed: true }>(`/api/matters/${matterId}/members/${userId}`, {
    method: 'DELETE',
    errorMessage: '议事成员移除失败',
  });
}

/** 创建议事私有分区。 */
export function createMatterArea(
  matterId: number,
  payload: CreateDiscussionAreaRequestPayload,
): Promise<DiscussionAreaSummary> {
  return requestData<DiscussionAreaSummary, CreateDiscussionAreaRequestPayload>(`/api/matters/${matterId}/areas`, {
    method: 'POST',
    body: payload,
    errorMessage: '私有分区创建失败',
  });
}

/** 更新讨论分区资料或私有分区状态。 */
export function updateMatterArea(
  matterId: number,
  areaId: number,
  payload: UpdateDiscussionAreaRequestPayload,
): Promise<DiscussionAreaSummary> {
  return requestData<DiscussionAreaSummary, UpdateDiscussionAreaRequestPayload>(
    `/api/matters/${matterId}/areas/${areaId}`,
    { method: 'PATCH', body: payload, errorMessage: '讨论分区更新失败' },
  );
}

/** 向私有分区添加一名议事成员。 */
export function addAreaMember(
  matterId: number,
  areaId: number,
  payload: AddDiscussionAreaMemberRequestPayload,
): Promise<DiscussionAreaMember> {
  return requestData<DiscussionAreaMember, AddDiscussionAreaMemberRequestPayload>(
    `/api/matters/${matterId}/areas/${areaId}/members`,
    { method: 'POST', body: payload, errorMessage: '分区成员添加失败' },
  );
}

/** 从私有分区移除一名成员并立即撤销其实时访问。 */
export function removeAreaMember(matterId: number, areaId: number, userId: number): Promise<{ removed: true }> {
  return requestData<{ removed: true }>(`/api/matters/${matterId}/areas/${areaId}/members/${userId}`, {
    method: 'DELETE',
    errorMessage: '分区成员移除失败',
  });
}

/** 在议事中创建决策。 */
export function createMatterDecision(matterId: number, payload: CreateDecisionRequestPayload): Promise<DecisionDetail> {
  return requestData<DecisionDetail, CreateDecisionRequestPayload>(`/api/matters/${matterId}/decisions`, {
    method: 'POST',
    body: payload,
    errorMessage: '决策创建失败',
  });
}

/** 在当前议事分区中创建会议。 */
export function createMatterMeeting(matterId: number, payload: CreateMeetingRequestPayload): Promise<MeetingDetail> {
  return requestData<MeetingDetail, CreateMeetingRequestPayload>(`/api/matters/${matterId}/meetings`, {
    method: 'POST',
    body: payload,
    errorMessage: '会议创建失败',
  });
}

/** 加载分区聊天消息页。 */
export function getMatterChatMessages(
  matterId: number,
  areaId: number,
  query: MatterChatMessageListQuery,
): Promise<MatterChatMessagePage> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });
  return requestData<MatterChatMessagePage>(`/api/matters/${matterId}/areas/${areaId}/messages?${searchParams}`, {
    errorMessage: '分区消息加载失败',
  });
}

/** 发送一条带可选业务关联的分区消息。 */
export function createMatterChatMessage(
  matterId: number,
  areaId: number,
  payload: CreateMatterChatMessageRequestPayload,
): Promise<MatterChatMessage> {
  return requestData<MatterChatMessage, CreateMatterChatMessageRequestPayload>(
    `/api/matters/${matterId}/areas/${areaId}/messages`,
    { method: 'POST', body: payload, errorMessage: '消息发送失败' },
  );
}

/** 签发当前分区的短期 Socket Ticket。 */
export function getMatterChatTicket(matterId: number, areaId: number): Promise<MatterChatTicket> {
  return requestData<MatterChatTicket>(`/api/matters/${matterId}/areas/${areaId}/chat-ticket`, {
    method: 'POST',
    errorMessage: '实时连接凭证获取失败',
  });
}

/** 把私有分区消息发布为公共摘要。 */
export function publishMatterSummary(
  matterId: number,
  areaId: number,
  payload: CreateDiscussionPublicationRequestPayload,
): Promise<MatterChatMessage> {
  return requestData<MatterChatMessage, CreateDiscussionPublicationRequestPayload>(
    `/api/matters/${matterId}/areas/${areaId}/publications`,
    { method: 'POST', body: payload, errorMessage: '公共摘要发布失败' },
  );
}
