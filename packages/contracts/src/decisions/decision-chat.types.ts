/**
 * 本文件定义决策群聊的消息、分页、发送、连接凭证与实时事件共享契约。
 */

import type { DecisionUserSummary } from './decision.types.ts';

/** 决策群聊当前支持的消息内容类型。 */
export type DecisionChatMessageType = 'TEXT' | 'SYSTEM';

/** 决策群聊游标查询的移动方向。 */
export type DecisionChatPageDirection = 'before' | 'after';

/** 消息回复区域展示的原消息轻量摘要。 */
export type DecisionChatReplyPreview = {
  /** 被回复消息的数据库主键。 */
  id: number;
  /** 被回复消息的发送人；账号无法继续关联时为 `null`。 */
  author: DecisionUserSummary | null;
  /** 被回复消息正文；消息已删除时为 `null`。 */
  content: string | null;
  /** 被回复消息的删除时间；仍然有效时为 `null`。 */
  deletedAt: string | null;
};

/** 决策群聊对外返回的一条持久化消息。 */
export type DecisionChatMessage = {
  /** 消息数据库主键，同时作为稳定排序和断线补偿游标。 */
  id: number;
  /** 消息所属讨论空间主键。 */
  spaceId: number;
  /** 浏览器生成的幂等标识；系统消息为 `null`。 */
  clientMessageId: string | null;
  /** 消息内容类型。 */
  type: DecisionChatMessageType;
  /** 消息正文；消息已删除时返回 `null`。 */
  content: string | null;
  /** 消息发送人；账号无法继续关联或系统消息没有发送人时为 `null`。 */
  author: DecisionUserSummary | null;
  /** 可选的一级回复目标摘要。 */
  replyTo: DecisionChatReplyPreview | null;
  /** 可选的来源会议主键；普通群聊消息为 `null`。 */
  meetingId: number | null;
  /** 消息被固定为重要信息的时间；尚未固定时为 `null`。 */
  pinnedAt: string | null;
  /** 消息最后编辑时间；从未编辑时为 `null`。 */
  editedAt: string | null;
  /** 消息软删除时间；仍然有效时为 `null`。 */
  deletedAt: string | null;
  /** 消息创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** 决策群聊消息分页结果。 */
export type DecisionChatMessagePage = {
  /** 按消息主键升序排列的当前页消息。 */
  items: DecisionChatMessage[];
  /** 继续按当前方向查询时使用的下一游标；没有更多数据时为 `null`。 */
  nextCursor: number | null;
  /** 当前方向是否仍有更多消息。 */
  hasMore: boolean;
};

/** 决策群聊消息列表接口的游标查询参数。 */
export type DecisionChatMessageListQuery = {
  /** 相对游标向前加载历史或向后补齐新消息，默认使用 `before`。 */
  direction?: DecisionChatPageDirection;
  /** 消息数据库主键游标；首次加载最新消息时省略。 */
  cursor?: number;
  /** 单页消息数量，服务端默认 30 且最大为 50。 */
  limit?: number;
};

/** 发送一条决策群聊文字消息的请求体。 */
export type CreateDecisionChatMessageRequest = {
  /** 浏览器生成的 UUID，用于网络重试时保持幂等。 */
  clientMessageId: string;
  /** 去除首尾空白后长度必须为 1 至 2000 的纯文本正文。 */
  content: string;
  /** 可选的同群组一级回复目标消息主键。 */
  replyToId?: number;
  /** 可选的来源会议主键；传入时会议必须属于当前决策且正在进行。 */
  meetingId?: number;
};

/** 浏览器连接指定决策实时房间所需的短期凭证。 */
export type DecisionChatTicket = {
  /** 只允许连接当前决策房间的签名短期凭证。 */
  ticket: string;
  /** 凭证过期时间，使用 ISO 8601 字符串。 */
  expiresAt: string;
  /** Socket.IO 使用的固定命名空间。 */
  namespace: '/decision-chat';
};

/** 决策群聊服务端向浏览器推送的实时事件与载荷映射。 */
export type DecisionChatRealtimeEvents = {
  /** 消息完成数据库提交后广播的创建事件。 */
  'decision-chat.message.created': DecisionChatMessage;
};
