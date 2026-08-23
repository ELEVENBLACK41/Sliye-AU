/**
 * 本文件提供 AI Chat 会话请求的纯状态工具，用于隔离持久化确认、结算去重和稳定身份映射。
 */

import type { AiDecisionUiMessage } from '../types/ai-message';

/** 一次已由服务端定位的 Run 上下文。 */
export type AiRunRequestContext = {
  /** 当前 Chat 实例的稳定会话键。 */
  sessionId: string;
  /** 服务端 Thread 主键。 */
  threadId: string;
  /** 服务端 Run 主键。 */
  runId: string;
};

/** 首个流元数据为工作区提供的完整持久化定位信息。 */
export type AiRunLocatedMetadata = AiRunRequestContext & {
  /** 服务端用户消息主键。 */
  messageId: string;
};

/** 可变的请求结算闸门；由 Hook 放入 Ref，避免重复触发权威历史刷新。 */
export type AiRequestSettlementGate = {
  /** 当前请求代次；零表示尚未开始需要结算的请求。 */
  requestSequence: number;
  /** 已经结算或明确放弃的请求代次。 */
  settledSequence: number;
  /** 当前浏览器流是否因显式导航而断开。 */
  navigationDisconnecting: boolean;
};

/** 一次消息持久化确认；只有服务端 `data-run` 才算成功。 */
export type AiPersistenceReceipt = {
  /** 等待持久化确认的结果。 */
  promise: Promise<boolean>;
  /** 以成功或未确认状态完成一次等待。 */
  complete: (persisted: boolean) => void;
  /** 以请求错误结束一次等待。 */
  fail: (error: Error) => void;
};

/** 创建初始结算闸门；刷新恢复中的 Run 从第一代请求开始。 */
export function createAiRequestSettlementGate(resuming: boolean): AiRequestSettlementGate {
  return {
    requestSequence: resuming ? 1 : 0,
    settledSequence: 0,
    navigationDisconnecting: false,
  };
}

/** 开始一代新的发送或重试请求，并允许它在完成后结算。 */
export function beginAiRequestSettlementCycle(gate: AiRequestSettlementGate): number {
  gate.requestSequence += 1;
  gate.navigationDisconnecting = false;
  return gate.requestSequence;
}

/** 把当前请求标记为导航断流，确保它不会刷新另一个 Thread。 */
export function abandonAiRequestForNavigation(gate: AiRequestSettlementGate): void {
  gate.navigationDisconnecting = true;
  gate.settledSequence = gate.requestSequence;
}

/** 结束导航断流标记；已放弃代次仍保持不可结算。 */
export function finishAiNavigationDisconnect(gate: AiRequestSettlementGate): void {
  gate.navigationDisconnecting = false;
}

/** 原子认领当前请求的唯一结算权，重复回调返回空。 */
export function claimAiRequestSettlement(gate: AiRequestSettlementGate): number | null {
  if (
    gate.navigationDisconnecting ||
    gate.requestSequence === 0 ||
    gate.settledSequence === gate.requestSequence
  ) {
    return null;
  }

  gate.settledSequence = gate.requestSequence;
  return gate.requestSequence;
}

/** 创建一个只允许第一次结果生效的持久化确认。 */
export function createAiPersistenceReceipt(): AiPersistenceReceipt {
  let completed = false;
  let resolveReceipt: (persisted: boolean) => void = () => undefined;
  let rejectReceipt: (error: Error) => void = () => undefined;
  const promise = new Promise<boolean>((resolve, reject) => {
    resolveReceipt = resolve;
    rejectReceipt = reject;
  });

  return {
    promise,
    complete: (persisted) => {
      if (completed) return;
      completed = true;
      resolveReceipt(persisted);
    },
    fail: (error) => {
      if (completed) return;
      completed = true;
      rejectReceipt(error);
    },
  };
}

/** 只选择本次提交的最后一条用户消息，避免把完整历史重新发给 BFF。 */
export function selectLatestAiUserMessage(
  messages: AiDecisionUiMessage[],
): AiDecisionUiMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') {
      return [message];
    }
  }

  return [];
}

/** 用服务端消息主键替换最后一条瞬时用户消息，防止历史补拉后重复展示。 */
export function replaceLatestAiUserMessageId(
  messages: AiDecisionUiMessage[],
  messageId: string,
): AiDecisionUiMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    if (message.id === messageId) return messages;

    const nextMessages = [...messages];
    nextMessages[index] = { ...message, id: messageId };
    return nextMessages;
  }

  return messages;
}

/** 生成跨重试安全的工具调用身份，避免不同 Run 复用工具 ID 时互相遮蔽。 */
export function createAiToolCallIdentity(runId: string, toolCallId: string): string {
  return `${runId}:${toolCallId}`;
}

/** 判断异步返回是否仍属于当前 Run 上下文。 */
export function isSameAiRunRequestContext(
  left: AiRunRequestContext | null,
  right: AiRunRequestContext,
): boolean {
  return (
    left?.sessionId === right.sessionId &&
    left.threadId === right.threadId &&
    left.runId === right.runId
  );
}
