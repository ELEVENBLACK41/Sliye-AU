/**
 * @file 决策协作领域数据检查与安全重置脚本。
 * @description 默认只统计现有决策、讨论、会议和决策过程数据；只有在非生产环境下
 *              同时传入重置模式与固定确认短语时，才会原子清理协作领域数据。
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma';

/** 执行写入模式时必须提供的固定确认短语。 */
const RESET_CONFIRMATION = 'RESET_DECISION_COLLABORATION';

/** 协作领域数据统计结果。 */
type CollaborationDataCounts = {
  /** 议事数量。 */
  matters: number;
  /** 议事成员关系数量。 */
  matterMembers: number;
  /** 讨论分区数量。 */
  discussionAreas: number;
  /** 私有分区成员关系数量。 */
  discussionAreaMembers: number;
  /** 决策数量。 */
  decisions: number;
  /** 讨论消息数量。 */
  discussionMessages: number;
  /** 私有内容公开摘要数量。 */
  discussionPublications: number;
  /** 会议数量。 */
  meetings: number;
  /** 会议决策关联数量。 */
  meetingDecisions: number;
  /** 会议录像数量。 */
  meetingRecordings: number;
  /** 提案数量。 */
  proposals: number;
  /** 投票轮次数量。 */
  voteRounds: number;
  /** 正式决议数量。 */
  resolutions: number;
  /** 决策事件数量。 */
  decisionEvents: number;
  /** 预留决策任务数量。 */
  decisionTasks: number;
  /** 私有内容审计日志数量。 */
  collaborationAuditLogs: number;
};

/** 重置脚本必须保留的基础数据统计结果。 */
type PreservedDataCounts = {
  /** 用户数量。 */
  users: number;
  /** 密码凭证数量。 */
  passwordCredentials: number;
  /** 认证会话数量。 */
  authSessions: number;
  /** 部门数量。 */
  departments: number;
  /** 角色数量。 */
  roles: number;
  /** 权限数量。 */
  permissions: number;
  /** 用户角色绑定数量。 */
  userRoles: number;
  /** 角色权限绑定数量。 */
  rolePermissions: number;
  /** 用户直接权限数量。 */
  userPermissions: number;
  /** 权限申请数量。 */
  permissionRequests: number;
  /** 访问控制审计日志数量。 */
  accessControlAuditLogs: number;
};

/** 解析脚本模式并拒绝未知参数，避免误把拼写错误当成安全检查。 */
function resolveMode(): 'check' | 'reset' {
  const argumentsSet = new Set(process.argv.slice(2));
  const supportedArguments = new Set([
    '--check',
    '--reset',
    `--confirm=${RESET_CONFIRMATION}`,
  ]);
  const unknownArguments = [...argumentsSet].filter(
    (argument) => !supportedArguments.has(argument),
  );

  if (unknownArguments.length > 0) {
    throw new Error(`不支持的参数：${unknownArguments.join('、')}`);
  }

  if (argumentsSet.has('--check') && argumentsSet.has('--reset')) {
    throw new Error('不能同时使用 --check 和 --reset。');
  }

  return argumentsSet.has('--reset') ? 'reset' : 'check';
}

/** 创建供一次性脚本使用的 Prisma 客户端。 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env['DATABASE_URL']?.trim();

  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL，无法检查协作领域数据。');
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/** 返回不包含用户名和密码的数据库目标说明。 */
function describeDatabaseTarget(): string {
  const connectionString = process.env['DATABASE_URL']?.trim();

  if (!connectionString) {
    return '未知数据库';
  }

  const databaseUrl = new URL(connectionString);
  const databaseName = databaseUrl.pathname.replace(/^\//, '') || '(default)';

  return `${databaseUrl.hostname}:${databaseUrl.port || '5432'}/${databaseName}`;
}

/** 并行统计当前议事与决策协作模型中的数据数量。 */
async function countCollaborationData(
  prisma: PrismaClient,
): Promise<CollaborationDataCounts> {
  const [
    matters,
    matterMembers,
    discussionAreas,
    discussionAreaMembers,
    decisions,
    discussionMessages,
    discussionPublications,
    meetings,
    meetingDecisions,
    meetingRecordings,
    proposals,
    voteRounds,
    resolutions,
    decisionEvents,
    decisionTasks,
    collaborationAuditLogs,
  ] = await Promise.all([
    prisma.matter.count(),
    prisma.matterMember.count(),
    prisma.discussionArea.count(),
    prisma.discussionAreaMember.count(),
    prisma.decision.count(),
    prisma.discussionMessage.count(),
    prisma.discussionPublication.count(),
    prisma.meetingSession.count(),
    prisma.meetingDecision.count(),
    prisma.meetingRecording.count(),
    prisma.decisionProposal.count(),
    prisma.decisionVoteRound.count(),
    prisma.decisionResolution.count(),
    prisma.decisionEvent.count(),
    prisma.decisionTask.count(),
    prisma.collaborationAuditLog.count(),
  ]);

  return {
    matters,
    matterMembers,
    discussionAreas,
    discussionAreaMembers,
    decisions,
    discussionMessages,
    discussionPublications,
    meetings,
    meetingDecisions,
    meetingRecordings,
    proposals,
    voteRounds,
    resolutions,
    decisionEvents,
    decisionTasks,
    collaborationAuditLogs,
  };
}

/** 并行统计重置前后都必须保持不变的用户、认证和权限基础数据。 */
async function countPreservedData(
  prisma: PrismaClient,
): Promise<PreservedDataCounts> {
  const [
    users,
    passwordCredentials,
    authSessions,
    departments,
    roles,
    permissions,
    userRoles,
    rolePermissions,
    userPermissions,
    permissionRequests,
    accessControlAuditLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userPasswordCredential.count(),
    prisma.authSession.count(),
    prisma.department.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.userRole.count(),
    prisma.rolePermission.count(),
    prisma.userPermission.count(),
    prisma.permissionRequest.count(),
    prisma.accessControlAuditLog.count(),
  ]);

  return {
    users,
    passwordCredentials,
    authSessions,
    departments,
    roles,
    permissions,
    userRoles,
    rolePermissions,
    userPermissions,
    permissionRequests,
    accessControlAuditLogs,
  };
}

/** 以稳定中文格式输出数据库目标和各协作模型数量。 */
function printCounts(counts: CollaborationDataCounts): void {
  console.log(`数据库：${describeDatabaseTarget()}`);
  console.table({
    议事: counts.matters,
    议事成员: counts.matterMembers,
    讨论分区: counts.discussionAreas,
    私有分区成员: counts.discussionAreaMembers,
    决策: counts.decisions,
    讨论消息: counts.discussionMessages,
    公开摘要: counts.discussionPublications,
    会议: counts.meetings,
    会议决策关联: counts.meetingDecisions,
    会议录像: counts.meetingRecordings,
    提案: counts.proposals,
    投票轮次: counts.voteRounds,
    正式决议: counts.resolutions,
    决策事件: counts.decisionEvents,
    预留决策任务: counts.decisionTasks,
    私有内容审计日志: counts.collaborationAuditLogs,
  });
}

/** 以稳定中文格式输出明确受保护的基础数据数量。 */
function printPreservedCounts(counts: PreservedDataCounts): void {
  console.log('以下基础数据不在重置范围内：');
  console.table({
    用户: counts.users,
    密码凭证: counts.passwordCredentials,
    认证会话: counts.authSessions,
    部门: counts.departments,
    角色: counts.roles,
    权限: counts.permissions,
    用户角色绑定: counts.userRoles,
    角色权限绑定: counts.rolePermissions,
    用户直接权限: counts.userPermissions,
    权限申请: counts.permissionRequests,
    访问控制审计日志: counts.accessControlAuditLogs,
  });
}

/** 确认受保护基础数据在重置前后数量完全一致。 */
function assertPreservedDataUnchanged(
  beforeCounts: PreservedDataCounts,
  afterCounts: PreservedDataCounts,
): void {
  const changedEntries = Object.entries(beforeCounts).filter(
    ([key, value]) => afterCounts[key as keyof PreservedDataCounts] !== value,
  );

  if (changedEntries.length > 0) {
    throw new Error(
      `受保护基础数据数量发生变化：${changedEntries
        .map(([key]) => key)
        .join('、')}`,
    );
  }
}

/** 校验重置模式只能在非生产环境并携带固定确认短语时执行。 */
function assertResetAllowed(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('生产环境禁止执行协作领域数据重置。');
  }

  if (!process.argv.includes(`--confirm=${RESET_CONFIRMATION}`)) {
    throw new Error(`重置操作必须显式传入 --confirm=${RESET_CONFIRMATION}。`);
  }
}

/** 按外键依赖顺序在单个事务中清理议事与决策协作数据。 */
async function resetCollaborationData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.decisionEvent.deleteMany();
    await transaction.collaborationAuditLog.deleteMany();
    await transaction.discussionPublicationSource.deleteMany();
    await transaction.discussionPublication.deleteMany();
    await transaction.meetingRecording.deleteMany();
    await transaction.discussionMessage.deleteMany();
    await transaction.meetingSession.deleteMany();
    await transaction.decision.deleteMany();
    await transaction.discussionArea.deleteMany();
    await transaction.matter.deleteMany();
  });
}

/** 执行只读检查或受保护的数据重置，并在任何情况下关闭数据库连接。 */
async function main(): Promise<void> {
  const mode = resolveMode();
  const prisma = createPrismaClient();

  try {
    const beforeCounts = await countCollaborationData(prisma);
    const beforePreservedCounts = await countPreservedData(prisma);
    printCounts(beforeCounts);
    printPreservedCounts(beforePreservedCounts);

    if (mode === 'check') {
      console.log('当前为只读检查模式，未修改任何数据。');
      return;
    }

    assertResetAllowed();
    await resetCollaborationData(prisma);

    console.log('协作领域数据已完成事务清理，复核结果如下：');
    printCounts(await countCollaborationData(prisma));
    const afterPreservedCounts = await countPreservedData(prisma);
    assertPreservedDataUnchanged(beforePreservedCounts, afterPreservedCounts);
    printPreservedCounts(afterPreservedCounts);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  const prismaDetails =
    typeof error === 'object' && error !== null
      ? {
          code: 'code' in error ? error.code : undefined,
          meta: 'meta' in error ? error.meta : undefined,
        }
      : undefined;

  console.error(`协作领域数据脚本执行失败：${message}`);
  console.error('Prisma 错误详情：', prismaDetails);
  process.exitCode = 1;
});
