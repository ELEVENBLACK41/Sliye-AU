/**
 * @file 真实决策协作全链路演示数据脚本。
 * @description 复用当前数据库中的启用用户与真实部门关系，以单事务创建项目、部门分区、
 *              群聊、项目级与小组级决策、提案、实名/匿名投票、会议、快速通话和最终决议。
 *              脚本使用固定标识幂等执行，不清空或覆盖现有业务数据。
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import {
  DecisionEventType,
  DecisionStatus,
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  DiscussionMessageType,
  MeetingInvitationStatus,
  MeetingKind,
  MeetingMediaMode,
  MeetingParticipantRole,
  MeetingPresenceEventType,
  MeetingStatus,
  ParticipantRole,
  Prisma,
  PrismaClient,
  ProjectMemberRole,
  ProjectStatus,
  ProposalStatus,
  RecordingStatus,
  ResolutionKind,
  ResolutionStatus,
  UserStatus,
  VoteMethod,
  VoteRoundStatus,
} from '../src/generated/prisma';

/** 写入模式使用的固定确认短语。 */
const APPLY_CONFIRMATION = 'SEED_DECISION_LIFECYCLE_DEMO';
/** 项目描述中的稳定幂等标识。 */
const DEMO_MARKER = '[DEMO:decision-lifecycle-v1]';
/** 当前案例需要具备启用成员的部门代码。 */
const REQUIRED_DEPARTMENT_CODES = [
  'strategyplatform',
  'riskalgorithm',
  'riskqa',
  'riskbackend',
  'riskproduct',
  'datatechbackend',
  'datatechqa',
  'datatech',
] as const;

/** 当前演示案例使用的部门代码。 */
type DemoDepartmentCode = (typeof REQUIRED_DEPARTMENT_CODES)[number];

/** 部门与当前选中演示成员的安全映射。 */
type DemoMember = {
  /** 用户主键，仅在运行时从当前数据库解析。 */
  userId: number;
  /** 用户当前所在部门主键。 */
  departmentId: number;
  /** 用户当前所在部门名称。 */
  departmentName: string;
};

/** 全链路插入后的核心资源标识。 */
type DemoSeedResult = {
  /** 新建项目主键。 */
  projectId: number;
  /** 项目级决策主键。 */
  projectDecisionId: number;
  /** 数据技术部小组决策主键。 */
  groupDecisionId: number;
  /** 项目级预约会议主键。 */
  projectMeetingId: number;
  /** 小组快速通话主键。 */
  quickCallId: number;
};

/** 演示数据完整性统计。 */
type DemoCounts = {
  /** 项目成员数量。 */
  projectMembers: number;
  /** 项目讨论分区数量。 */
  areas: number;
  /** 项目群聊消息数量。 */
  messages: number;
  /** 项目内决策数量。 */
  decisions: number;
  /** 决策提案数量。 */
  proposals: number;
  /** 投票轮次数量。 */
  voteRounds: number;
  /** 投票选票数量。 */
  ballots: number;
  /** 正式决议数量。 */
  resolutions: number;
  /** 会议和快速通话数量。 */
  meetings: number;
  /** 决策过程事件数量。 */
  events: number;
};

/** 创建供一次性脚本使用的 Prisma 客户端。 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env['DATABASE_URL']?.trim();

  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL，无法写入决策协作演示数据。');
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

/** 把东八区业务时间转换为稳定 Date，避免不同机器时区改变时间线。 */
function at(value: string): Date {
  return new Date(`${value}+08:00`);
}

/** 解析脚本模式并拒绝未知参数。 */
function resolveMode(): 'check' | 'apply' {
  const argumentsSet = new Set(process.argv.slice(2));
  const supportedArguments = new Set([
    '--check',
    '--apply',
    `--confirm=${APPLY_CONFIRMATION}`,
  ]);
  const unknownArguments = [...argumentsSet].filter(
    (argument) => !supportedArguments.has(argument),
  );

  if (unknownArguments.length > 0) {
    throw new Error(`不支持的参数：${unknownArguments.join('、')}`);
  }

  if (argumentsSet.has('--check') && argumentsSet.has('--apply')) {
    throw new Error('不能同时使用 --check 和 --apply。');
  }

  return argumentsSet.has('--apply') ? 'apply' : 'check';
}

/** 校验写入模式只允许在非生产环境且携带固定确认短语时执行。 */
function assertApplyAllowed(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('生产环境禁止执行演示数据写入脚本。');
  }

  if (!process.argv.includes(`--confirm=${APPLY_CONFIRMATION}`)) {
    throw new Error(
      `写入演示数据必须显式传入 --confirm=${APPLY_CONFIRMATION}。`,
    );
  }
}

/** 从当前真实组织数据中为每个必需部门选择一名启用用户。 */
async function resolveDemoMembers(
  prisma: PrismaClient,
): Promise<Map<DemoDepartmentCode, DemoMember>> {
  const users = await prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      deptId: { not: null },
      department: {
        code: { in: [...REQUIRED_DEPARTMENT_CODES] },
        status: 'ACTIVE',
      },
    },
    select: {
      id: true,
      department: {
        select: { id: true, code: true, name: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const members = new Map<DemoDepartmentCode, DemoMember>();

  for (const user of users) {
    const department = user.department;

    if (!department) {
      continue;
    }

    const code = department.code as DemoDepartmentCode;
    if (!members.has(code)) {
      members.set(code, {
        userId: user.id,
        departmentId: department.id,
        departmentName: department.name,
      });
    }
  }

  const missingCodes = REQUIRED_DEPARTMENT_CODES.filter(
    (code) => !members.has(code),
  );
  if (missingCodes.length > 0) {
    throw new Error(
      `以下部门缺少启用用户，无法构造真实组织案例：${missingCodes.join('、')}`,
    );
  }

  return members;
}

/** 从运行时成员映射取得必然存在的部门成员。 */
function memberOf(
  members: Map<DemoDepartmentCode, DemoMember>,
  code: DemoDepartmentCode,
): DemoMember {
  const member = members.get(code);

  if (!member) {
    throw new Error(`未解析到部门成员：${code}`);
  }

  return member;
}

/** 查询当前数据库是否已经存在本版本演示项目。 */
async function findExistingDemo(prisma: PrismaClient): Promise<number | null> {
  const existing = await prisma.project.findFirst({
    where: { description: { contains: DEMO_MARKER } },
    select: { id: true },
  });

  return existing?.id ?? null;
}

/** 统计指定演示项目中的核心协作数据。 */
async function countDemoData(
  prisma: PrismaClient,
  projectId: number,
): Promise<DemoCounts> {
  const decisionFilter = { projectId };
  const meetingFilter = {
    OR: [
      { area: { projectId } },
      { decisionLinks: { some: { decision: { projectId } } } },
    ],
  };
  const [
    projectMembers,
    areas,
    messages,
    decisions,
    proposals,
    voteRounds,
    ballots,
    resolutions,
    meetings,
    events,
  ] = await Promise.all([
    prisma.projectMember.count({ where: { projectId } }),
    prisma.discussionArea.count({ where: { projectId } }),
    prisma.discussionMessage.count({ where: { area: { projectId } } }),
    prisma.decision.count({ where: decisionFilter }),
    prisma.decisionProposal.count({
      where: { decision: decisionFilter },
    }),
    prisma.decisionVoteRound.count({
      where: { decision: decisionFilter },
    }),
    prisma.decisionBallot.count({
      where: { round: { decision: decisionFilter } },
    }),
    prisma.decisionResolution.count({
      where: { decision: decisionFilter },
    }),
    prisma.meetingSession.count({ where: meetingFilter }),
    prisma.decisionEvent.count({ where: { decision: decisionFilter } }),
  ]);

  return {
    projectMembers,
    areas,
    messages,
    decisions,
    proposals,
    voteRounds,
    ballots,
    resolutions,
    meetings,
    events,
  };
}

/** 输出演示项目的关联数据统计。 */
function printDemoCounts(projectId: number, counts: DemoCounts): void {
  console.log(`演示项目 ID：${projectId}`);
  console.table({
    项目成员: counts.projectMembers,
    讨论分区: counts.areas,
    群聊消息: counts.messages,
    决策: counts.decisions,
    提案: counts.proposals,
    投票轮次: counts.voteRounds,
    选票: counts.ballots,
    正式决议: counts.resolutions,
    会议与快速通话: counts.meetings,
    决策事件: counts.events,
  });
}

/** 把 Prisma JSON 值安全收窄为普通对象。 */
function readJsonRecord(
  value: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

/** 核对演示项目能否仅凭事件时间线还原标题、状态和采纳来源。 */
async function auditDemoReplayEvidence(
  prisma: PrismaClient,
  projectId: number,
): Promise<string[]> {
  const decisions = await prisma.decision.findMany({
    where: { projectId },
    select: {
      id: true,
      proposals: true,
      voteRounds: { include: { options: { orderBy: { sortOrder: 'asc' } } } },
      resolutions: true,
      events: true,
    },
  });
  const issues: string[] = [];
  for (const decision of decisions) {
    for (const proposal of decision.proposals) {
      const created = decision.events.find(
        (event) =>
          event.proposalId === proposal.id &&
          event.type === DecisionEventType.PROPOSAL_CREATED,
      );
      const createdAfter = readJsonRecord(created?.after ?? null);
      if (createdAfter?.title !== proposal.title)
        issues.push(`提案 ${proposal.id} 缺少真实标题快照`);
      if (proposal.status !== ProposalStatus.OPEN) {
        const statusEvent = decision.events.find(
          (event) =>
            event.proposalId === proposal.id &&
            event.type === DecisionEventType.PROPOSAL_UPDATED &&
            readJsonRecord(event.after)?.status === proposal.status,
        );
        if (!statusEvent)
          issues.push(`提案 ${proposal.id} 缺少 ${proposal.status} 状态事件`);
      }
    }
    for (const round of decision.voteRounds) {
      const [approve, reject, abstain] = round.options;
      if (
        round.options.length !== 3 ||
        approve?.code !== 'APPROVE' ||
        approve.proposalId === null ||
        reject?.code !== 'REJECT' ||
        reject.proposalId !== null ||
        abstain?.code !== 'ABSTAIN' ||
        abstain.proposalId !== null
      ) {
        issues.push(`投票轮次 ${round.id} 不是标准单提案表决`);
      }
      const closed = decision.events.find(
        (event) =>
          event.voteRoundId === round.id &&
          event.type === DecisionEventType.VOTE_ROUND_CLOSED,
      );
      const result = readJsonRecord(
        readJsonRecord(closed?.payload ?? null)?.result ?? null,
      );
      if (
        typeof result?.totalBallots !== 'number' ||
        result.outcome !== 'APPROVED'
      ) {
        issues.push(`投票轮次 ${round.id} 缺少标准关闭结果`);
      }
    }
    for (const resolution of decision.resolutions) {
      const created = decision.events.find(
        (event) =>
          event.resolutionId === resolution.id &&
          event.type === DecisionEventType.RESOLUTION_CREATED,
      );
      const payload = readJsonRecord(created?.payload ?? null);
      const after = readJsonRecord(created?.after ?? null);
      if (after?.title !== resolution.title)
        issues.push(`决议 ${resolution.id} 缺少真实标题快照`);
      if (
        payload?.sourceProposalId !== resolution.sourceProposalId ||
        payload?.sourceVoteRoundId !== resolution.sourceVoteRoundId
      ) {
        issues.push(`决议 ${resolution.id} 的事件来源关联不完整`);
      }
      if (resolution.status === ResolutionStatus.SUPERSEDED) {
        const superseded = decision.events.find(
          (event) =>
            event.resolutionId === resolution.id &&
            event.type === DecisionEventType.RESOLUTION_SUPERSEDED,
        );
        if (!superseded) issues.push(`决议 ${resolution.id} 缺少被替代事件`);
      }
    }
  }
  return issues;
}

/** 创建投票选票与选择关系，支持匿名轮次仍保留防重复所需 voterId。 */
async function createBallots(
  transaction: Prisma.TransactionClient,
  input: {
    roundId: number;
    votes: Array<{
      voterId: number;
      optionId: number;
      submittedAt: Date;
      reason?: string;
    }>;
  },
): Promise<void> {
  await transaction.decisionBallot.createMany({
    data: input.votes.map((vote) => ({
      roundId: input.roundId,
      voterId: vote.voterId,
      reason: vote.reason,
      submittedAt: vote.submittedAt,
      createdAt: vote.submittedAt,
      updatedAt: vote.submittedAt,
    })),
  });
  const ballots = await transaction.decisionBallot.findMany({
    where: { roundId: input.roundId },
    select: { id: true, voterId: true },
  });
  const ballotByVoter = new Map(
    ballots.map((ballot) => [ballot.voterId, ballot.id]),
  );

  await transaction.decisionBallotChoice.createMany({
    data: input.votes.map((vote) => {
      const ballotId = ballotByVoter.get(vote.voterId);
      if (!ballotId) {
        throw new Error(`投票用户 ${vote.voterId} 的选票创建失败。`);
      }

      return {
        roundId: input.roundId,
        ballotId,
        optionId: vote.optionId,
        createdAt: vote.submittedAt,
      };
    }),
  });
}

/** 把旧演示轮次转换为当前业务接口使用的“赞成、反对、弃权”单提案表决。 */
async function repairDemoVoteOptions(
  transaction: Prisma.TransactionClient,
  input: {
    roundId: number;
    proposalId: number;
    legacyCodeMap: Record<string, 'APPROVE' | 'REJECT' | 'ABSTAIN'>;
  },
): Promise<void> {
  const currentOptions = await transaction.decisionVoteOption.findMany({
    where: { roundId: input.roundId },
    select: { code: true, proposalId: true },
    orderBy: { sortOrder: 'asc' },
  });
  const isAlreadyStandard =
    currentOptions.length === 3 &&
    currentOptions[0]?.code === 'APPROVE' &&
    currentOptions[0].proposalId === input.proposalId &&
    currentOptions[1]?.code === 'REJECT' &&
    currentOptions[1].proposalId === null &&
    currentOptions[2]?.code === 'ABSTAIN' &&
    currentOptions[2].proposalId === null;
  if (isAlreadyStandard) return;

  const ballots = await transaction.decisionBallot.findMany({
    where: { roundId: input.roundId },
    select: {
      id: true,
      choices: { select: { option: { select: { code: true } } } },
    },
  });
  const choiceCodeByBallot = new Map(
    ballots.map((ballot) => {
      const currentCode = ballot.choices[0]?.option.code ?? 'ABSTAIN';
      return [
        ballot.id,
        input.legacyCodeMap[currentCode] ??
          (currentCode === 'APPROVE' ||
          currentCode === 'REJECT' ||
          currentCode === 'ABSTAIN'
            ? currentCode
            : 'ABSTAIN'),
      ] as const;
    }),
  );

  await transaction.decisionBallotChoice.deleteMany({
    where: { roundId: input.roundId },
  });
  await transaction.decisionVoteOption.deleteMany({
    where: { roundId: input.roundId },
  });
  await transaction.decisionVoteOption.createMany({
    data: [
      {
        roundId: input.roundId,
        proposalId: input.proposalId,
        code: 'APPROVE',
        label: '赞成',
        sortOrder: 1,
      },
      { roundId: input.roundId, code: 'REJECT', label: '反对', sortOrder: 2 },
      { roundId: input.roundId, code: 'ABSTAIN', label: '弃权', sortOrder: 3 },
    ],
  });
  const repairedOptions = await transaction.decisionVoteOption.findMany({
    where: { roundId: input.roundId },
    select: { id: true, code: true },
  });
  const optionByCode = new Map(
    repairedOptions.map((option) => [option.code, option.id]),
  );
  await transaction.decisionBallotChoice.createMany({
    data: ballots.map((ballot) => {
      const code = choiceCodeByBallot.get(ballot.id) ?? 'ABSTAIN';
      const optionId = optionByCode.get(code);
      if (!optionId)
        throw new Error(
          `修复投票轮次 ${input.roundId} 时未找到 ${code} 选项。`,
        );
      return {
        roundId: input.roundId,
        ballotId: ballot.id,
        optionId,
        createdAt: at('2026-08-20T16:40:00'),
      };
    }),
  });
}

/** 新增或覆盖一个演示决策事件，保证修复命令可重复执行。 */
async function upsertDemoEvent(
  transaction: Prisma.TransactionClient,
  input: Prisma.DecisionEventUncheckedCreateInput,
): Promise<void> {
  const existing = await transaction.decisionEvent.findFirst({
    where: {
      decisionId: input.decisionId,
      type: input.type,
      proposalId: input.proposalId ?? null,
      voteRoundId: input.voteRoundId ?? null,
      resolutionId: input.resolutionId ?? null,
      title: input.title,
    },
    select: { id: true },
  });
  if (existing) {
    await transaction.decisionEvent.update({
      where: { id: existing.id },
      data: input,
    });
    return;
  }
  await transaction.decisionEvent.create({ data: input });
}

/** 修复已存在的 v1 演示项目，使其事件证据与当前真实业务接口保持一致。 */
async function repairExistingDemo(
  prisma: PrismaClient,
  projectId: number,
): Promise<void> {
  await prisma.$transaction(
    async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { id: projectId },
        select: {
          decisions: {
            select: {
              id: true,
              areaId: true,
              proposals: true,
              voteRounds: true,
              resolutions: true,
            },
          },
        },
      });
      if (!project) throw new Error(`待修复演示项目 ${projectId} 不存在。`);
      const projectDecision = project.decisions.find(
        (decision) => decision.areaId === null,
      );
      const groupDecision = project.decisions.find(
        (decision) => decision.areaId !== null,
      );
      if (!projectDecision || !groupDecision)
        throw new Error('演示项目缺少项目级或小组级决策。');

      const staged = projectDecision.proposals.find((proposal) =>
        proposal.title.startsWith('双轨运行七天'),
      );
      const full = projectDecision.proposals.find((proposal) =>
        proposal.title.startsWith('通过压测后'),
      );
      const observe = projectDecision.proposals.find((proposal) =>
        proposal.title.startsWith('延后上线'),
      );
      const projectVote = projectDecision.voteRounds.find(
        (round) => round.isAnonymous,
      );
      const interim = projectDecision.resolutions.find(
        (resolution) => resolution.kind === ResolutionKind.INTERIM,
      );
      const final = projectDecision.resolutions.find(
        (resolution) => resolution.kind === ResolutionKind.FINAL,
      );
      const safe = groupDecision.proposals.find((proposal) =>
        proposal.title.startsWith('分批回填'),
      );
      const fast = groupDecision.proposals.find((proposal) =>
        proposal.title.startsWith('一次性全量回填'),
      );
      const groupVote = groupDecision.voteRounds[0];
      const groupResolution = groupDecision.resolutions[0];
      if (!staged || !full || !observe || !projectVote || !interim || !final) {
        throw new Error('项目级演示决策实体不完整，已停止修复。');
      }
      if (!safe || !fast || !groupVote || !groupResolution) {
        throw new Error('小组级演示决策实体不完整，已停止修复。');
      }

      await repairDemoVoteOptions(transaction, {
        roundId: projectVote.id,
        proposalId: staged.id,
        legacyCodeMap: {
          STAGED_DUAL_RUN: 'APPROVE',
          FULL_SWITCH: 'REJECT',
          OBSERVE_TWO_WEEKS: 'ABSTAIN',
        },
      });
      await repairDemoVoteOptions(transaction, {
        roundId: groupVote.id,
        proposalId: safe.id,
        legacyCodeMap: { BATCHED_SAFE: 'APPROVE', FULL_MANUAL: 'REJECT' },
      });
      await transaction.decisionVoteRound.update({
        where: { id: projectVote.id },
        data: {
          title: `是否采纳「${staged.title}」`,
          description:
            '项目成员匿名单选；至少 6 人参与。只公开汇总结果，不展示个人选择。',
        },
      });
      await transaction.decisionVoteRound.update({
        where: { id: groupVote.id },
        data: {
          title: `是否采纳「${safe.title}」`,
          description: '小组内实名单选，三名成员全部参与即满足法定人数。',
        },
      });

      for (const proposal of [
        ...projectDecision.proposals,
        ...groupDecision.proposals,
      ]) {
        const createdEvent = await transaction.decisionEvent.findFirst({
          where: {
            proposalId: proposal.id,
            type: DecisionEventType.PROPOSAL_CREATED,
          },
          select: { id: true },
        });
        if (!createdEvent)
          throw new Error(`提案 ${proposal.id} 缺少创建事件。`);
        await transaction.decisionEvent.update({
          where: { id: createdEvent.id },
          data: {
            title: '创建提案',
            payload: { proposalId: proposal.id },
            after: {
              title: proposal.title,
              description: proposal.description,
              status: ProposalStatus.OPEN,
            },
          },
        });
      }

      /** 让指定轮次的事件字段与正常创建、开启和关闭接口保持一致。 */
      const repairVoteEvents = async (
        roundId: number,
        proposalId: number,
        totalBallots: number,
        quorumCount: number,
        approveCount: number,
        rejectCount: number,
        abstainCount: number,
      ): Promise<void> => {
        await transaction.decisionEvent.updateMany({
          where: { voteRoundId: roundId },
          data: { proposalId },
        });
        const created = await transaction.decisionEvent.findFirst({
          where: {
            voteRoundId: roundId,
            type: DecisionEventType.VOTE_ROUND_CREATED,
          },
          select: { id: true },
        });
        const opened = await transaction.decisionEvent.findFirst({
          where: {
            voteRoundId: roundId,
            type: DecisionEventType.VOTE_ROUND_OPENED,
          },
          select: { id: true, occurredAt: true },
        });
        const closed = await transaction.decisionEvent.findFirst({
          where: {
            voteRoundId: roundId,
            type: DecisionEventType.VOTE_ROUND_CLOSED,
          },
          select: { id: true, occurredAt: true },
        });
        if (!created || !opened || !closed)
          throw new Error(`投票轮次 ${roundId} 的事件不完整。`);
        await transaction.decisionEvent.update({
          where: { id: created.id },
          data: {
            title: '创建投票轮次',
            payload: { proposalId, voteRoundId: roundId },
            after: {
              method: VoteMethod.SINGLE_CHOICE,
              isAnonymous: roundId === projectVote.id,
              quorumCount,
            },
          },
        });
        await transaction.decisionEvent.update({
          where: { id: opened.id },
          data: {
            title: '开启投票',
            payload: Prisma.DbNull,
            after: {
              status: VoteRoundStatus.OPEN,
              openedAt: opened.occurredAt.toISOString(),
            },
          },
        });
        await transaction.decisionEvent.update({
          where: { id: closed.id },
          data: {
            title: '关闭投票',
            payload: {
              result: {
                totalBallots,
                quorumCount,
                quorumMet: totalBallots >= quorumCount,
                outcome: 'APPROVED',
              },
              options: [
                { code: 'APPROVE', label: '赞成', voteCount: approveCount },
                { code: 'REJECT', label: '反对', voteCount: rejectCount },
                { code: 'ABSTAIN', label: '弃权', voteCount: abstainCount },
              ],
            },
            before: { status: VoteRoundStatus.OPEN },
            after: {
              status: VoteRoundStatus.CLOSED,
              closedAt: closed.occurredAt.toISOString(),
            },
          },
        });
      };
      await repairVoteEvents(projectVote.id, staged.id, 8, 6, 5, 2, 1);
      await repairVoteEvents(groupVote.id, safe.id, 3, 3, 2, 1, 0);

      /** 补全一份决议事件的来源关联和安全快照。 */
      const repairResolutionEvent = async (
        resolution: typeof final,
        proposalId: number,
        voteRoundId: number | null,
      ): Promise<void> => {
        const event = await transaction.decisionEvent.findFirst({
          where: {
            resolutionId: resolution.id,
            type: DecisionEventType.RESOLUTION_CREATED,
          },
          select: { id: true },
        });
        if (!event) throw new Error(`决议 ${resolution.id} 缺少形成事件。`);
        await transaction.decisionEvent.update({
          where: { id: event.id },
          data: {
            proposalId,
            voteRoundId,
            payload: {
              sourceProposalId: proposalId,
              sourceVoteRoundId: voteRoundId,
            },
            after: {
              title: resolution.title,
              content: resolution.content,
              kind: resolution.kind,
              status:
                resolution.kind === ResolutionKind.INTERIM
                  ? ResolutionStatus.ACTIVE
                  : resolution.status,
            },
          },
        });
      };
      await repairResolutionEvent(interim, staged.id, null);
      await repairResolutionEvent(final, staged.id, projectVote.id);
      await repairResolutionEvent(groupResolution, safe.id, groupVote.id);

      /** 幂等补充提案最终被采纳或未采纳的状态事件。 */
      const ensureProposalStatus = async (
        decisionId: number,
        proposalId: number,
        actorId: number,
        status: ProposalStatus,
        occurredAt: Date,
      ): Promise<void> => {
        await upsertDemoEvent(transaction, {
          decisionId,
          actorId,
          proposalId,
          type: DecisionEventType.PROPOSAL_UPDATED,
          title: status === ProposalStatus.ACCEPTED ? '采纳提案' : '未采纳提案',
          before: { status: ProposalStatus.OPEN },
          after: {
            status,
            ...(status === ProposalStatus.ACCEPTED
              ? { acceptedAt: occurredAt.toISOString() }
              : { closedAt: occurredAt.toISOString() }),
          },
          occurredAt,
        });
      };
      await ensureProposalStatus(
        projectDecision.id,
        staged.id,
        final.decidedById,
        ProposalStatus.ACCEPTED,
        at('2026-08-20T16:39:00'),
      );
      await ensureProposalStatus(
        projectDecision.id,
        full.id,
        final.decidedById,
        ProposalStatus.REJECTED,
        at('2026-08-20T16:39:00'),
      );
      await ensureProposalStatus(
        projectDecision.id,
        observe.id,
        final.decidedById,
        ProposalStatus.REJECTED,
        at('2026-08-20T16:39:00'),
      );
      await ensureProposalStatus(
        groupDecision.id,
        safe.id,
        groupResolution.decidedById,
        ProposalStatus.ACCEPTED,
        at('2026-08-14T11:19:00'),
      );
      await ensureProposalStatus(
        groupDecision.id,
        fast.id,
        groupResolution.decidedById,
        ProposalStatus.REJECTED,
        at('2026-08-14T11:19:00'),
      );
      await upsertDemoEvent(transaction, {
        decisionId: projectDecision.id,
        actorId: final.decidedById,
        resolutionId: interim.id,
        type: DecisionEventType.RESOLUTION_SUPERSEDED,
        title: '阶段性决议已被最终决议替代',
        before: { status: ResolutionStatus.ACTIVE },
        after: {
          status: ResolutionStatus.SUPERSEDED,
          supersededById: final.id,
        },
        occurredAt: final.decidedAt,
      });
    },
    { timeout: 30_000 },
  );
}

/** 创建完整、可回放且符合当前产品边界的真实协作案例。 */
async function seedDemoData(
  prisma: PrismaClient,
  members: Map<DemoDepartmentCode, DemoMember>,
): Promise<DemoSeedResult> {
  return prisma.$transaction(
    async (transaction) => {
      const duplicate = await transaction.project.findFirst({
        where: { description: { contains: DEMO_MARKER } },
        select: { id: true },
      });
      if (duplicate) {
        throw new Error(`演示项目已经存在，项目 ID：${duplicate.id}`);
      }

      const product = memberOf(members, 'riskproduct');
      const strategy = memberOf(members, 'strategyplatform');
      const algorithm = memberOf(members, 'riskalgorithm');
      const riskQa = memberOf(members, 'riskqa');
      const riskBackend = memberOf(members, 'riskbackend');
      const dataBackend = memberOf(members, 'datatechbackend');
      const dataQa = memberOf(members, 'datatechqa');
      const dataLead = memberOf(members, 'datatech');
      const allMemberIds = [
        product.userId,
        strategy.userId,
        algorithm.userId,
        riskQa.userId,
        riskBackend.userId,
        dataBackend.userId,
        dataQa.userId,
        dataLead.userId,
      ];

      const project = await transaction.project.create({
        data: {
          title: '实时风险预警平台 V2 上线评审',
          description:
            `${DEMO_MARKER}\n` +
            '目标是在不影响现网风控稳定性的前提下，将批量风险识别升级为准实时预警，并完整记录跨部门方案讨论、投票和决议形成过程。',
          status: ProjectStatus.ACTIVE,
          createdById: product.userId,
          ownerId: product.userId,
          deptId: product.departmentId,
          createdAt: at('2026-08-12T09:00:00'),
          updatedAt: at('2026-08-20T17:30:00'),
        },
      });

      await transaction.projectMember.createMany({
        data: allMemberIds.map((userId) => ({
          projectId: project.id,
          userId,
          role:
            userId === product.userId
              ? ProjectMemberRole.OWNER
              : userId === dataLead.userId
                ? ProjectMemberRole.MANAGER
                : ProjectMemberRole.MEMBER,
          createdAt: at('2026-08-12T09:05:00'),
          updatedAt: at('2026-08-12T09:05:00'),
        })),
      });

      const publicArea = await transaction.discussionArea.create({
        data: {
          projectId: project.id,
          createdById: product.userId,
          name: '项目大厅',
          description: '跨部门同步项目背景、关键风险、会议结论和项目级决策。',
          type: DiscussionAreaType.PUBLIC,
          status: DiscussionAreaStatus.ACTIVE,
          publicKey: 'PUBLIC',
          createdAt: at('2026-08-12T09:10:00'),
          updatedAt: at('2026-08-20T17:30:00'),
        },
      });

      const privateAreaDefinitions: Array<{
        key: string;
        name: string;
        description: string;
        creatorId: number;
        memberIds: number[];
      }> = [
        {
          key: 'product',
          name: `${product.departmentName}分区`,
          description: '整理业务目标、验收口径、范围边界和跨部门依赖。',
          creatorId: product.userId,
          memberIds: [product.userId],
        },
        {
          key: 'strategy',
          name: `${strategy.departmentName}分区`,
          description: '讨论风险策略配置、灰度规则和人工复核口径。',
          creatorId: strategy.userId,
          memberIds: [strategy.userId],
        },
        {
          key: 'algorithm',
          name: `${algorithm.departmentName}分区`,
          description: '评估特征稳定性、模型阈值和误报风险。',
          creatorId: algorithm.userId,
          memberIds: [algorithm.userId],
        },
        {
          key: 'backend',
          name: `${riskBackend.departmentName}分区`,
          description: '讨论实时链路、双写切流、熔断和回滚实现。',
          creatorId: riskBackend.userId,
          memberIds: [riskBackend.userId],
        },
        {
          key: 'risk-qa',
          name: `${riskQa.departmentName}分区`,
          description: '维护压测、回归、故障演练和上线门禁。',
          creatorId: riskQa.userId,
          memberIds: [riskQa.userId],
        },
        {
          key: 'data-tech',
          name: `${dataLead.departmentName}协同分区`,
          description:
            '由数据技术部及下属后端、测试成员讨论回填窗口与降级策略。',
          creatorId: dataLead.userId,
          memberIds: [dataLead.userId, dataBackend.userId, dataQa.userId],
        },
      ];
      const privateAreas = new Map<string, number>();

      for (const definition of privateAreaDefinitions) {
        const area = await transaction.discussionArea.create({
          data: {
            projectId: project.id,
            createdById: definition.creatorId,
            name: definition.name,
            description: definition.description,
            type: DiscussionAreaType.PRIVATE,
            status: DiscussionAreaStatus.ACTIVE,
            createdAt: at('2026-08-12T09:15:00'),
            updatedAt: at('2026-08-20T17:30:00'),
          },
        });
        privateAreas.set(definition.key, area.id);
        await transaction.discussionAreaMember.createMany({
          data: definition.memberIds.map((userId) => ({
            areaId: area.id,
            userId,
            role:
              userId === definition.creatorId
                ? DiscussionAreaMemberRole.MANAGER
                : DiscussionAreaMemberRole.MEMBER,
            createdAt: at('2026-08-12T09:16:00'),
            updatedAt: at('2026-08-12T09:16:00'),
          })),
        });
      }

      const dataAreaId = privateAreas.get('data-tech');
      if (!dataAreaId) {
        throw new Error('数据技术部协同分区创建失败。');
      }

      const projectDecision = await transaction.decision.create({
        data: {
          title: '实时风险预警平台 V2 是否按双轨灰度方案上线',
          description:
            '决定是否在保留现网批处理链路的同时，上线准实时预警链路，并明确灰度范围、回滚门槛和正式切流条件。',
          status: DecisionStatus.RESOLVED,
          projectId: project.id,
          creatorId: product.userId,
          ownerId: product.userId,
          deptId: product.departmentId,
          decidedAt: at('2026-08-20T16:40:00'),
          createdAt: at('2026-08-12T11:00:00'),
          updatedAt: at('2026-08-20T16:40:00'),
        },
      });
      await transaction.decisionParticipant.createMany({
        data: allMemberIds.map((userId) => ({
          decisionId: projectDecision.id,
          userId,
          role:
            userId === product.userId
              ? ParticipantRole.OWNER
              : [
                    strategy.userId,
                    algorithm.userId,
                    riskBackend.userId,
                  ].includes(userId)
                ? ParticipantRole.EDITOR
                : ParticipantRole.APPROVER,
          createdAt: at('2026-08-12T11:00:00'),
          updatedAt: at('2026-08-12T11:00:00'),
        })),
      });

      const groupDecision = await transaction.decision.create({
        data: {
          title: '历史风险特征回填窗口与故障降级策略',
          description:
            '数据技术部小组决定历史特征回填的执行窗口、最大积压水位，以及实时链路异常时的降级顺序。',
          status: DecisionStatus.RESOLVED,
          projectId: project.id,
          areaId: dataAreaId,
          creatorId: dataLead.userId,
          ownerId: dataLead.userId,
          deptId: dataLead.departmentId,
          decidedAt: at('2026-08-14T11:20:00'),
          createdAt: at('2026-08-13T09:20:00'),
          updatedAt: at('2026-08-14T11:20:00'),
        },
      });
      await transaction.decisionParticipant.createMany({
        data: [
          {
            decisionId: groupDecision.id,
            userId: dataLead.userId,
            role: ParticipantRole.OWNER,
          },
          {
            decisionId: groupDecision.id,
            userId: dataBackend.userId,
            role: ParticipantRole.EDITOR,
          },
          {
            decisionId: groupDecision.id,
            userId: dataQa.userId,
            role: ParticipantRole.APPROVER,
          },
        ],
      });

      const groupMessages = [
        {
          authorId: dataLead.userId,
          content:
            '过去三个月风险特征平均回填需要 96 分钟，峰值会占用线上集群约 38% 的吞吐。我们需要先确定安全窗口和积压上限。',
          createdAt: at('2026-08-13T09:25:00'),
        },
        {
          authorId: dataBackend.userId,
          content:
            '建议每天 01:00—04:00 分批回填，每批 200 万条；积压超过 1200 万条时暂停非核心特征，优先保证欺诈标签。',
          createdAt: at('2026-08-13T09:34:00'),
        },
        {
          authorId: dataQa.userId,
          content:
            '需要补充失败恢复条件：连续两批错误率超过 1% 就自动停止，并保留已完成分片，避免整批重跑。',
          createdAt: at('2026-08-13T09:42:00'),
        },
      ];
      await transaction.discussionMessage.createMany({
        data: groupMessages.map((message) => ({
          areaId: dataAreaId,
          decisionId: groupDecision.id,
          type: DiscussionMessageType.TEXT,
          ...message,
          updatedAt: message.createdAt,
        })),
      });

      const quickCall = await transaction.meetingSession.create({
        data: {
          areaId: dataAreaId,
          createdById: dataLead.userId,
          title: '数据回填窗口快速对齐',
          description: '因回填压测出现存储抖动，临时拉起音频通话确认降级顺序。',
          status: MeetingStatus.ENDED,
          kind: MeetingKind.QUICK_CALL,
          mediaMode: MeetingMediaMode.AUDIO,
          roomKey: 'demo-risk-v2-data-quick-call',
          provider: 'livekit',
          providerRoomId: 'demo-risk-v2-data-quick-call',
          ringExpiresAt: at('2026-08-13T10:22:00'),
          startedAt: at('2026-08-13T10:20:00'),
          endedAt: at('2026-08-13T10:37:00'),
          createdAt: at('2026-08-13T10:20:00'),
          updatedAt: at('2026-08-13T10:37:00'),
          decisionLinks: {
            create: { decisionId: groupDecision.id },
          },
          participants: {
            create: [
              {
                userId: dataLead.userId,
                role: MeetingParticipantRole.HOST,
                invitationStatus: MeetingInvitationStatus.ACCEPTED,
                respondedAt: at('2026-08-13T10:20:00'),
                joinedAt: at('2026-08-13T10:20:00'),
                leftAt: at('2026-08-13T10:37:00'),
              },
              {
                userId: dataBackend.userId,
                role: MeetingParticipantRole.ATTENDEE,
                invitationStatus: MeetingInvitationStatus.ACCEPTED,
                respondedAt: at('2026-08-13T10:20:30'),
                joinedAt: at('2026-08-13T10:21:00'),
                leftAt: at('2026-08-13T10:36:00'),
              },
              {
                userId: dataQa.userId,
                role: MeetingParticipantRole.ATTENDEE,
                invitationStatus: MeetingInvitationStatus.ACCEPTED,
                respondedAt: at('2026-08-13T10:21:00'),
                joinedAt: at('2026-08-13T10:21:20'),
                leftAt: at('2026-08-13T10:37:00'),
              },
            ],
          },
        },
      });
      await transaction.meetingPresenceEvent.createMany({
        data: [
          [dataLead.userId, MeetingPresenceEventType.JOINED, '10:20:00'],
          [dataBackend.userId, MeetingPresenceEventType.JOINED, '10:21:00'],
          [dataQa.userId, MeetingPresenceEventType.JOINED, '10:21:20'],
          [dataBackend.userId, MeetingPresenceEventType.LEFT, '10:36:00'],
          [dataLead.userId, MeetingPresenceEventType.LEFT, '10:37:00'],
          [dataQa.userId, MeetingPresenceEventType.LEFT, '10:37:00'],
        ].map(([userId, type, time], index) => ({
          meetingId: quickCall.id,
          userId: userId as number,
          type: type as MeetingPresenceEventType,
          providerEventId: `demo-risk-v2-quick-${index + 1}`,
          occurredAt: at(`2026-08-13T${time as string}`),
        })),
      });
      await transaction.discussionMessage.createMany({
        data: [
          {
            areaId: dataAreaId,
            meetingId: quickCall.id,
            decisionId: groupDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '快速通话已开始：数据回填窗口快速对齐',
            createdAt: at('2026-08-13T10:20:00'),
            updatedAt: at('2026-08-13T10:20:00'),
          },
          {
            areaId: dataAreaId,
            authorId: dataBackend.userId,
            meetingId: quickCall.id,
            decisionId: groupDecision.id,
            type: DiscussionMessageType.TEXT,
            content:
              '通话结论：先将回填并发从 12 降到 8，核心特征独立队列；线上延迟连续 5 分钟超过 800ms 时立即暂停回填。',
            createdAt: at('2026-08-13T10:35:00'),
            updatedAt: at('2026-08-13T10:35:00'),
          },
          {
            areaId: dataAreaId,
            meetingId: quickCall.id,
            decisionId: groupDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '快速通话已结束，持续 17 分钟。',
            createdAt: at('2026-08-13T10:37:00'),
            updatedAt: at('2026-08-13T10:37:00'),
          },
        ],
      });

      const groupProposalSafe = await transaction.decisionProposal.create({
        data: {
          decisionId: groupDecision.id,
          creatorId: dataBackend.userId,
          meetingId: quickCall.id,
          title: '分批回填并设置双阈值自动暂停',
          description:
            '每日 01:00—04:00 以 8 并发分批回填；错误率超过 1% 或线上延迟连续 5 分钟超过 800ms 时自动暂停。',
          status: ProposalStatus.ACCEPTED,
          acceptedAt: at('2026-08-14T11:20:00'),
          closedAt: at('2026-08-14T11:20:00'),
          createdAt: at('2026-08-13T10:40:00'),
          updatedAt: at('2026-08-14T11:20:00'),
        },
      });
      const groupProposalFast = await transaction.decisionProposal.create({
        data: {
          decisionId: groupDecision.id,
          creatorId: dataLead.userId,
          title: '一次性全量回填并人工值守',
          description: '周末一次性全量回填，以人工值守处理异常。',
          status: ProposalStatus.REJECTED,
          closedAt: at('2026-08-14T11:20:00'),
          createdAt: at('2026-08-13T11:00:00'),
          updatedAt: at('2026-08-14T11:20:00'),
        },
      });
      const groupVote = await transaction.decisionVoteRound.create({
        data: {
          decisionId: groupDecision.id,
          creatorId: dataLead.userId,
          title: '数据回填与降级方案实名表决',
          description: '小组内实名单选，三名成员全部参与即满足法定人数。',
          method: VoteMethod.SINGLE_CHOICE,
          status: VoteRoundStatus.CLOSED,
          isAnonymous: false,
          quorumCount: 3,
          maxChoices: 1,
          openedAt: at('2026-08-14T09:30:00'),
          closedAt: at('2026-08-14T11:00:00'),
          createdAt: at('2026-08-14T09:25:00'),
          updatedAt: at('2026-08-14T11:00:00'),
        },
      });
      const groupOptions = await Promise.all([
        transaction.decisionVoteOption.create({
          data: {
            roundId: groupVote.id,
            proposalId: groupProposalSafe.id,
            code: 'APPROVE',
            label: '赞成',
            sortOrder: 1,
          },
        }),
        transaction.decisionVoteOption.create({
          data: {
            roundId: groupVote.id,
            code: 'REJECT',
            label: '反对',
            sortOrder: 2,
          },
        }),
        transaction.decisionVoteOption.create({
          data: {
            roundId: groupVote.id,
            code: 'ABSTAIN',
            label: '弃权',
            sortOrder: 3,
          },
        }),
      ]);
      await createBallots(transaction, {
        roundId: groupVote.id,
        votes: [
          {
            voterId: dataLead.userId,
            optionId: groupOptions[0].id,
            submittedAt: at('2026-08-14T09:40:00'),
            reason: '自动暂停条件可以降低夜间值守风险。',
          },
          {
            voterId: dataBackend.userId,
            optionId: groupOptions[0].id,
            submittedAt: at('2026-08-14T10:05:00'),
            reason: '与现有分片恢复机制兼容。',
          },
          {
            voterId: dataQa.userId,
            optionId: groupOptions[1].id,
            submittedAt: at('2026-08-14T10:30:00'),
            reason: '一次性执行更容易集中验证，但需要更充分演练。',
          },
        ],
      });
      const groupResolution = await transaction.decisionResolution.create({
        data: {
          decisionId: groupDecision.id,
          sourceProposalId: groupProposalSafe.id,
          sourceVoteRoundId: groupVote.id,
          meetingId: quickCall.id,
          decidedById: dataLead.userId,
          title: '采用分批回填与自动降级方案',
          content:
            '历史风险特征每日 01:00—04:00 以 8 并发分批回填；错误率超过 1% 或线上延迟连续 5 分钟超过 800ms 时自动暂停。核心欺诈特征使用独立队列，恢复时从已完成分片继续。',
          kind: ResolutionKind.FINAL,
          status: ResolutionStatus.ACTIVE,
          decidedAt: at('2026-08-14T11:20:00'),
          createdAt: at('2026-08-14T11:20:00'),
          updatedAt: at('2026-08-14T11:20:00'),
        },
      });

      const publicMessages = [
        [
          product.userId,
          '项目目标不是一次性替换现网，而是把风险发现时延从 T+1 缩短到 5 分钟以内；上线必须同时满足可观测、可回滚和不增加人工误报负担。',
          '2026-08-12T09:30:00',
        ],
        [
          strategy.userId,
          '当前批处理规则平均 9 分钟才能进入人工复核，高峰期会超过 15 分钟。策略侧希望先覆盖盗刷和批量注册两类高风险场景。',
          '2026-08-12T09:42:00',
        ],
        [
          algorithm.userId,
          '离线回放显示新链路召回率提升 6.8%，但低活跃用户段误报率增加 0.7 个百分点，不能直接全量。',
          '2026-08-12T09:55:00',
        ],
        [
          riskBackend.userId,
          '后端可以保留旧链路并双写七天，按租户灰度。新链路异常时 30 秒内切回旧链路，不需要停止事件接入。',
          '2026-08-12T10:08:00',
        ],
        [
          riskQa.userId,
          '上线门禁建议包括：峰值 1.5 倍压测、两次故障演练、灰度租户零漏单，并验证回滚后不重复生成案件。',
          '2026-08-12T10:16:00',
        ],
        [
          dataLead.userId,
          '数据链路可提供 5 分钟窗口聚合，但历史特征回填会和线上争抢吞吐，小组会先独立形成回填与降级决策。',
          '2026-08-12T10:25:00',
        ],
        [
          product.userId,
          '已创建项目级决策，所有成员均为参与人。请各组在正式评审会前提交方案和不能接受的风险边界。',
          '2026-08-12T11:05:00',
        ],
      ] as const;
      await transaction.discussionMessage.createMany({
        data: publicMessages.map(([authorId, content, time]) => ({
          areaId: publicArea.id,
          authorId,
          decisionId: projectDecision.id,
          type: DiscussionMessageType.TEXT,
          content,
          createdAt: at(time),
          updatedAt: at(time),
        })),
      });

      const projectMeeting = await transaction.meetingSession.create({
        data: {
          areaId: publicArea.id,
          createdById: product.userId,
          title: '实时风险预警 V2 上线方案评审会',
          description:
            '评审业务收益、技术风险、灰度范围和上线门禁，并形成阶段性决议。',
          status: MeetingStatus.ENDED,
          kind: MeetingKind.APPOINTMENT,
          mediaMode: MeetingMediaMode.VIDEO,
          roomKey: 'demo-risk-v2-project-review',
          provider: 'livekit',
          providerRoomId: 'demo-risk-v2-project-review',
          scheduledAt: at('2026-08-15T14:00:00'),
          scheduledDurationMinutes: 60,
          startedAt: at('2026-08-15T14:02:00'),
          endedAt: at('2026-08-15T15:01:00'),
          createdAt: at('2026-08-13T16:00:00'),
          updatedAt: at('2026-08-15T15:01:00'),
          decisionLinks: {
            create: { decisionId: projectDecision.id },
          },
          participants: {
            create: allMemberIds.map((userId) => ({
              userId,
              role:
                userId === product.userId
                  ? MeetingParticipantRole.HOST
                  : userId === dataLead.userId
                    ? MeetingParticipantRole.CO_HOST
                    : MeetingParticipantRole.ATTENDEE,
              invitationStatus: MeetingInvitationStatus.ACCEPTED,
              respondedAt: at('2026-08-14T12:00:00'),
              joinedAt: at(
                userId === product.userId
                  ? '2026-08-15T14:01:00'
                  : '2026-08-15T14:03:00',
              ),
              leftAt: at('2026-08-15T15:01:00'),
            })),
          },
        },
      });
      const projectRecording = await transaction.meetingRecording.create({
        data: {
          meetingId: projectMeeting.id,
          providerAssetId: 'demo-risk-v2-review-recording',
          storageKey: 'demo/meetings/risk-v2-review-20260815.mp4',
          durationMs: 3_540_000,
          status: RecordingStatus.READY,
          startedAt: at('2026-08-15T14:02:00'),
          endedAt: at('2026-08-15T15:01:00'),
          createdAt: at('2026-08-15T14:02:00'),
          updatedAt: at('2026-08-15T15:15:00'),
        },
      });
      await transaction.discussionMessage.createMany({
        data: [
          {
            areaId: publicArea.id,
            meetingId: projectMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '会议已开始：实时风险预警 V2 上线方案评审会',
            createdAt: at('2026-08-15T14:02:00'),
            updatedAt: at('2026-08-15T14:02:00'),
          },
          {
            areaId: publicArea.id,
            authorId: algorithm.userId,
            meetingId: projectMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.TEXT,
            content:
              '会议补充：低活跃用户段先不进入自动处置，只生成观察告警；累计两周样本后再评估阈值。',
            createdAt: at('2026-08-15T14:28:00'),
            updatedAt: at('2026-08-15T14:28:00'),
          },
          {
            areaId: publicArea.id,
            authorId: riskQa.userId,
            meetingId: projectMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.TEXT,
            content:
              '测试确认双写期间可以比对新旧案件，建议将差异率超过 0.5% 作为暂停扩量条件。',
            createdAt: at('2026-08-15T14:41:00'),
            updatedAt: at('2026-08-15T14:41:00'),
          },
          {
            areaId: publicArea.id,
            meetingId: projectMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '会议已结束，录像处理中。',
            createdAt: at('2026-08-15T15:01:00'),
            updatedAt: at('2026-08-15T15:01:00'),
          },
          {
            areaId: publicArea.id,
            meetingId: projectMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '会议录像已就绪，可用于过程回放。',
            createdAt: at('2026-08-15T15:15:00'),
            updatedAt: at('2026-08-15T15:15:00'),
          },
        ],
      });

      const projectProposalStaged = await transaction.decisionProposal.create({
        data: {
          decisionId: projectDecision.id,
          creatorId: riskBackend.userId,
          meetingId: projectMeeting.id,
          title: '双轨运行七天并按租户分三阶段灰度',
          description:
            '保留旧链路并双写七天，先内部测试租户，再 10% 低风险租户，最后扩大到 30%；任何门禁触发即停止扩量并回退。',
          status: ProposalStatus.ACCEPTED,
          acceptedAt: at('2026-08-20T16:40:00'),
          closedAt: at('2026-08-20T16:40:00'),
          createdAt: at('2026-08-15T14:20:00'),
          updatedAt: at('2026-08-20T16:40:00'),
        },
      });
      const projectProposalFull = await transaction.decisionProposal.create({
        data: {
          decisionId: projectDecision.id,
          creatorId: strategy.userId,
          meetingId: projectMeeting.id,
          title: '通过压测后一次性全量切换',
          description:
            '完成压测和回归后一次性切换全部租户，以减少双轨维护成本。',
          status: ProposalStatus.REJECTED,
          closedAt: at('2026-08-20T16:40:00'),
          createdAt: at('2026-08-15T14:31:00'),
          updatedAt: at('2026-08-20T16:40:00'),
        },
      });
      const projectProposalObserve = await transaction.decisionProposal.create({
        data: {
          decisionId: projectDecision.id,
          creatorId: algorithm.userId,
          meetingId: projectMeeting.id,
          title: '延后上线并继续离线观察两周',
          description:
            '暂不上线实时链路，继续积累低活跃用户样本并重新校准阈值。',
          status: ProposalStatus.REJECTED,
          closedAt: at('2026-08-20T16:40:00'),
          createdAt: at('2026-08-15T14:36:00'),
          updatedAt: at('2026-08-20T16:40:00'),
        },
      });
      const interimResolution = await transaction.decisionResolution.create({
        data: {
          decisionId: projectDecision.id,
          sourceProposalId: projectProposalStaged.id,
          meetingId: projectMeeting.id,
          decidedById: product.userId,
          title: '进入双轨灰度准备阶段',
          content:
            '同意以双轨方式进入上线准备；正式扩量前必须完成 1.5 倍峰值压测、两次故障演练和新旧案件差异核对，并通过匿名投票确认最终方案。',
          kind: ResolutionKind.INTERIM,
          status: ResolutionStatus.SUPERSEDED,
          decidedAt: at('2026-08-15T15:00:00'),
          createdAt: at('2026-08-15T15:00:00'),
          updatedAt: at('2026-08-20T16:40:00'),
        },
      });

      const anonymousVote = await transaction.decisionVoteRound.create({
        data: {
          decisionId: projectDecision.id,
          creatorId: product.userId,
          title: '实时风险预警 V2 最终上线方案匿名投票',
          description:
            '项目成员匿名单选；至少 6 人参与。只公开汇总结果，不对外展示个人选择。',
          method: VoteMethod.SINGLE_CHOICE,
          status: VoteRoundStatus.CLOSED,
          isAnonymous: true,
          quorumCount: 6,
          maxChoices: 1,
          openedAt: at('2026-08-17T10:00:00'),
          closedAt: at('2026-08-17T18:00:00'),
          createdAt: at('2026-08-17T09:50:00'),
          updatedAt: at('2026-08-17T18:00:00'),
        },
      });
      const anonymousOptions = await Promise.all([
        transaction.decisionVoteOption.create({
          data: {
            roundId: anonymousVote.id,
            proposalId: projectProposalStaged.id,
            code: 'APPROVE',
            label: '赞成',
            sortOrder: 1,
          },
        }),
        transaction.decisionVoteOption.create({
          data: {
            roundId: anonymousVote.id,
            code: 'REJECT',
            label: '反对',
            sortOrder: 2,
          },
        }),
        transaction.decisionVoteOption.create({
          data: {
            roundId: anonymousVote.id,
            code: 'ABSTAIN',
            label: '弃权',
            sortOrder: 3,
          },
        }),
      ]);
      await createBallots(transaction, {
        roundId: anonymousVote.id,
        votes: allMemberIds.map((voterId, index) => ({
          voterId,
          optionId:
            index < 5
              ? anonymousOptions[0].id
              : index < 7
                ? anonymousOptions[1].id
                : anonymousOptions[2].id,
          submittedAt: at(
            `2026-08-17T${String(10 + index).padStart(2, '0')}:15:00`,
          ),
        })),
      });

      const finalMeeting = await transaction.meetingSession.create({
        data: {
          areaId: publicArea.id,
          createdById: product.userId,
          title: '匿名投票结果确认与最终决议会',
          description: '核对投票法定人数、灰度门禁和回滚条件，形成最终决议。',
          status: MeetingStatus.ENDED,
          kind: MeetingKind.APPOINTMENT,
          mediaMode: MeetingMediaMode.VIDEO,
          roomKey: 'demo-risk-v2-final-resolution',
          provider: 'livekit',
          providerRoomId: 'demo-risk-v2-final-resolution',
          scheduledAt: at('2026-08-20T16:00:00'),
          scheduledDurationMinutes: 45,
          startedAt: at('2026-08-20T16:02:00'),
          endedAt: at('2026-08-20T16:43:00'),
          createdAt: at('2026-08-18T10:00:00'),
          updatedAt: at('2026-08-20T16:43:00'),
          decisionLinks: { create: { decisionId: projectDecision.id } },
          participants: {
            create: allMemberIds.map((userId) => ({
              userId,
              role:
                userId === product.userId
                  ? MeetingParticipantRole.HOST
                  : MeetingParticipantRole.ATTENDEE,
              invitationStatus: MeetingInvitationStatus.ACCEPTED,
              respondedAt: at('2026-08-19T12:00:00'),
              joinedAt: at('2026-08-20T16:02:00'),
              leftAt: at('2026-08-20T16:43:00'),
            })),
          },
        },
      });
      await transaction.discussionMessage.createMany({
        data: [
          {
            areaId: publicArea.id,
            meetingId: finalMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '最终决议会已开始。',
            createdAt: at('2026-08-20T16:02:00'),
            updatedAt: at('2026-08-20T16:02:00'),
          },
          {
            areaId: publicArea.id,
            authorId: product.userId,
            meetingId: finalMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.TEXT,
            content:
              '匿名投票共 8 张有效票：双轨分阶段灰度 5 票、一次性全量切换 2 票、继续观察 1 票，达到法定人数。',
            createdAt: at('2026-08-20T16:10:00'),
            updatedAt: at('2026-08-20T16:10:00'),
          },
          {
            areaId: publicArea.id,
            authorId: riskQa.userId,
            meetingId: finalMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.TEXT,
            content:
              '测试门禁已经全部完成；建议保留差异率 0.5%、错误率 1%、P95 延迟 800ms 三条暂停扩量条件。',
            createdAt: at('2026-08-20T16:24:00'),
            updatedAt: at('2026-08-20T16:24:00'),
          },
          {
            areaId: publicArea.id,
            meetingId: finalMeeting.id,
            decisionId: projectDecision.id,
            type: DiscussionMessageType.SYSTEM,
            content: '最终决议会已结束，决议已生效。',
            createdAt: at('2026-08-20T16:43:00'),
            updatedAt: at('2026-08-20T16:43:00'),
          },
        ],
      });

      const finalResolution = await transaction.decisionResolution.create({
        data: {
          decisionId: projectDecision.id,
          sourceProposalId: projectProposalStaged.id,
          sourceVoteRoundId: anonymousVote.id,
          meetingId: finalMeeting.id,
          decidedById: product.userId,
          supersedesId: interimResolution.id,
          title: '按双轨三阶段灰度方案上线实时风险预警 V2',
          content:
            '采用双轨运行七天的三阶段灰度方案：先内部测试租户，再 10% 低风险租户，最后扩大至 30%。新旧案件差异率超过 0.5%、实时链路错误率超过 1%，或 P95 延迟连续 5 分钟超过 800ms 时立即停止扩量并切回旧链路。低活跃用户段仅生成观察告警，两周后重新评估阈值。',
          kind: ResolutionKind.FINAL,
          status: ResolutionStatus.ACTIVE,
          decidedAt: at('2026-08-20T16:40:00'),
          createdAt: at('2026-08-20T16:40:00'),
          updatedAt: at('2026-08-20T16:40:00'),
        },
      });

      await transaction.decisionEvent.createMany({
        data: [
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            type: DecisionEventType.DECISION_CREATED,
            title: '创建项目级决策',
            payload: { scope: 'PROJECT', participantCount: 8 },
            occurredAt: at('2026-08-12T11:00:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            type: DecisionEventType.STATUS_CHANGED,
            title: '进入讨论阶段',
            before: { status: 'DRAFT' },
            after: { status: 'DISCUSSING' },
            occurredAt: at('2026-08-12T11:01:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: projectMeeting.id,
            type: DecisionEventType.MEETING_STARTED,
            title: '上线方案评审会开始',
            occurredAt: at('2026-08-15T14:02:00'),
          },
          ...[
            projectProposalStaged,
            projectProposalFull,
            projectProposalObserve,
          ].map((proposal) => ({
            decisionId: projectDecision.id,
            actorId: proposal.creatorId,
            meetingId: projectMeeting.id,
            proposalId: proposal.id,
            type: DecisionEventType.PROPOSAL_CREATED,
            title: '创建提案',
            payload: { proposalId: proposal.id },
            after: {
              title: proposal.title,
              description: proposal.description,
              status: ProposalStatus.OPEN,
            },
            occurredAt: proposal.createdAt,
          })),
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: projectMeeting.id,
            type: DecisionEventType.MEETING_ENDED,
            title: '上线方案评审会结束',
            occurredAt: at('2026-08-15T15:01:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: projectMeeting.id,
            proposalId: projectProposalStaged.id,
            resolutionId: interimResolution.id,
            type: DecisionEventType.RESOLUTION_CREATED,
            title: '形成阶段性决议',
            payload: {
              sourceProposalId: projectProposalStaged.id,
              sourceVoteRoundId: null,
            },
            after: {
              title: interimResolution.title,
              content: interimResolution.content,
              kind: interimResolution.kind,
              status: ResolutionStatus.ACTIVE,
            },
            occurredAt: at('2026-08-15T15:00:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            recordingId: projectRecording.id,
            meetingId: projectMeeting.id,
            type: DecisionEventType.RECORDING_READY,
            title: '评审会录像可回放',
            occurredAt: at('2026-08-15T15:15:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            proposalId: projectProposalStaged.id,
            voteRoundId: anonymousVote.id,
            type: DecisionEventType.VOTE_ROUND_CREATED,
            title: '创建投票轮次',
            payload: {
              proposalId: projectProposalStaged.id,
              voteRoundId: anonymousVote.id,
            },
            after: {
              method: anonymousVote.method,
              isAnonymous: true,
              quorumCount: 6,
            },
            occurredAt: at('2026-08-17T09:50:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            proposalId: projectProposalStaged.id,
            voteRoundId: anonymousVote.id,
            type: DecisionEventType.VOTE_ROUND_OPENED,
            title: '开启投票',
            after: {
              status: VoteRoundStatus.OPEN,
              openedAt: at('2026-08-17T10:00:00').toISOString(),
            },
            occurredAt: at('2026-08-17T10:00:00'),
          },
          ...allMemberIds.map((_, index) => ({
            decisionId: projectDecision.id,
            actorId: null,
            proposalId: projectProposalStaged.id,
            voteRoundId: anonymousVote.id,
            type: DecisionEventType.VOTE_CAST,
            title: '匿名参与者已投票',
            payload: { anonymous: true },
            occurredAt: at(
              `2026-08-17T${String(10 + index).padStart(2, '0')}:15:00`,
            ),
          })),
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            proposalId: projectProposalStaged.id,
            voteRoundId: anonymousVote.id,
            type: DecisionEventType.VOTE_ROUND_CLOSED,
            title: '关闭投票',
            payload: {
              result: {
                totalBallots: 8,
                quorumCount: 6,
                quorumMet: true,
                outcome: 'APPROVED',
              },
              options: [
                { code: 'APPROVE', label: '赞成', voteCount: 5 },
                { code: 'REJECT', label: '反对', voteCount: 2 },
                { code: 'ABSTAIN', label: '弃权', voteCount: 1 },
              ],
            },
            before: { status: VoteRoundStatus.OPEN },
            after: {
              status: VoteRoundStatus.CLOSED,
              closedAt: at('2026-08-17T18:00:00').toISOString(),
            },
            occurredAt: at('2026-08-17T18:00:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            type: DecisionEventType.MEETING_STARTED,
            title: '最终决议会开始',
            occurredAt: at('2026-08-20T16:02:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            proposalId: projectProposalStaged.id,
            type: DecisionEventType.PROPOSAL_UPDATED,
            title: '采纳提案',
            before: { status: ProposalStatus.OPEN },
            after: {
              status: ProposalStatus.ACCEPTED,
              acceptedAt: at('2026-08-20T16:40:00').toISOString(),
            },
            occurredAt: at('2026-08-20T16:40:00'),
          },
          ...[projectProposalFull, projectProposalObserve].map((proposal) => ({
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            proposalId: proposal.id,
            type: DecisionEventType.PROPOSAL_UPDATED,
            title: '未采纳提案',
            before: { status: ProposalStatus.OPEN },
            after: {
              status: ProposalStatus.REJECTED,
              closedAt: at('2026-08-20T16:40:00').toISOString(),
            },
            occurredAt: at('2026-08-20T16:40:00'),
          })),
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            resolutionId: interimResolution.id,
            type: DecisionEventType.RESOLUTION_SUPERSEDED,
            title: '阶段性决议已被最终决议替代',
            before: { status: ResolutionStatus.ACTIVE },
            after: {
              status: ResolutionStatus.SUPERSEDED,
              supersededById: finalResolution.id,
            },
            occurredAt: at('2026-08-20T16:40:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            proposalId: projectProposalStaged.id,
            voteRoundId: anonymousVote.id,
            resolutionId: finalResolution.id,
            type: DecisionEventType.RESOLUTION_CREATED,
            title: '形成最终决议',
            payload: {
              sourceProposalId: projectProposalStaged.id,
              sourceVoteRoundId: anonymousVote.id,
              supersedesId: interimResolution.id,
            },
            after: {
              title: finalResolution.title,
              content: finalResolution.content,
              kind: finalResolution.kind,
              status: finalResolution.status,
            },
            occurredAt: at('2026-08-20T16:40:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            type: DecisionEventType.STATUS_CHANGED,
            title: '决策已形成正式决议',
            before: { status: 'DISCUSSING' },
            after: { status: 'RESOLVED' },
            occurredAt: at('2026-08-20T16:40:00'),
          },
          {
            decisionId: projectDecision.id,
            actorId: product.userId,
            meetingId: finalMeeting.id,
            type: DecisionEventType.MEETING_ENDED,
            title: '最终决议会结束',
            occurredAt: at('2026-08-20T16:43:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            type: DecisionEventType.DECISION_CREATED,
            title: '创建数据技术部小组决策',
            payload: { scope: 'AREA', areaId: dataAreaId, participantCount: 3 },
            occurredAt: at('2026-08-13T09:20:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            meetingId: quickCall.id,
            type: DecisionEventType.MEETING_STARTED,
            title: '数据回填快速通话开始',
            occurredAt: at('2026-08-13T10:20:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataBackend.userId,
            meetingId: quickCall.id,
            proposalId: groupProposalSafe.id,
            type: DecisionEventType.PROPOSAL_CREATED,
            title: '创建提案',
            payload: { proposalId: groupProposalSafe.id },
            after: {
              title: groupProposalSafe.title,
              description: groupProposalSafe.description,
              status: ProposalStatus.OPEN,
            },
            occurredAt: groupProposalSafe.createdAt,
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            meetingId: quickCall.id,
            type: DecisionEventType.MEETING_ENDED,
            title: '数据回填快速通话结束',
            occurredAt: at('2026-08-13T10:37:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            proposalId: groupProposalFast.id,
            type: DecisionEventType.PROPOSAL_CREATED,
            title: '创建提案',
            payload: { proposalId: groupProposalFast.id },
            after: {
              title: groupProposalFast.title,
              description: groupProposalFast.description,
              status: ProposalStatus.OPEN,
            },
            occurredAt: groupProposalFast.createdAt,
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            proposalId: groupProposalSafe.id,
            voteRoundId: groupVote.id,
            type: DecisionEventType.VOTE_ROUND_CREATED,
            title: '创建投票轮次',
            payload: {
              proposalId: groupProposalSafe.id,
              voteRoundId: groupVote.id,
            },
            after: {
              method: groupVote.method,
              isAnonymous: false,
              quorumCount: 3,
            },
            occurredAt: at('2026-08-14T09:25:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            proposalId: groupProposalSafe.id,
            voteRoundId: groupVote.id,
            type: DecisionEventType.VOTE_ROUND_OPENED,
            title: '开启投票',
            after: {
              status: VoteRoundStatus.OPEN,
              openedAt: at('2026-08-14T09:30:00').toISOString(),
            },
            occurredAt: at('2026-08-14T09:30:00'),
          },
          ...[
            [dataLead.userId, '2026-08-14T09:40:00'],
            [dataBackend.userId, '2026-08-14T10:05:00'],
            [dataQa.userId, '2026-08-14T10:30:00'],
          ].map(([actorId, time]) => ({
            decisionId: groupDecision.id,
            actorId: actorId as number,
            proposalId: groupProposalSafe.id,
            voteRoundId: groupVote.id,
            type: DecisionEventType.VOTE_CAST,
            title: '参与者已投票',
            payload: { anonymous: false },
            occurredAt: at(time as string),
          })),
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            proposalId: groupProposalSafe.id,
            voteRoundId: groupVote.id,
            type: DecisionEventType.VOTE_ROUND_CLOSED,
            title: '关闭投票',
            payload: {
              result: {
                totalBallots: 3,
                quorumCount: 3,
                quorumMet: true,
                outcome: 'APPROVED',
              },
              options: [
                { code: 'APPROVE', label: '赞成', voteCount: 2 },
                { code: 'REJECT', label: '反对', voteCount: 1 },
              ],
            },
            before: { status: VoteRoundStatus.OPEN },
            after: {
              status: VoteRoundStatus.CLOSED,
              closedAt: at('2026-08-14T11:00:00').toISOString(),
            },
            occurredAt: at('2026-08-14T11:00:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            meetingId: quickCall.id,
            proposalId: groupProposalSafe.id,
            type: DecisionEventType.PROPOSAL_UPDATED,
            title: '采纳提案',
            before: { status: ProposalStatus.OPEN },
            after: {
              status: ProposalStatus.ACCEPTED,
              acceptedAt: at('2026-08-14T11:20:00').toISOString(),
            },
            occurredAt: at('2026-08-14T11:20:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            meetingId: quickCall.id,
            proposalId: groupProposalFast.id,
            type: DecisionEventType.PROPOSAL_UPDATED,
            title: '未采纳提案',
            before: { status: ProposalStatus.OPEN },
            after: {
              status: ProposalStatus.REJECTED,
              closedAt: at('2026-08-14T11:20:00').toISOString(),
            },
            occurredAt: at('2026-08-14T11:20:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            meetingId: quickCall.id,
            proposalId: groupProposalSafe.id,
            voteRoundId: groupVote.id,
            resolutionId: groupResolution.id,
            type: DecisionEventType.RESOLUTION_CREATED,
            title: '形成小组最终决议',
            payload: {
              sourceProposalId: groupProposalSafe.id,
              sourceVoteRoundId: groupVote.id,
            },
            after: {
              title: groupResolution.title,
              content: groupResolution.content,
              kind: groupResolution.kind,
              status: groupResolution.status,
            },
            occurredAt: at('2026-08-14T11:20:00'),
          },
          {
            decisionId: groupDecision.id,
            actorId: dataLead.userId,
            type: DecisionEventType.STATUS_CHANGED,
            title: '小组决策已完成',
            before: { status: 'DISCUSSING' },
            after: { status: 'RESOLVED' },
            occurredAt: at('2026-08-14T11:20:00'),
          },
        ],
      });

      return {
        projectId: project.id,
        projectDecisionId: projectDecision.id,
        groupDecisionId: groupDecision.id,
        projectMeetingId: projectMeeting.id,
        quickCallId: quickCall.id,
      };
    },
    { timeout: 30_000 },
  );
}

/** 执行只读检查或受保护的完整演示数据写入。 */
async function main(): Promise<void> {
  const mode = resolveMode();
  const prisma = createPrismaClient();

  try {
    console.log(`数据库：${describeDatabaseTarget()}`);
    const members = await resolveDemoMembers(prisma);
    console.log(`已核对 ${members.size} 个部门的启用成员。`);
    const existingProjectId = await findExistingDemo(prisma);

    if (existingProjectId) {
      if (mode === 'apply') {
        assertApplyAllowed();
        await repairExistingDemo(prisma, existingProjectId);
        console.log('演示项目已经存在，已幂等核对并修复回放证据链。');
      } else {
        console.log('演示项目已经存在；当前为只读检查模式，未修改数据。');
      }
      printDemoCounts(
        existingProjectId,
        await countDemoData(prisma, existingProjectId),
      );
      const replayIssues = await auditDemoReplayEvidence(
        prisma,
        existingProjectId,
      );
      if (replayIssues.length > 0) {
        throw new Error(`回放证据链检查失败：\n- ${replayIssues.join('\n- ')}`);
      }
      console.log('回放证据链检查通过：标题、状态、投票目标和决议来源均完整。');
      return;
    }

    if (mode === 'check') {
      console.log('演示项目尚未写入；当前为只读检查模式。');
      return;
    }

    assertApplyAllowed();
    const result = await seedDemoData(prisma, members);
    console.log('真实决策协作演示数据已在单个事务中写入。');
    console.table({
      项目ID: result.projectId,
      项目级决策ID: result.projectDecisionId,
      小组级决策ID: result.groupDecisionId,
      项目评审会ID: result.projectMeetingId,
      快速通话ID: result.quickCallId,
    });
    printDemoCounts(
      result.projectId,
      await countDemoData(prisma, result.projectId),
    );
    const replayIssues = await auditDemoReplayEvidence(
      prisma,
      result.projectId,
    );
    if (replayIssues.length > 0) {
      throw new Error(`回放证据链检查失败：\n- ${replayIssues.join('\n- ')}`);
    }
    console.log('回放证据链检查通过：标题、状态、投票目标和决议来源均完整。');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`决策协作演示数据脚本执行失败：${message}`);
  process.exitCode = 1;
});
