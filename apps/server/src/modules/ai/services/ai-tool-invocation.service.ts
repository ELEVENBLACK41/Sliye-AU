/**
 * 本文件是只读工具调用的统一编排入口。
 * 它按稳定名称解析已注册工具、强制执行工具描述声明的前置发现规则、
 * 在超时保护下执行工具，并把发起、结果摘要、来源依赖和流事件完整落库。
 *
 * 串联规则不写在单个工具里：需要“目标先被唯一发现”的工具在描述中声明
 * `discoveryRequirement`，本服务据此统一校验，避免规则在多个工具间漂移。
 */

import { Inject, Injectable } from '@nestjs/common';
import type { ApiErrorCode } from '@workspace/contracts/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { Prisma } from '../../../generated/prisma';
import {
  AI_TOOL_EXECUTORS,
  type AiToolDescriptor,
  type AiToolDiscoveryRequirement,
  type AiToolExecutionContext,
} from '../types/ai-tool-registry.types';
import type {
  AiToolExecutionResult,
  AiToolExecutor,
  AiToolSourceRef,
} from '../types/ai-tool-source.types';
import { AiToolCallService } from './ai-tool-call.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

/** 工具窄输出摘要允许写入数据库的最大 JSON 长度，超出时只保留截断标记。 */
const MAX_TOOL_OUTPUT_SUMMARY_LENGTH = 16_000;

/** 模型发起一次工具调用时提供的最小请求数据。 */
export type AiToolInvocationRequest = {
  /** 模型侧生成的工具调用标识，用于幂等与消息对齐。 */
  providerToolCallId: string;
  /** 模型请求调用的工具名称，可能并未注册。 */
  toolName: string;
  /** 模型给出的工具输入，执行前由各工具自行校验。 */
  input: Record<string, unknown>;
};

/** 一次工具调用编排后的结果；失败同样是可审计的正常返回，不向上抛出。 */
export type AiToolInvocationResult =
  | {
      /** 工具成功返回窄输出。 */
      status: 'SUCCEEDED';
      /** 已持久化的工具调用标识。 */
      toolCallId: string;
      /** 允许进入模型上下文的窄输出。 */
      output: unknown;
    }
  | {
      /** 工具未注册、被串联规则拒绝、超时或执行失败。 */
      status: 'FAILED';
      /** 已持久化的工具调用标识。 */
      toolCallId: string;
      /** 可供调用方稳定分支判断的业务错误码。 */
      failureCode: ApiErrorCode;
      /** 可以安全交回模型、指导其下一步行为的中文说明。 */
      failureReason: string;
    };

@Injectable()
export class AiToolInvocationService {
  /** 按稳定名称解析已注册执行器的不可变索引。 */
  private readonly executorsByName: ReadonlyMap<
    string,
    AiToolExecutor<Record<string, unknown>, unknown>
  >;

  /** 注入中心注册表、工具调用持久化服务与全部已注册执行器。 */
  constructor(
    private readonly registry: AiToolRegistryService,
    private readonly toolCallService: AiToolCallService,
    @Inject(AI_TOOL_EXECUTORS)
    executors: readonly AiToolExecutor<Record<string, unknown>, unknown>[],
  ) {
    this.executorsByName = this.createExecutorMap(executors);
  }

  /**
   * 编排一次工具调用：登记发起、校验串联规则、执行工具、落库结果与来源。
   * 失败以结果对象返回，由 Runtime 决定是否把说明交回模型继续对话。
   */
  async invokeTool(
    executionContext: AiToolExecutionContext,
    request: AiToolInvocationRequest,
  ): Promise<AiToolInvocationResult> {
    const startedAt = Date.now();
    const { toolCallId } = await this.toolCallService.startToolCall({
      runId: executionContext.runId,
      executionLeaseId: executionContext.executionLeaseId,
      providerToolCallId: request.providerToolCallId,
      toolName: request.toolName,
      input: request.input as Prisma.InputJsonValue,
    });

    try {
      const descriptor = this.resolveDescriptor(request.toolName);
      await this.assertDiscoveredTarget(
        executionContext.runId,
        descriptor,
        request.input,
      );
      const result = await this.executeWithTimeout(
        descriptor,
        executionContext,
        request.input,
      );
      await this.settle(executionContext, {
        toolCallId,
        status: 'SUCCEEDED',
        outputSummary: this.toOutputSummary(result.output),
        failureCode: null,
        failureReason: null,
        sources: result.sources,
        durationMs: Date.now() - startedAt,
      });

      return { status: 'SUCCEEDED', toolCallId, output: result.output };
    } catch (error) {
      const failure = this.toFailure(error);
      await this.settle(executionContext, {
        toolCallId,
        status: 'FAILED',
        outputSummary: null,
        failureCode: failure.failureCode,
        failureReason: failure.failureReason,
        sources: [],
        durationMs: Date.now() - startedAt,
      });

      return { status: 'FAILED', toolCallId, ...failure };
    }
  }

  /** 解析已注册工具描述；未注册名称一律拒绝，不降级为自由查询。 */
  private resolveDescriptor(toolName: string): AiToolDescriptor {
    const descriptor = this.registry.findDescriptor(toolName);
    if (descriptor) {
      return descriptor;
    }

    throw new BusinessException({
      code: API_ERROR_CODES.AI_TOOL_NOT_REGISTERED,
      message: `工具 ${toolName} 未注册，只能使用已提供的工具。`,
    });
  }

  /**
   * 强制执行工具描述声明的前置发现规则。
   * 只有本 Run 内某次发现调用“唯一命中”的目标标识才允许被读取；
   * 没有发现记录、候选不唯一或标识不匹配时拒绝，并把追问指引交回模型。
   */
  private async assertDiscoveredTarget(
    runId: string,
    descriptor: AiToolDescriptor,
    input: Record<string, unknown>,
  ): Promise<void> {
    const requirement = descriptor.discoveryRequirement;
    if (!requirement) {
      return;
    }

    const target = input[requirement.targetInputField];
    if (typeof target !== 'number' && typeof target !== 'string') {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_TOOL_INPUT_INVALID,
        message: `${requirement.targetInputField} 缺失或类型不正确。`,
      });
    }

    const discoveries = await this.toolCallService.listSucceededDiscoveryCalls(
      runId,
      requirement.discoveryToolName,
      requirement.candidateListField,
      requirement.candidateIdentifierField,
    );
    const uniquelyDiscovered = discoveries.some(
      (discovery) =>
        discovery.candidateIdentifiers.length === 1 &&
        discovery.candidateIdentifiers[0] === target,
    );
    if (uniquelyDiscovered) {
      return;
    }

    throw new BusinessException({
      code: API_ERROR_CODES.AI_TOOL_TARGET_NOT_DISCOVERED,
      message: this.createDiscoveryGuidance(requirement),
    });
  }

  /** 生成交回模型的追问指引，明确要求先发现、命中唯一候选后才能继续读取。 */
  private createDiscoveryGuidance(
    requirement: AiToolDiscoveryRequirement,
  ): string {
    return (
      `只能读取本次对话中 ${requirement.discoveryToolName} 唯一命中的目标。` +
      `请先用用户提到的名称调用 ${requirement.discoveryToolName}；` +
      '如果候选为空或多于一个，请把候选交给用户确认，不要自行猜测标识。'
    );
  }

  /** 在描述声明的超时上限内执行工具，超时按失败处理并保留可审计记录。 */
  private async executeWithTimeout(
    descriptor: AiToolDescriptor,
    executionContext: AiToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<AiToolExecutionResult<unknown>> {
    const executor = this.executorsByName.get(descriptor.name);
    if (!executor) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
        message: `工具 ${descriptor.name} 暂时不可用。`,
      });
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new BusinessException({
            code: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
            message: `工具 ${descriptor.name} 执行超时。`,
          }),
        );
      }, descriptor.timeoutMs);
    });

    try {
      return await Promise.race([
        executor.execute(executionContext, input),
        timeout,
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /** 写入工具调用结果摘要、来源依赖与结束事件。 */
  private async settle(
    executionContext: AiToolExecutionContext,
    input: {
      toolCallId: string;
      status: 'SUCCEEDED' | 'FAILED';
      outputSummary: Prisma.InputJsonValue | null;
      failureCode: ApiErrorCode | null;
      failureReason: string | null;
      sources: readonly AiToolSourceRef[];
      durationMs: number;
    },
  ): Promise<void> {
    await this.toolCallService.settleToolCall({
      runId: executionContext.runId,
      executionLeaseId: executionContext.executionLeaseId,
      ...input,
    });
  }

  /** 把窄输出转换为可落库的受控摘要；异常大的结果只保留截断标记。 */
  private toOutputSummary(output: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(output ?? null);
    if (serialized.length <= MAX_TOOL_OUTPUT_SUMMARY_LENGTH) {
      return JSON.parse(serialized) as Prisma.InputJsonValue;
    }

    return { truncated: true, length: serialized.length };
  }

  /** 把异常归一化为稳定错误码和可以安全交回模型的说明。 */
  private toFailure(error: unknown): {
    failureCode: ApiErrorCode;
    failureReason: string;
  } {
    if (error instanceof BusinessException) {
      return { failureCode: error.code, failureReason: error.message };
    }

    return {
      failureCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
      failureReason: '工具执行失败，请改用其他方式回答或说明无法完成。',
    };
  }

  /** 建立按名称解析执行器的不可变索引，启动时拒绝重复或未注册的执行器。 */
  private createExecutorMap(
    executors: readonly AiToolExecutor<Record<string, unknown>, unknown>[],
  ): ReadonlyMap<string, AiToolExecutor<Record<string, unknown>, unknown>> {
    const executorMap = new Map<
      string,
      AiToolExecutor<Record<string, unknown>, unknown>
    >();
    for (const executor of executors) {
      if (executorMap.has(executor.toolName)) {
        throw new Error(`AI 工具执行器重复：${executor.toolName}`);
      }
      if (!this.registry.findDescriptor(executor.toolName)) {
        throw new Error(
          `AI 工具执行器没有对应的注册描述：${executor.toolName}`,
        );
      }
      executorMap.set(executor.toolName, executor);
    }

    return executorMap;
  }
}
