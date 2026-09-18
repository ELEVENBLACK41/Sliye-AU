/**
 * 本文件验证 AI 来源失权投影会按来源类型批量复核，
 * 提案和投票轮次不会绕过所属决策权限，非法来源默认不可见。
 */

import { AiSourceType, AiSourceUsage } from '../../../../generated/prisma';
import type { AuthorizationContext } from '../../../auth/types/auth.types';
import type { DecisionVisibilityService } from '../../../decisions/services/decision-visibility.service';
import { AiSourceVisibilityService } from './ai-source-visibility.service';

/** 创建来源投影测试使用的授权上下文。 */
const AUTHORIZATION_CONTEXT: AuthorizationContext = {
  userId: 42,
  deptId: null,
  isSuperAdmin: false,
  roleCodes: new Set(),
  deniedPermissions: new Set(),
  grants: new Map(),
};

/** 创建来源投影服务及四类来源的可见性替身。 */
function createHarness() {
  const findMany = jest.fn().mockResolvedValue([
    {
      runId: 'run-001',
      sourceType: AiSourceType.DECISION,
      sourceId: '1',
      usage: AiSourceUsage.READ,
    },
    {
      runId: 'run-001',
      sourceType: AiSourceType.DECISION_PROPOSAL,
      sourceId: '11',
      usage: AiSourceUsage.READ,
    },
    {
      runId: 'run-001',
      sourceType: AiSourceType.DECISION_VOTE_ROUND,
      sourceId: '21',
      usage: AiSourceUsage.READ,
    },
    {
      runId: 'run-001',
      sourceType: AiSourceType.DECISION_RESOLUTION,
      sourceId: '31',
      usage: AiSourceUsage.READ,
    },
    {
      runId: 'run-001',
      sourceType: AiSourceType.DECISION_PROPOSAL,
      sourceId: 'invalid',
      usage: AiSourceUsage.READ,
    },
  ]);
  const prisma = { aiSourceDependency: { findMany } };
  const filterVisibleDecisionIds = jest.fn().mockResolvedValue(new Set([1]));
  const filterVisibleResolutionIds = jest.fn().mockResolvedValue(new Set([31]));
  const filterVisibleProposalIds = jest.fn().mockResolvedValue(new Set([11]));
  const filterVisibleVoteRoundIds = jest.fn().mockResolvedValue(new Set([21]));
  const decisionVisibilityService = {
    filterVisibleDecisionIds,
    filterVisibleResolutionIds,
    filterVisibleProposalIds,
    filterVisibleVoteRoundIds,
  } as unknown as DecisionVisibilityService;

  return {
    service: new AiSourceVisibilityService(
      prisma as never,
      decisionVisibilityService,
    ),
    findMany,
    filterVisibleProposalIds,
    filterVisibleVoteRoundIds,
  };
}

describe('AiSourceVisibilityService', () => {
  /** 验证四类当前来源按类型批量复核，任一非法或失权来源都会隐藏 Run。 */
  it('批量复核决策、提案、投票轮次和决议来源', async () => {
    const {
      service,
      findMany,
      filterVisibleProposalIds,
      filterVisibleVoteRoundIds,
    } = createHarness();

    await expect(
      service.evaluateRunsSourceVisibility(AUTHORIZATION_CONTEXT, [
        'run-001',
        'run-002',
      ]),
    ).resolves.toEqual(
      new Map([
        ['run-001', false],
        ['run-002', true],
      ]),
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { runId: { in: ['run-001', 'run-002'] }, usage: 'READ' },
      select: { runId: true, sourceType: true, sourceId: true },
    });
    expect(filterVisibleProposalIds).toHaveBeenCalledWith(
      AUTHORIZATION_CONTEXT,
      [11],
    );
    expect(filterVisibleVoteRoundIds).toHaveBeenCalledWith(
      AUTHORIZATION_CONTEXT,
      [21],
    );
  });

  /** 验证没有 READ 来源的 Run 默认保持可见。 */
  it('没有来源时不触发业务可见性查询', async () => {
    const { service, findMany, filterVisibleProposalIds } = createHarness();
    findMany.mockResolvedValue([]);

    await expect(
      service.evaluateRunsSourceVisibility(AUTHORIZATION_CONTEXT, ['run-001']),
    ).resolves.toEqual(new Map([['run-001', true]]));
    expect(filterVisibleProposalIds).not.toHaveBeenCalled();
  });
});
