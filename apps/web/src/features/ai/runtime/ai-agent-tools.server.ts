/**
 * 本文件把 NestJS 中心工具注册表的描述转换为 AI SDK 可用的动态工具。
 * Runtime 不自行定义任何工具能力：工具名称、说明、字段和超时全部来自服务端描述，
 * 执行同样回到 NestJS，由服务端做实时鉴权、串联规则校验和审计落库。
 */
import 'server-only';

import { dynamicTool, type ToolSet } from 'ai';
import type { AiRuntimeToolDescriptor, AiRuntimeToolField } from '@workspace/contracts/ai';
import { z } from 'zod';

import { invokeAiRuntimeTool } from './ai-runtime-client.server.ts';

/** 构造动态工具集合时需要的当前执行凭据。 */
export type AiAgentToolContext = {
  /** 当前正在执行的 Run 标识。 */
  runId: string;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
};

/**
 * 按服务端工具描述构造 AI SDK 工具集合。
 * 工具执行结果统一回传给模型：成功时返回窄输出，失败时返回稳定说明，
 * 让模型可以据此追问用户或改变策略，而不是让整轮运行直接崩溃。
 */
export function buildAiAgentTools(
  descriptors: readonly AiRuntimeToolDescriptor[],
  context: AiAgentToolContext,
): ToolSet {
  const tools: ToolSet = {};

  for (const descriptor of descriptors) {
    tools[descriptor.name] = dynamicTool({
      description: `${descriptor.description}\n输入：${descriptor.input.description}\n输出：${descriptor.output.description}`,
      inputSchema: toInputSchema(descriptor.input.fields),
      execute: async (input, options) => {
        const result = await invokeAiRuntimeTool({
          runId: context.runId,
          executionLeaseId: context.executionLeaseId,
          providerToolCallId: options.toolCallId,
          toolName: descriptor.name,
          toolInput: toToolInput(input),
        });

        return result.status === 'SUCCEEDED'
          ? { ok: true, data: result.output }
          : { ok: false, error: result.failureReason };
      },
    });
  }

  return tools;
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
