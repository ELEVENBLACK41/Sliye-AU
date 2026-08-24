/**
 * 本文件负责 AI Run 的授权决策发现、候选确认和权威范围快照读取。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiDecisionScopeCandidate,
  AiRunScopeResolution,
  AiRunScopeResolutionResponse,
  SearchAccessibleDecisionsResponse,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiRunScopeResolutionMethod,
  AiRunScopeResolutionStatus,
  AiRunStatus,
  Prisma,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 默认候选数量，避免模糊问题返回过多业务名称。 */
const DEFAULT_CANDIDATE_LIMIT = 8;
/** 单次候选查询允许的最大数量。 */
const MAX_CANDIDATE_LIMIT = 20;
/** 范围发现问题允许的最大 Unicode 字符数。 */
const MAX_SCOPE_QUERY_CHARACTERS = 500;
/** 用户一次最多确认的决策数，避免无界扩大 Run 范围。 */
const MAX_CONFIRMED_DECISIONS = 10;
/** 支持 `decision:12`、`决策#12` 和 `决策 12` 等明确引用。 */
const EXACT_DECISION_REFERENCE_PATTERN =
  /(?:decision|决策)\s*(?:[:：#]|编号)?\s*([1-9]\d*)/iu;
/** 从自然语言中提取搜索词时忽略的高频决策流程词。 */
const SCOPE_QUERY_STOP_WORDS = new Set([
  '当前',
  '这个',
  '这项',
  '那个',
  '一项',
  '决策',
  '项目',
  '对比',
  '比较',
  '查看',
  '查询',
  '分析',
  '一下',
  '什么',
  '怎么',
  '为什么',
]);

/** 候选接口和确认接口共同使用的安全决策字段。 */
const aiDecisionCandidateSelect = {
  id: true,
  title: true,
  area: { select: { id: true, name: true } },
  project: {
    select: {
      id: true,
      title: true,
      department: { select: { id: true, name: true } },
    },
  },
} as const satisfies Prisma.DecisionSelect;

/** Prisma 查询得到的一项安全候选记录。 */
type AiDecisionCandidateRecord = Prisma.DecisionGetPayload<{
  select: typeof aiDecisionCandidateSelect;
}>;

/** Run 范围读取所需的最小持久化结构。 */
const aiRunScopeSelect = {
  id: true,
  status: true,
  scopeStatus: true,
  scopeResolutionMethod: true,
  scopeResolvedAt: true,
  decisionScopes: {
    orderBy: [{ createdAt: 'asc' }, { decisionId: 'asc' }],
    select: { decisionId: true, projectId: true, areaId: true },
  },
  scopeCandidates: {
    orderBy: [{ createdAt: 'asc' }, { decisionId: 'asc' }],
    select: { decision: { select: aiDecisionCandidateSelect } },
  },
} as const satisfies Prisma.AiRunSelect;

/** Prisma 查询得到的 Run 范围记录。 */
type AiRunScopeRecord = Prisma.AiRunGetPayload<{
  select: typeof aiRunScopeSelect;
}>;

@Injectable()
export class AiRunScopeService {
  /** 注入数据库和现有对象级授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 在数据库侧先应用对象级权限，再返回少量安全决策候选。 */
  async searchAccessibleDecisions(
    authorization: AuthorizationContext,
    query: string,
    requestedLimit?: number,
  ): Promise<SearchAccessibleDecisionsResponse> {
    this.assertPermissions(authorization);
    const normalizedQuery = this.normalizeQuery(query);
    const limit = this.normalizeLimit(requestedLimit);
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const exactDecisionId = this.extractExactDecisionId(normalizedQuery);
    const searchConditions = this.buildSearchConditions(
      normalizedQuery,
      exactDecisionId,
    );
    const records = await this.prisma.decision.findMany({
      where: {
        AND: [decisionWhere, { OR: searchConditions }],
      },
      select: aiDecisionCandidateSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(limit * 4, MAX_CANDIDATE_LIMIT * 4),
    });

    return {
      candidates: this.rankCandidates(
        records,
        normalizedQuery,
        exactDecisionId,
      ).slice(0, limit),
    };
  }

  /** 读取一条 Run 当前持久化的范围解析快照。 */
  async getRunScope(
    authorization: AuthorizationContext,
    runId: string,
  ): Promise<AiRunScopeResolutionResponse> {
    this.assertPermissions(authorization);
    const record = await this.prisma.aiRun.findFirst({
      where: { id: runId, thread: { ownerUserId: authorization.userId } },
      select: aiRunScopeSelect,
    });
    if (!record) {
      this.throwRunNotFound();
    }

    await this.assertResolutionStillAccessible(authorization, record);
    return { runId: record.id, resolution: this.toResolution(record) };
  }

  /** 按用户问题发现范围；精确引用自动解析，模糊结果持久化为待确认候选。 */
  async discoverRunScope(
    authorization: AuthorizationContext,
    runId: string,
    query: string,
  ): Promise<AiRunScopeResolutionResponse> {
    const normalizedQuery = this.normalizeQuery(query);
    const search = await this.searchAccessibleDecisions(
      authorization,
      normalizedQuery,
      DEFAULT_CANDIDATE_LIMIT,
    );
    const exactDecisionId = this.extractExactDecisionId(normalizedQuery);
    const exactCandidate =
      search.candidates.find(
        (candidate) => candidate.decision.id === exactDecisionId,
      ) ??
      (search.candidates.length === 1 &&
      search.candidates[0]?.decision.title.normalize('NFKC') === normalizedQuery
        ? search.candidates[0]
        : undefined);

    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    await this.prisma.$transaction(
      async (tx) => {
        const run = await tx.aiRun.findFirst({
          where: { id: runId, thread: { ownerUserId: authorization.userId } },
          select: { id: true, status: true, scopeStatus: true },
        });
        if (!run) {
          this.throwRunNotFound();
        }
        if (run.scopeStatus === AiRunScopeResolutionStatus.RESOLVED) {
          return;
        }
        this.assertRunCanResolve(run);

        await tx.aiRunDecisionCandidate.deleteMany({ where: { runId } });
        await tx.aiRunDecisionScope.deleteMany({ where: { runId } });

        if (exactCandidate) {
          const exact = await tx.decision.findFirst({
            where: {
              AND: [{ id: exactCandidate.decision.id }, decisionWhere],
            },
            select: { id: true, projectId: true, areaId: true },
          });
          if (!exact) {
            this.throwCandidateInvalid();
          }
          await tx.aiRunDecisionScope.create({
            data: {
              runId,
              decisionId: exact.id,
              projectId: exact.projectId,
              areaId: exact.areaId,
            },
          });
          await tx.aiRun.update({
            where: { id: runId },
            data: {
              scopeStatus: AiRunScopeResolutionStatus.RESOLVED,
              scopeResolutionMethod: AiRunScopeResolutionMethod.EXACT_REFERENCE,
              scopeResolvedAt: new Date(),
            },
          });
          return;
        }

        const candidateIds = search.candidates.map(
          (candidate) => candidate.decision.id,
        );
        const accessibleCandidates =
          candidateIds.length === 0
            ? []
            : await tx.decision.findMany({
                where: { AND: [{ id: { in: candidateIds } }, decisionWhere] },
                select: { id: true },
              });
        if (accessibleCandidates.length > 0) {
          await tx.aiRunDecisionCandidate.createMany({
            data: accessibleCandidates.map((candidate) => ({
              runId,
              decisionId: candidate.id,
            })),
          });
        }
        await tx.aiRun.update({
          where: { id: runId },
          data: {
            scopeStatus:
              accessibleCandidates.length > 0
                ? AiRunScopeResolutionStatus.AWAITING_CONFIRMATION
                : AiRunScopeResolutionStatus.UNRESOLVED,
            scopeResolutionMethod: null,
            scopeResolvedAt: null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getRunScope(authorization, runId);
  }

  /** 用户确认一个或多个候选后重新鉴权，并原子固化 Run 的多决策范围。 */
  async confirmRunScope(
    authorization: AuthorizationContext,
    runId: string,
    decisionIds: readonly number[],
  ): Promise<AiRunScopeResolutionResponse> {
    this.assertPermissions(authorization);
    const normalizedDecisionIds = this.normalizeDecisionIds(decisionIds);
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );

    await this.prisma.$transaction(
      async (tx) => {
        const run = await tx.aiRun.findFirst({
          where: { id: runId, thread: { ownerUserId: authorization.userId } },
          select: { id: true, status: true, scopeStatus: true },
        });
        if (!run) {
          this.throwRunNotFound();
        }
        if (run.scopeStatus === AiRunScopeResolutionStatus.RESOLVED) {
          const existingScopes = await tx.aiRunDecisionScope.findMany({
            where: { runId },
            select: { decisionId: true },
            orderBy: { decisionId: 'asc' },
          });
          const existingIds = existingScopes.map((scope) => scope.decisionId);
          const replayIds = [...normalizedDecisionIds].sort(
            (left, right) => left - right,
          );
          if (
            existingIds.length === replayIds.length &&
            existingIds.every(
              (decisionId, index) => decisionId === replayIds[index],
            )
          ) {
            return;
          }
          this.throwCandidateInvalid();
        }
        this.assertRunCanResolve(run);
        if (
          run.scopeStatus !== AiRunScopeResolutionStatus.AWAITING_CONFIRMATION
        ) {
          throw new BusinessException({
            code: API_ERROR_CODES.AI_RUN_SCOPE_CONFIRMATION_REQUIRED,
            message: '当前 AI 运行没有等待确认的决策候选',
            status: HttpStatus.CONFLICT,
          });
        }

        const confirmed = await tx.aiRunDecisionCandidate.findMany({
          where: {
            runId,
            decisionId: { in: normalizedDecisionIds },
            decision: { is: decisionWhere },
          },
          select: {
            decision: { select: { id: true, projectId: true, areaId: true } },
          },
        });
        if (confirmed.length !== normalizedDecisionIds.length) {
          this.throwCandidateInvalid();
        }

        await tx.aiRunDecisionScope.deleteMany({ where: { runId } });
        await tx.aiRunDecisionScope.createMany({
          data: confirmed.map(({ decision }) => ({
            runId,
            decisionId: decision.id,
            projectId: decision.projectId,
            areaId: decision.areaId,
          })),
        });
        await tx.aiRunDecisionCandidate.deleteMany({ where: { runId } });
        await tx.aiRun.update({
          where: { id: runId },
          data: {
            scopeStatus: AiRunScopeResolutionStatus.RESOLVED,
            scopeResolutionMethod: AiRunScopeResolutionMethod.USER_CONFIRMED,
            scopeResolvedAt: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.getRunScope(authorization, runId);
  }

  /** 断言一条 Run 已解析范围，并返回当前仍可访问的权威快照。 */
  async assertResolvedRunScope(
    authorization: AuthorizationContext,
    runId: string,
  ): Promise<Extract<AiRunScopeResolution, { status: 'RESOLVED' }>> {
    const { resolution } = await this.getRunScope(authorization, runId);
    if (resolution.status !== 'RESOLVED') {
      throw new BusinessException({
        code:
          resolution.status === 'AWAITING_CONFIRMATION'
            ? API_ERROR_CODES.AI_RUN_SCOPE_CONFIRMATION_REQUIRED
            : API_ERROR_CODES.AI_RUN_SCOPE_UNRESOLVED,
        message:
          resolution.status === 'AWAITING_CONFIRMATION'
            ? '请先确认本次 AI 运行要使用的决策候选'
            : '当前 AI 运行尚未解析出可用决策范围',
        status: HttpStatus.CONFLICT,
      });
    }
    return resolution;
  }

  /** 把 Prisma 范围记录映射为共享可判别联合。 */
  private toResolution(record: AiRunScopeRecord): AiRunScopeResolution {
    if (
      record.scopeStatus === AiRunScopeResolutionStatus.RESOLVED &&
      record.scopeResolutionMethod &&
      record.scopeResolvedAt &&
      record.decisionScopes.length > 0
    ) {
      return {
        status: 'RESOLVED',
        scopes: record.decisionScopes as [
          (typeof record.decisionScopes)[number],
          ...(typeof record.decisionScopes)[number][],
        ],
        candidates: [],
        resolutionMethod: record.scopeResolutionMethod,
        resolvedAt: record.scopeResolvedAt.toISOString(),
      };
    }

    const candidates = record.scopeCandidates.map(({ decision }) =>
      this.toCandidate(decision),
    );
    if (
      record.scopeStatus === AiRunScopeResolutionStatus.AWAITING_CONFIRMATION &&
      candidates.length > 0
    ) {
      return {
        status: 'AWAITING_CONFIRMATION',
        scopes: [],
        candidates: candidates as [
          AiDecisionScopeCandidate,
          ...AiDecisionScopeCandidate[],
        ],
        resolutionMethod: null,
        resolvedAt: null,
      };
    }

    return {
      status: 'UNRESOLVED',
      scopes: [],
      candidates: [],
      resolutionMethod: null,
      resolvedAt: null,
    };
  }

  /** 重新校验已解析范围和待确认候选，防止接口返回失权名称。 */
  private async assertResolutionStillAccessible(
    authorization: AuthorizationContext,
    record: AiRunScopeRecord,
  ): Promise<void> {
    const ids = [
      ...record.decisionScopes.map((scope) => scope.decisionId),
      ...record.scopeCandidates.map(({ decision }) => decision.id),
    ];
    if (ids.length === 0) {
      return;
    }
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const accessibleCount = await this.prisma.decision.count({
      where: { AND: [{ id: { in: ids } }, decisionWhere] },
    });
    if (accessibleCount !== new Set(ids).size) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
        message: '本次 AI 运行的部分决策范围已失效，请重新选择',
        status: HttpStatus.CONFLICT,
      });
    }
  }

  /** 把数据库记录映射为不含权限细节的候选摘要。 */
  private toCandidate(
    record: AiDecisionCandidateRecord,
  ): AiDecisionScopeCandidate {
    return {
      decision: { id: record.id, title: record.title },
      project: { id: record.project.id, title: record.project.title },
      department: record.project.department,
      area: record.area,
    };
  }

  /** 让精确 ID、精确标题优先，其余候选保持数据库的新近顺序。 */
  private rankCandidates(
    records: readonly AiDecisionCandidateRecord[],
    query: string,
    exactDecisionId: number | null,
  ): AiDecisionScopeCandidate[] {
    return [...records]
      .sort((left, right) => {
        const leftRank = this.candidateRank(left, query, exactDecisionId);
        const rightRank = this.candidateRank(right, query, exactDecisionId);
        return leftRank - rightRank;
      })
      .map((record) => this.toCandidate(record));
  }

  /** 计算一项候选的稳定精确匹配优先级。 */
  private candidateRank(
    record: AiDecisionCandidateRecord,
    query: string,
    exactDecisionId: number | null,
  ): number {
    if (record.id === exactDecisionId) {
      return 0;
    }
    if (record.title.normalize('NFKC') === query) {
      return 1;
    }
    return 2;
  }

  /** 构造数据库侧候选匹配条件，绝不先读取无权数据再在内存过滤。 */
  private buildSearchConditions(
    query: string,
    exactDecisionId: number | null,
  ): Prisma.DecisionWhereInput[] {
    if (exactDecisionId) {
      return [{ id: exactDecisionId }];
    }

    const terms = this.extractSearchTerms(query);
    return terms.flatMap((term) => [
      { title: { contains: term, mode: 'insensitive' } },
      { project: { title: { contains: term, mode: 'insensitive' } } },
    ]);
  }

  /** 从自然语言问题提取有限关键词；没有有效词时使用完整问题。 */
  private extractSearchTerms(query: string): string[] {
    const terms = query
      .split(/[\s，。！？、；：,.!?;:"“”'‘’（）()【】\u005b\u005d<>《》]+/u)
      .map((term) => term.trim())
      .filter(
        (term) =>
          Array.from(term).length >= 2 && !SCOPE_QUERY_STOP_WORDS.has(term),
      );
    return [...new Set(terms)].slice(0, 8).length > 0
      ? [...new Set(terms)].slice(0, 8)
      : [query];
  }

  /** 解析明确决策 ID 引用，普通数字不会被视为授权范围。 */
  private extractExactDecisionId(query: string): number | null {
    const matched = EXACT_DECISION_REFERENCE_PATTERN.exec(query);
    const decisionId = matched?.[1] ? Number(matched[1]) : Number.NaN;
    return Number.isSafeInteger(decisionId) && decisionId > 0
      ? decisionId
      : null;
  }

  /** 规范化范围发现问题并执行长度校验。 */
  private normalizeQuery(query: string): string {
    const normalized = query.normalize('NFKC').trim();
    const characterCount = Array.from(normalized).length;
    if (characterCount === 0 || characterCount > MAX_SCOPE_QUERY_CHARACTERS) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: `范围查询必须为 1 到 ${MAX_SCOPE_QUERY_CHARACTERS} 个字符`,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return normalized;
  }

  /** 把候选数量限制在稳定安全区间。 */
  private normalizeLimit(limit?: number): number {
    if (limit === undefined) {
      return DEFAULT_CANDIDATE_LIMIT;
    }
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_CANDIDATE_LIMIT
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: `候选数量必须介于 1 到 ${MAX_CANDIDATE_LIMIT}`,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return limit;
  }

  /** 去重并校验用户确认的有限决策 ID 列表。 */
  private normalizeDecisionIds(decisionIds: readonly number[]): number[] {
    const normalized = [...new Set(decisionIds)];
    if (
      normalized.length === 0 ||
      normalized.length > MAX_CONFIRMED_DECISIONS ||
      normalized.some(
        (decisionId) => !Number.isSafeInteger(decisionId) || decisionId <= 0,
      )
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: `一次必须确认 1 到 ${MAX_CONFIRMED_DECISIONS} 项有效决策`,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return normalized;
  }

  /** 断言 Run 存在、仍在排队且没有进入模型执行。 */
  private assertRunCanResolve(
    run: {
      status: AiRunStatus;
      scopeStatus: AiRunScopeResolutionStatus;
    } | null,
  ): asserts run is {
    status: AiRunStatus;
    scopeStatus: AiRunScopeResolutionStatus;
  } {
    if (!run) {
      this.throwRunNotFound();
    }
    if (run.status !== AiRunStatus.QUEUED) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_RUN_INVALID_STATUS_TRANSITION,
        message: '只有尚未执行的排队 Run 可以解析决策范围',
        status: HttpStatus.CONFLICT,
      });
    }
  }

  /** 断言用户具备 AI 对话和决策读取系统权限。 */
  private assertPermissions(authorization: AuthorizationContext): void {
    this.authorizationService.assertPermission(authorization, 'ai:chat:use');
    this.authorizationService.assertPermission(authorization, 'decision:read');
  }

  /** 对不存在和无权访问统一返回 Not Found，避免资源枚举。 */
  private throwRunNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在或当前账号无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 拒绝确认已过期、未展示或刚刚失权的候选。 */
  private throwCandidateInvalid(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_SCOPE_CANDIDATE_INVALID,
      message: '决策候选已失效、未展示或当前账号无权访问，请重新查询',
      status: HttpStatus.CONFLICT,
    });
  }
}
