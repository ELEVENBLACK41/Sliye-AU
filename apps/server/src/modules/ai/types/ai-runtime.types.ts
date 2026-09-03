/**
 * 本文件定义 Agent Runtime 与 NestJS AI 持久化层之间的内部执行契约。
 * 这些类型不是浏览器 API；服务身份必须先由后续内部鉴权层验证后才能构造。
 */

import type { AiLanguageModelRole } from '@workspace/contracts/ai';

/** 当前单实例阶段允许领取 Run 的内部 Agent Runtime 服务标识。 */
export const AI_RUNTIME_SERVICE_IDENTITY = 'WEB_AGENT_RUNTIME' as const;

/** 已由内部服务鉴权层归一化的 Agent Runtime 服务身份。 */
export type AiRuntimeServiceIdentity = typeof AI_RUNTIME_SERVICE_IDENTITY;

/** Agent Runtime 请求原子领取一个排队 Run 时允许传入的最小数据。 */
export type ClaimAiRuntimeExecutionInput = {
  /** 已由内部服务鉴权层验证的调用方身份；浏览器不得自行传入或构造。 */
  serviceIdentity: AiRuntimeServiceIdentity;
  /** 希望领取的已持久化 Run 标识。 */
  runId: string;
};

/** Runtime 成功领取 Run 后可使用的受控执行上下文。 */
export type ClaimedAiRuntimeExecution = {
  /** 本次领取的 Run 标识。 */
  runId: string;
  /** Run 所属 Thread 标识。 */
  threadId: string;
  /** Thread 所有者，也是工具实时鉴权必须使用的当前用户标识。 */
  ownerUserId: number;
  /** 本次 Run 对应的原始用户消息标识。 */
  userMessageId: string;
  /** 本次 Run 对应的原始用户消息正文。 */
  userMessageContent: string;
  /** 持久化 Run 指定的逻辑语言模型角色。 */
  modelRole: AiLanguageModelRole;
  /** 当前执行器唯一持有的租约标识；后续受 fencing 保护的写入必须携带它。 */
  executionLeaseId: string;
  /** 当前执行租约的绝对过期时间。 */
  executionLeaseExpiresAt: Date;
};
