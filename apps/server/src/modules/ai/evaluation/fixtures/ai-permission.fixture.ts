/**
 * 本文件提供脱敏、静态且可重复的 AI 权限评测 Fixture，
 * 用于覆盖公共区、私有区、删除、跨项目和匿名投票的权限边界。
 */
import type { AiPermissionFixtureV1 } from '../types/ai-permission-fixture.types';

/** 脱敏权限评测 Fixture V1 的稳定元数据集合。 */
export const AI_PERMISSION_FIXTURE_V1 = {
  fixtureVersion: 'ai-permission-fixture-v1',
  userIds: [
    // 项目 2001 成员，且是私有区 3002 成员。
    1001,
    // 项目 2001 成员，但不是私有区 3002 成员。
    1002,
    // 已知用户，但不是任何项目成员。
    1003,
    // 仅是外部项目 2002 成员。
    1004,
  ],
  projectIds: [2001, 2002],
  projectMemberships: [
    // 用户 1001 是项目 2001 成员，同时也是私有区 3002 成员。
    { userId: 1001, projectId: 2001 },
    // 用户 1002 是项目 2001 成员，但不是私有区 3002 成员。
    { userId: 1002, projectId: 2001 },
    // 用户 1004 仅属于外部项目 2002。
    { userId: 1004, projectId: 2002 },
  ],
  discussionAreas: [
    // 项目 2001 的公共讨论区。
    { areaId: 3001, projectId: 2001, visibility: 'public' },
    // 项目 2001 的私有讨论区。
    { areaId: 3002, projectId: 2001, visibility: 'private' },
    // 外部项目 2002 的公共讨论区。
    { areaId: 3003, projectId: 2002, visibility: 'public' },
  ],
  privateAreaMemberships: [
    // 仅用户 1001 可访问项目 2001 的私有区 3002。
    { userId: 1001, areaId: 3002 },
  ],
  sources: [
    // 正常公共证据：项目成员可在公共区访问的讨论消息元数据。
    {
      sourceType: 'discussion_message',
      sourceId: 4001,
      projectId: 2001,
      decisionId: 5001,
      areaId: 3001,
      deletedAt: null,
    },
    // 私有区证据：用于验证缺少私有区成员关系时不得召回。
    {
      sourceType: 'discussion_message',
      sourceId: 4002,
      projectId: 2001,
      decisionId: 5002,
      areaId: 3002,
      deletedAt: null,
    },
    // 已删除诱饵：即使位于公共区，也不能作为可引用证据。
    {
      sourceType: 'decision_event',
      sourceId: 4003,
      projectId: 2001,
      decisionId: 5001,
      areaId: 3001,
      deletedAt: '2026-01-01T00:00:00.000Z',
    },
    // 跨项目诱饵：项目 2001 的请求不得触及项目 2002 的决议。
    {
      sourceType: 'resolution',
      sourceId: 4004,
      projectId: 2002,
      decisionId: 5003,
      areaId: 3003,
      deletedAt: null,
    },
    // 允许的项目级匿名投票汇总：不包含任何个人选票信息。
    {
      sourceType: 'vote_round',
      sourceId: 7001,
      projectId: 2001,
      decisionId: 5004,
      areaId: null,
      deletedAt: null,
    },
    // 匿名选票诱饵：绝不能被检索、引用、展示或关联到投票人。
    {
      sourceType: 'vote_ballot',
      sourceId: 6001,
      projectId: 2001,
      decisionId: 5004,
      areaId: null,
      voteRoundId: 7001,
      voterId: 1001,
      isAnonymous: true,
    },
  ],
} as const satisfies AiPermissionFixtureV1;
