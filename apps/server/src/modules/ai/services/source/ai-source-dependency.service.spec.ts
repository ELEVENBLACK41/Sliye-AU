/**
 * 本文件验证 AI 来源登记将各类工具来源映射为对应 Prisma 枚举，
 * 并保持空来源不产生无意义的数据库写入。
 */

import type { PrismaService } from '../../../../database/prisma.service';
import { AiSourceType } from '../../../../generated/prisma';
import type { AiToolSourceRef } from '../../types/ai-tool-source.types';
import { AiSourceDependencyService } from './ai-source-dependency.service';

/** 创建一组覆盖全部已支持来源类型的来源引用。 */
function createSources(): AiToolSourceRef[] {
  return [
    { sourceType: 'DECISION', sourceId: '1', label: '决策' },
    { sourceType: 'DECISION_PROPOSAL', sourceId: '2', label: '提案' },
    { sourceType: 'DECISION_VOTE_ROUND', sourceId: '3', label: '投票轮次' },
    { sourceType: 'DECISION_RESOLUTION', sourceId: '4', label: '正式决议' },
  ];
}

describe('AiSourceDependencyService', () => {
  /** 验证来源类型完整映射到同名 Prisma 枚举。 */
  it('登记提案和投票轮次来源时不会错误映射为决议来源', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const service = new AiSourceDependencyService({} as PrismaService);

    await service.registerReadSourcesInTransaction(
      { aiSourceDependency: { createMany } } as never,
      {
        runId: 'run-001',
        toolCallId: 'tool-001',
        sources: createSources(),
      },
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          runId: 'run-001',
          toolCallId: 'tool-001',
          sourceType: AiSourceType.DECISION,
          sourceId: '1',
          usage: 'READ',
          label: '决策',
        },
        {
          runId: 'run-001',
          toolCallId: 'tool-001',
          sourceType: AiSourceType.DECISION_PROPOSAL,
          sourceId: '2',
          usage: 'READ',
          label: '提案',
        },
        {
          runId: 'run-001',
          toolCallId: 'tool-001',
          sourceType: AiSourceType.DECISION_VOTE_ROUND,
          sourceId: '3',
          usage: 'READ',
          label: '投票轮次',
        },
        {
          runId: 'run-001',
          toolCallId: 'tool-001',
          sourceType: AiSourceType.DECISION_RESOLUTION,
          sourceId: '4',
          usage: 'READ',
          label: '正式决议',
        },
      ],
      skipDuplicates: true,
    });
  });

  /** 验证空来源不会创建空的批量写入。 */
  it('没有来源时跳过登记', async () => {
    const createMany = jest.fn();
    const service = new AiSourceDependencyService({} as PrismaService);

    await service.registerReadSourcesInTransaction(
      { aiSourceDependency: { createMany } } as never,
      { runId: 'run-001', toolCallId: 'tool-001', sources: [] },
    );

    expect(createMany).not.toHaveBeenCalled();
  });
});
