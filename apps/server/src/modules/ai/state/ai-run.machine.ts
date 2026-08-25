/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-17 15:50:59
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-21 14:18:37
 * @FilePath: \NextNest\apps\server\src\modules\ai\state\ai-run.machine.ts
 * @Description: AI流程状态机
 */
/**
 * 本文件定义 AI Run 的唯一合法状态转换矩阵和状态分类判断。
 * 幂等重放由事务层处理，状态机本身不允许同状态重复转换。
 */
import type {
  AiRunNonTerminalStatus,
  AiRunStatus,
  AiRunTerminalStatus,
} from '@workspace/contracts/ai';

/** AI Run 从每个状态允许进入的下一状态，终态不再提供任何出口。
 *  QUEUED：已进入队列，等待执行器处理
 *  QUEUED ->> RUNNING：执行器已经领取 正在调用模型或执行AI任务
 *  QUEUED ->> CANCELLED：表示用户主动取消了当前 Run
 *  RUNNING ->> WAITING_APPROVAL：表示当前 Run 需要人工审批才能继续执行
 *  RUNNING ->> CANCELLATION_REQUESTED：表示用户在 Run 执行中请求取消，等待执行器处理
 *  RUNNING ->> COMPLETED：表示当前 Run 已经成功完成
 *  RUNNING ->> FAILED：表示当前 Run 执行失败，可能是模型调用失败或工具调用错误任务执行异常
 *  WAITING_APPROVAL ->> RUNNING：表示人工审批通过，继续执行 Run
 *  WAITING_APPROVAL ->> CANCELLATION_REQUESTED：用户在等待审批期间取消了任务，进入取消处理流程
 *  CANCELLATION_REQUESTED ->> CANCELLED：表示执行器已经处理了用户的取消请求，Run 已经被取消
 *  CANCELLATION_REQUESTED ->> FAILED：表示执行器在处理取消请求时发生了错误，Run 执行失败
 *  CANCELLED：任务已取消，终态
 *  COMPLETED：任务已经成功完成，终态
 *  FAILED：任务执行失败，终态
 *
 */
export const AI_RUN_STATUS_TRANSITIONS = {
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: [
    'WAITING_APPROVAL',
    'CANCELLATION_REQUESTED',
    'COMPLETED',
    'FAILED',
  ],
  WAITING_APPROVAL: ['RUNNING', 'CANCELLATION_REQUESTED'],
  CANCELLATION_REQUESTED: ['CANCELLED', 'FAILED'],
  CANCELLED: [],
  COMPLETED: [],
  FAILED: [],
} as const satisfies Readonly<Record<AiRunStatus, readonly AiRunStatus[]>>;

/** Run 的全部非终态，用于 Thread 单 Run 并发门禁。 */
const AI_RUN_NON_TERMINAL_STATUSES = new Set<AiRunStatus>([
  'QUEUED',
  'RUNNING',
  'WAITING_APPROVAL',
  'CANCELLATION_REQUESTED',
]);

/** Run 的全部终态，进入后只能通过创建新 Run 重试。 */
const AI_RUN_TERMINAL_STATUSES = new Set<AiRunStatus>([
  'CANCELLED',
  'COMPLETED',
  'FAILED',
]);

/** 判断一次 Run 状态变化是否存在于唯一合法转换矩阵。 */
export function canTransitionAiRunStatus(
  fromStatus: AiRunStatus,
  toStatus: AiRunStatus,
): boolean {
  const allowedStatuses: readonly AiRunStatus[] =
    AI_RUN_STATUS_TRANSITIONS[fromStatus];

  return allowedStatuses.includes(toStatus);
}

/** 判断 Run 是否仍会占用 Thread 的单 Run 并发门禁。 */
export function isAiRunNonTerminalStatus(
  status: AiRunStatus,
): status is AiRunNonTerminalStatus {
  return AI_RUN_NON_TERMINAL_STATUSES.has(status);
}

/** 判断 Run 是否已经进入不可回退的最终状态。 */
export function isAiRunTerminalStatus(
  status: AiRunStatus,
): status is AiRunTerminalStatus {
  return AI_RUN_TERMINAL_STATUSES.has(status);
}
