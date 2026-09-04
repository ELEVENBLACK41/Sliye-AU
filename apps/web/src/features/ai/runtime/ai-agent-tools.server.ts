/**
 * 本文件组合 AI Gateway 网页检索与 NestJS 中心注册表提供的业务工具。
 * 业务工具的名称、说明、字段和超时来自服务端描述，执行同样回到 NestJS，
 * 由服务端做实时鉴权、串联规则校验和审计落库。
 */
import 'server-only';

import { gateway } from '@ai-sdk/gateway';
import { dynamicTool, type ToolSet } from 'ai';
import type { AiEvent, AiRuntimeToolDescriptor, AiRuntimeToolField } from '@workspace/contracts/ai';
import { z } from 'zod';

import { AiRuntimeRequestError, invokeAiRuntimeTool, isAiExecutionLeaseInvalid } from './ai-runtime-client.server.ts';

/** 构造动态工具集合时需要的当前执行凭据。 */
export type AiAgentToolContext = {
  /** 当前正在执行的 Run 标识。 */
  runId: string;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
};

/** Agent 工具执行完成后接收本次事务已提交事件的回调配置。 */
export type AiAgentToolOptions = {
  /** 工具开始/结束事件已经提交后通知 Runtime；回调不得阻塞模型。 */
  onCommittedEvents?: (events: AiEvent[]) => void;
};

/**
 * 按服务端工具描述构造 AI SDK 工具集合。
 * 工具执行结果统一回传给模型：成功时返回窄输出，失败时返回稳定说明，
 * 让模型可以据此追问用户或改变策略，而不是让整轮运行直接崩溃。
 */
export function buildAiAgentTools(
  descriptors: readonly AiRuntimeToolDescriptor[],
  context: AiAgentToolContext,
  liveOptions: AiAgentToolOptions = {},
): ToolSet {
  const tools: ToolSet = {
    parallel_search: gateway.tools.parallelSearch({
      mode: 'agentic',
      maxResults: 5,
      excerpts: {
        maxCharsPerResult: 800,
        maxCharsTotal: 4_000,
      },
    }),
  };

  for (const descriptor of descriptors) {
    tools[descriptor.name] = dynamicTool({
      description: `${descriptor.description}\n输入：${descriptor.input.description}\n输出：${descriptor.output.description}`,
      inputSchema: toInputSchema(descriptor.input.fields),
      execute: async (input, toolOptions) => {
        const requestControl = createToolRequestControl(toolOptions.abortSignal, descriptor.timeoutMs);

        try {
          const result = await invokeAiRuntimeTool({
            runId: context.runId,
            executionLeaseId: context.executionLeaseId,
            providerToolCallId: toolOptions.toolCallId,
            toolName: descriptor.name,
            toolInput: toToolInput(input),
            signal: requestControl.signal,
          });
          liveOptions.onCommittedEvents?.(result.events);

          return result.status === 'SUCCEEDED'
            ? { ok: true, data: result.output }
            : { ok: false, error: result.failureReason };
        } catch (error: unknown) {
          if (toolOptions.abortSignal?.aborted || isAiExecutionLeaseInvalid(error)) {
            throw error;
          }

          return {
            ok: false,
            error: toSafeToolRequestError(error, requestControl.timedOut()),
          };
        } finally {
          requestControl.dispose();
        }
      },
    });
  }

  return tools;
}

/** 单工具请求的生命周期控制器，合并上游取消并提供可清理的 Descriptor 超时。 */
function createToolRequestControl(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('AI 工具执行超时', 'TimeoutError'));
  }, timeoutMs);
  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeoutHandle);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

/** 将内部工具请求失败转换为可以安全交回模型的通用说明。 */
function toSafeToolRequestError(error: unknown, timedOut: boolean): string {
  if (timedOut) {
    return '工具执行超时，请稍后重试或缩小查询范围。';
  }

  if (error instanceof AiRuntimeRequestError) {
    return '工具暂时不可用，请稍后重试或改用其他方式回答。';
  }

  return '工具执行失败，请稍后重试或改用其他方式回答。';
}

/** 把服务端字段描述转换为模型可见的 Zod 输入结构。 */
function toInputSchema(fields: readonly AiRuntimeToolField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    const baseSchema = toFieldSchema(field).describe(field.description);
    shape[field.name] = field.required ? baseSchema : baseSchema.optional();
  }

  return z.object(shape);
}

/** 把单个字段的基础值类型映射为 Zod 校验器。 */
function toFieldSchema(field: AiRuntimeToolField): z.ZodTypeAny {
  switch (field.valueType) {
    case 'NUMBER':
      return z.number();
    case 'BOOLEAN':
      return z.boolean();
    case 'STRING_ARRAY':
      return z.array(z.string());
    case 'OBJECT':
      return z.record(z.string(), z.unknown());
    default:
      return z.string();
  }
}

/** 模型输入始终按对象传给服务端；非对象输入统一归一化为空对象由服务端拒绝。 */
function toToolInput(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
