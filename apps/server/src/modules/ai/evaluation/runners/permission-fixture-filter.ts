/**
 * 本文件实现仅供第 0 阶段脱敏 Fixture 使用的权限前置过滤器，
 * 用于证明公共区、私有区、删除、跨项目和匿名选票诱饵在召回前被裁剪。
 */
import { toSourceReferenceKey } from '../metrics/metric-math';
import type {
  AiPermissionFixtureBusinessEvidenceSource,
  AiPermissionFixtureSource,
  AiPermissionFixtureV1,
} from '../types/ai-permission-fixture.types';
import type {
  AiGoldQueryForbiddenSourceReference,
  AiGoldQuerySourceReference,
  AiGoldQueryV1,
} from '../types/ai-gold-query.types';

/** 判断权限 Fixture 来源是否为允许参与业务过滤的普通证据。 */
function isBusinessEvidenceSource(
  source: AiPermissionFixtureSource,
): source is AiPermissionFixtureBusinessEvidenceSource {
  return source.sourceType !== 'vote_ballot';
}

/** 判断请求者是否具备请求目标项目和分区的基础访问资格。 */
function canAccessRequestScope(
  query: AiGoldQueryV1,
  fixture: AiPermissionFixtureV1,
): boolean {
  const scope = query.requestScope;
  const isProjectMember = fixture.projectMemberships.some(
    (membership) =>
      membership.userId === scope.requesterId &&
      membership.projectId === scope.projectId,
  );

  if (!isProjectMember) {
    return false;
  }

  if (scope.scopeLevel === 'project') {
    return true;
  }

  const area = fixture.discussionAreas.find(
    (candidate) =>
      candidate.areaId === scope.areaId &&
      candidate.projectId === scope.projectId,
  );

  if (!area) {
    return false;
  }

  return (
    area.visibility === 'public' ||
    fixture.privateAreaMemberships.some(
      (membership) =>
        membership.userId === scope.requesterId &&
        membership.areaId === scope.areaId,
    )
  );
}

/** 判断普通证据是否位于本次请求目标内且仍可引用。 */
function isSourceInsideRequest(
  query: AiGoldQueryV1,
  source: AiPermissionFixtureBusinessEvidenceSource,
): boolean {
  const scope = query.requestScope;

  if (
    source.projectId !== scope.projectId ||
    source.decisionId !== scope.decisionId ||
    source.deletedAt !== null
  ) {
    return false;
  }

  return scope.scopeLevel === 'project'
    ? source.areaId === null
    : source.areaId === scope.areaId;
}

/** 在模拟召回前按权限 Fixture 过滤候选来源，并永久排除单张匿名选票。 */
export function filterPermissionFixtureSources(
  query: AiGoldQueryV1,
  candidates: readonly AiGoldQueryForbiddenSourceReference[],
  fixture: AiPermissionFixtureV1,
): readonly AiGoldQuerySourceReference[] {
  if (!canAccessRequestScope(query, fixture)) {
    return [];
  }

  const sourceByKey = new Map(
    fixture.sources.map((source) => [toSourceReferenceKey(source), source]),
  );
  const allowedSources: AiGoldQuerySourceReference[] = [];

  for (const candidate of candidates) {
    const source = sourceByKey.get(toSourceReferenceKey(candidate));

    if (
      !source ||
      !isBusinessEvidenceSource(source) ||
      !isSourceInsideRequest(query, source)
    ) {
      continue;
    }

    allowedSources.push({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    });
  }

  return allowedSources;
}
