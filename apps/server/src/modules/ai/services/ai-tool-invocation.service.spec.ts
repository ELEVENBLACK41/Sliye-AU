/**
 * 本文件验证只读工具编排：按名称解析已注册工具、强制工具描述声明的前置发现规则、
 * 超时保护、失败归一化，以及发起与结束都完整落库。
 * 不连接数据库、不调用模型，注册表使用真实实现以覆盖描述校验。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { AiToolDescriptor } from '../types/ai-tool-registry.types';
import type { AiToolExecutionContext } from '../types/ai-tool-registry.types';
import type { AiToolExecutor } from '../types/ai-tool-source.types';
import type { AiToolCallService } from './ai-tool-call.service';
import { AiToolInvocationService } from './ai-tool-invocation.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

/** 构造一个仅供测试使用的工具执行上下文，字段均来自已领取 Run。 */
const EXECUTION_CONTEXT: AiToolExecutionContext = {
  runId: 'run-001',
  threadId: 'thread-001',
  ownerUserId: 42,
  executionLeaseId: 'lease-001',
  executionLeaseExpiresAt: new Date(Date.now() + 30_000),
};

/** 发现工具描述：不需要前置发现。 */
const DISCOVERY_DESCRIPTOR: AiToolDescriptor = {
  name: 'findDecisionCandidates',
  description: '按用户可见范围查找候选决策。',
  accessMode: 'READ',
  timeoutMs: 3_000,
  input: {
    description: '决策名称。',
    fields: [
      {
        name: 'query',
        valueType: 'STRING',
        required: true,
        description: '待发现的决策名称。',
      },
    ],
  },
  output: {
    description: '候选决策摘要。',
    fields: [
      {
        name: 'candidates',
        valueType: 'OBJECT',
        required: true,
        description: '候选决策摘要集合。',
      },
    ],
  },
};

/** 上下文读取工具描述：声明必须先由发现工具唯一命中目标。 */
const CONTEXT_DESCRIPTOR: AiToolDescriptor = {
  name: 'getDecisionContext',
  description: '读取一项决策的结构化上下文。',
  accessMode: 'READ',
  timeoutMs: 3_000,
  input: {
    description: '本 Run 已发现候选中唯一命中的决策主键。',
    fields: [
      {
        name: 'decisionId',
        valueType: 'NUMBER',
        required: true,
        description: '待读取的决策主键。',
      },
    ],
  },
  output: {
    description: '决策结构化上下文。',
    fields: [
      {
        name: 'decision',
        valueType: 'OBJECT',
        required: true,
        description: '决策结构化上下文字段。',
      },
    ],
  },
  discoveryRequirement: {
    discoveryToolName: 'findDecisionCandidates',
    targetInputField: 'decisionId',
    candidateListField: 'candidates',
    candidateIdentifierField: 'decisionId',
  },
};

describe('AiToolInvocationService', () => {
  /** 创建注册表真实、持久化与执行器均为 mock 的编排服务。 */
  function createService(
    options: {
      execute?: jest.Mock;
      discoveries?: Array<{
        toolCallId: string;
        candidateIdentifiers: Array<number | string>;
      }>;
      startResult?: unknown;
    } = {},
  ) {
    const startToolCall = jest.fn().mockResolvedValue(
      options.startResult ?? {
        state: 'CREATED',
        toolCallId: 'tool-call-1',
      },
    );
    const settleToolCall = jest.fn().mockResolvedValue(undefined);
    const listSucceededDiscoveryCalls = jest
      .fn()
      .mockResolvedValue(options.discoveries ?? []);
    const toolCallService = {
      startToolCall,
      settleToolCall,
      listSucceededDiscoveryCalls,
    } as unknown as AiToolCallService;

    const execute =
      options.execute ??
      jest.fn().mockResolvedValue({
        output: { decisionId: 17 },
        sources: [
          { sourceType: 'DECISION', sourceId: '17', label: '缓存方案评审' },
        ],
      });
    const contextExecutor = {
      toolName: 'getDecisionContext',
      execute,
    } as unknown as AiToolExecutor<Record<string, unknown>, unknown>;
    const discoveryExecutor = {
      toolName: 'findDecisionCandidates',
      execute: jest
        .fn()
        .mockResolvedValue({ output: { candidates: [] }, sources: [] }),
    } as unknown as AiToolExecutor<Record<string, unknown>, unknown>;

    const registry = new AiToolRegistryService([
      DISCOVERY_DESCRIPTOR,
      CONTEXT_DESCRIPTOR,
    ]);

    return {
      service: new AiToolInvocationService(registry, toolCallService, [
        discoveryExecutor,
        contextExecutor,
      ]),
      startToolCall,
      settleToolCall,
      listSucceededDiscoveryCalls,
      execute,
    };
  }

  it('未注册的工具名称被拒绝，但调用尝试仍然完整落库', async () => {
    const { service, startToolCall, settleToolCall } = createService();

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-1',
      toolName: 'deleteDecision',
      input: {},
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.AI_TOOL_NOT_REGISTERED,
    });
    expect(startToolCall).toHaveBeenCalledTimes(1);
    expect(settleToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', sources: [] }),
    );
  });

  it('没有任何发现记录时拒绝读取上下文，并把追问指引交回模型', async () => {
    const { service, execute } = createService({ discoveries: [] });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-2',
      toolName: 'getDecisionContext',
      input: { decisionId: 17 },
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.AI_TOOL_TARGET_NOT_DISCOVERED,
    });
    expect(result.status === 'FAILED' && result.failureReason).toContain(
      'findDecisionCandidates',
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('候选多于一个时拒绝读取上下文，模型必须先向用户消歧', async () => {
    const { service, execute } = createService({
      discoveries: [
        { toolCallId: 'tool-call-0', candidateIdentifiers: [17, 18] },
      ],
    });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-3',
      toolName: 'getDecisionContext',
      input: { decisionId: 17 },
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.AI_TOOL_TARGET_NOT_DISCOVERED,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('唯一候选但主键不一致时同样拒绝，模型不能猜测其他主键', async () => {
    const { service, execute } = createService({
      discoveries: [{ toolCallId: 'tool-call-0', candidateIdentifiers: [17] }],
    });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-4',
      toolName: 'getDecisionContext',
      input: { decisionId: 99 },
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.AI_TOOL_TARGET_NOT_DISCOVERED,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('唯一候选命中同一主键时才执行工具，并落库输出摘要与来源', async () => {
    const { service, settleToolCall, execute } = createService({
      discoveries: [{ toolCallId: 'tool-call-0', candidateIdentifiers: [17] }],
    });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-5',
      toolName: 'getDecisionContext',
      input: { decisionId: 17 },
    });

    expect(result).toEqual({
      status: 'SUCCEEDED',
      toolCallId: 'tool-call-1',
      output: { decisionId: 17 },
    });
    expect(execute).toHaveBeenCalledWith(EXECUTION_CONTEXT, { decisionId: 17 });
    expect(settleToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SUCCEEDED',
        outputSummary: { decisionId: 17 },
        sources: [
          { sourceType: 'DECISION', sourceId: '17', label: '缓存方案评审' },
        ],
      }),
    );
  });

  it('工具抛出业务异常时归一化为稳定失败，不向模型泄漏内部错误', async () => {
    const { service } = createService({
      discoveries: [{ toolCallId: 'tool-call-0', candidateIdentifiers: [17] }],
      execute: jest.fn().mockRejectedValue(
        new BusinessException({
          code: API_ERROR_CODES.DECISION_NOT_FOUND,
          message: '决策不存在或无权访问',
        }),
      ),
    });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-6',
      toolName: 'getDecisionContext',
      input: { decisionId: 17 },
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.DECISION_NOT_FOUND,
      failureReason: '决策不存在或无权访问',
    });
  });

  it('相同工具调用已经成功时直接重放摘要，不再次读取业务数据或写结束事件', async () => {
    const { service, execute, settleToolCall } = createService({
      startResult: {
        state: 'REPLAY_SUCCEEDED',
        toolCallId: 'tool-call-replay',
        output: { decisionId: 17 },
      },
    });

    await expect(
      service.invokeTool(EXECUTION_CONTEXT, {
        providerToolCallId: 'call-replay',
        toolName: 'getDecisionContext',
        input: { decisionId: 17 },
      }),
    ).resolves.toEqual({
      status: 'SUCCEEDED',
      toolCallId: 'tool-call-replay',
      output: { decisionId: 17 },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(settleToolCall).not.toHaveBeenCalled();
  });

  it('落库摘要被截断时不重放，返回可驱动模型重新调用的稳定失败', async () => {
    const { service, execute, settleToolCall } = createService({
      startResult: {
        state: 'REPLAY_UNAVAILABLE',
        toolCallId: 'tool-call-truncated',
      },
    });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-truncated',
      toolName: 'getDecisionContext',
      input: { decisionId: 17 },
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      toolCallId: 'tool-call-truncated',
      failureCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
    });
    // 截断标记绝不能被当成成功输出交回模型。
    expect(result).not.toMatchObject({ status: 'SUCCEEDED' });
    expect(execute).not.toHaveBeenCalled();
    expect(settleToolCall).not.toHaveBeenCalled();
  });

  it('工具抛出未知异常时只返回脱敏说明', async () => {
    const { service } = createService({
      discoveries: [{ toolCallId: 'tool-call-0', candidateIdentifiers: [17] }],
      execute: jest
        .fn()
        .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    });

    const result = await service.invokeTool(EXECUTION_CONTEXT, {
      providerToolCallId: 'call-7',
      toolName: 'getDecisionContext',
      input: { decisionId: 17 },
    });

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
    });
    expect(result.status === 'FAILED' && result.failureReason).not.toContain(
      'ECONNREFUSED',
    );
  });

  it('构造时拒绝没有对应注册描述的执行器，避免出现模型看不到的隐藏能力', () => {
    const registry = new AiToolRegistryService([DISCOVERY_DESCRIPTOR]);
    const orphanExecutor = {
      toolName: 'getDecisionContext',
      execute: jest.fn(),
    } as unknown as AiToolExecutor<Record<string, unknown>, unknown>;

    expect(
      () =>
        new AiToolInvocationService(
          registry,
          {} as unknown as AiToolCallService,
          [orphanExecutor],
        ),
    ).toThrow('AI 工具执行器没有对应的注册描述');
  });

  it('构造时拒绝没有执行器的工具描述，避免模型看到运行时不可用的能力', () => {
    const registry = new AiToolRegistryService([DISCOVERY_DESCRIPTOR]);

    expect(
      () =>
        new AiToolInvocationService(
          registry,
          {} as unknown as AiToolCallService,
          [],
        ),
    ).toThrow('AI 工具描述没有对应执行器');
  });
});
