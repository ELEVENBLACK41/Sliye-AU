/**
 * 本文件验证参与决策 Gold Fixture 的结构、来源语义和关键门禁场景。
 * 本轮只验证评测资产本身的一致性，不提前实现 `listMyParticipatedDecisions` 查询器。
 */

import { AI_PARTICIPATED_DECISIONS_FIXTURE_V1 } from './fixtures/participation/ai-participated-decisions.fixture';

/** 按稳定标识读取参与决策 Gold Query，缺失时让测试直接失败。 */
function findQuery(id: string) {
  const query = AI_PARTICIPATED_DECISIONS_FIXTURE_V1.queries.find(
    (item) => item.id === id,
  );
  expect(query).toBeDefined();
  return query!;
}

describe('listMyParticipatedDecisions Gold Fixture', () => {
  it('使用唯一决策、项目和私有分区关系，覆盖后续授权查询所需的边界数据', () => {
    const decisionIds = AI_PARTICIPATED_DECISIONS_FIXTURE_V1.decisions.map(
      (decision) => decision.decisionId,
    );
    const projectIds = AI_PARTICIPATED_DECISIONS_FIXTURE_V1.projects.map(
      (project) => project.projectId,
    );
    const areaIds = AI_PARTICIPATED_DECISIONS_FIXTURE_V1.privateAreas.map(
      (area) => area.areaId,
    );

    expect(new Set(decisionIds).size).toBe(decisionIds.length);
    expect(new Set(projectIds).size).toBe(projectIds.length);
    expect(new Set(areaIds).size).toBe(areaIds.length);
    expect(
      AI_PARTICIPATED_DECISIONS_FIXTURE_V1.projectMemberships,
    ).toContainEqual({ userId: 1001, projectId: 2002 });
    expect(AI_PARTICIPATED_DECISIONS_FIXTURE_V1.areaMemberships).toContainEqual(
      { userId: 1001, areaId: 3002 },
    );
    expect(
      AI_PARTICIPATED_DECISIONS_FIXTURE_V1.areaMemberships,
    ).not.toContainEqual({ userId: 1002, areaId: 3002 });
  });

  it('每条 Gold Query 的列表项来源都与 DECISION 列表项一一对应，不伪造聚合来源', () => {
    const decisionIds = new Set<number>(
      AI_PARTICIPATED_DECISIONS_FIXTURE_V1.decisions.map(
        (decision) => decision.decisionId,
      ),
    );

    for (const query of AI_PARTICIPATED_DECISIONS_FIXTURE_V1.queries) {
      const listedDecisionIds = query.expectedOutput.decisions.map(
        (decision) => decision.decisionId,
      );
      const expectedSources = [...query.expectedSourceReferences] as Array<{
        sourceType: 'DECISION';
        sourceId: number;
      }>;

      expect(expectedSources).toEqual(
        listedDecisionIds.map((sourceId) => ({
          sourceType: 'DECISION',
          sourceId,
        })),
      );
      expect(
        expectedSources.every((source) => decisionIds.has(source.sourceId)),
      ).toBe(true);
    }
  });

  it('覆盖全部项目、范围、状态、归档、上限、空结果、非成员和私有区失权场景', () => {
    const queryIds = AI_PARTICIPATED_DECISIONS_FIXTURE_V1.queries.map(
      (query) => query.id,
    );

    expect(queryIds).toEqual([
      'my-participated-active-list',
      'my-participated-with-archive',
      'my-participated-project-filter',
      'my-participated-area-filter',
      'my-participated-status-filter',
      'my-participated-list-limit',
      'my-participated-empty',
      'my-participated-private-area-revoked',
    ]);
    expect(findQuery('my-participated-active-list').expectedOutput.total).toBe(
      3,
    );
    expect(findQuery('my-participated-with-archive').expectedOutput.total).toBe(
      4,
    );
    expect(findQuery('my-participated-project-filter').input).toEqual({
      projectQuery: '研发效率',
      scope: 'PROJECT',
    });
    expect(
      findQuery('my-participated-area-filter').expectedOutput.decisions,
    ).toHaveLength(1);
    expect(findQuery('my-participated-status-filter').input).toEqual({
      status: 'DISCUSSING',
    });
    expect(findQuery('my-participated-list-limit').expectedOutput.hasMore).toBe(
      true,
    );
    expect(findQuery('my-participated-empty').expectedOutput.decisions).toEqual(
      [],
    );
    expect(findQuery('my-participated-empty').forbiddenDecisionIds).toContain(
      5001,
    );
    expect(
      findQuery('my-participated-private-area-revoked').forbiddenDecisionIds,
    ).toEqual([5002, 5005]);
  });

  it('保留不同参与角色，并明确默认归档过滤与列表稳定排序结果', () => {
    const activeList = findQuery('my-participated-active-list').expectedOutput;

    expect(activeList.decisions.map((decision) => decision.decisionId)).toEqual(
      [5002, 5003, 5001],
    );
    expect(activeList.decisions.map((decision) => decision.role)).toEqual([
      'EDITOR',
      'APPROVER',
      'OWNER',
    ]);
    expect(activeList.statusCounts).toContainEqual({
      status: 'ARCHIVED',
      count: 0,
    });
    expect(
      findQuery('my-participated-with-archive').expectedOutput.decisions[0],
    ).toMatchObject({
      decisionId: 5004,
      status: 'ARCHIVED',
    });
  });
});
