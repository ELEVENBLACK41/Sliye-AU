/**
 * 本文件定义官方 Decision Agent 工具适配器共用的服务端上下文和调用结果。
 * 上下文不会进入模型消息；真正的用户权限仍由 NestJS 根据 Run 重新计算。
 */

import { z } from 'zod';

/** AI SDK 工具执行时需要的当前 Run 和租约上下文。 */
export const NEXTNEST_WORKSPACE_TOOL_CONTEXT_SCHEMA = z.object({
  runId: z.string().min(1),
  executionLeaseId: z.string().min(1),
});

/** 从工具上下文 Schema 推导出的服务端工具上下文类型。 */
export type NextNestWorkspaceToolContext = z.infer<typeof NEXTNEST_WORKSPACE_TOOL_CONTEXT_SCHEMA>;

/** 发送给既有 NestJS 内部工具执行接口的调用参数。 */
export type NextNestWorkspaceToolInvocationInput = {
  /** 当前正在执行的 Run 标识。 */
  runId: string;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
  /** AI SDK 为本次工具调用生成的稳定标识。 */
  providerToolCallId: string;
  /** NestJS 中心注册表中的工具名称。 */
  toolName: string;
  /** 通过 AI SDK 输入 Schema 校验后的工具参数。 */
  toolInput: Record<string, unknown>;
};

/** 官方工具适配器使用的 NestJS 工具调用函数类型。 */
export type NextNestWorkspaceToolInvoker = (
  input: NextNestWorkspaceToolInvocationInput,
) => Promise<NextNestWorkspaceToolInvocationResult>;

/** 工具 execute 阶段交回模型所需的最小受控结果；审计细节由 lifecycle 回调处理。 */
export type NextNestWorkspaceToolInvocationResult =
  | {
      /** 业务查询成功。 */
      status: 'SUCCEEDED';
      /** 允许交回模型的窄输出。 */
      output: unknown;
    }
  | {
      /** 业务查询被拒绝或执行失败。 */
      status: 'FAILED';
      /** 可以安全交回模型的失败说明。 */
      failureReason: string;
    };

/** 交回模型的稳定工具结果外壳；失败时只携带服务端允许披露的说明。 */
export type NextNestWorkspaceToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** 把 NestJS 工具执行回执转换为 AI SDK 工具的模型可见结果。 */
export function toNextNestWorkspaceToolResult(
  result: NextNestWorkspaceToolInvocationResult,
): NextNestWorkspaceToolResult {
  if (result.status === 'SUCCEEDED') {
    return { ok: true, data: result.output };
  }

  return { ok: false, error: result.failureReason };
}
