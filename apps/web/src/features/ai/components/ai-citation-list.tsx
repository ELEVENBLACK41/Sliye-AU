/**
 * 本文件使用 AI Elements Sources 展示稳定来源 ID，并按每次 Run 的真实跨项目范围定位决策。
 */
'use client';

import { BookOpen, CircleAlert } from 'lucide-react';

import { Badge } from '@workspace/ui/components/badge';

import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';

/** 引用列表定位本次 Run 来源所需的公开业务范围。 */
export type AiCitationListProps = {
  /** Run 返回并持久化的稳定来源 ID。 */
  sourceIds: readonly string[];
  /** 每个来源在本次工具结果中的真实项目与决策定位。 */
  sourceLocations?: Record<string, { projectId: number; decisionId: number }>;
  /** 2.6 旧 Thread 在旧工具摘要缺少项目主键时使用的兼容项目。 */
  fallbackProjectId?: number | null;
  /** 2.6 旧 Thread 在旧工具摘要缺少项目主键时使用的兼容决策。 */
  fallbackDecisionId?: number | null;
};

/** 引用列表内部的安全定位结果。 */
type AiCitationView = {
  /** 后端返回的稳定来源 ID。 */
  sourceId: string;
  /** 面向用户的来源名称。 */
  label: string;
  /** 当前业务页面可以安全打开的内部地址。 */
  href: string | null;
  /** 无法定位时展示的稳定状态。 */
  unavailableReason: string | null;
};

/** 渲染去重后的引用列表；无引用时不占用消息空间。 */
export function AiCitationList({
  sourceIds,
  sourceLocations = {},
  fallbackProjectId = null,
  fallbackDecisionId = null,
}: AiCitationListProps) {
  const citations = [...new Set(sourceIds)].map((sourceId) =>
    resolveCitationView(sourceId, sourceLocations[sourceId], fallbackProjectId, fallbackDecisionId),
  );

  if (citations.length === 0) {
    return null;
  }

  return (
    <Sources className="mb-3 rounded-lg border bg-card p-3 text-foreground">
      <SourcesTrigger className="w-full justify-between text-left" count={citations.length} />
      <SourcesContent className="w-full" role="list">
        {citations.map((citation) =>
          citation.href ? (
            <Source
              key={citation.sourceId}
              className="rounded-md border bg-background px-3 py-2 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={citation.href}
              target="_self"
              title={`定位来源 ${citation.sourceId}`}
              role="listitem"
            >
              <BookOpen aria-hidden className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{citation.label}</span>
                <code className="block break-all text-xs text-muted-foreground">{citation.sourceId}</code>
              </span>
              <Badge variant="outline">可定位</Badge>
            </Source>
          ) : (
            <div
              key={citation.sourceId}
              className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-muted-foreground"
              role="listitem"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{citation.label}</span>
                <code className="block break-all text-xs">{citation.sourceId}</code>
                <span className="mt-1 block text-xs">{citation.unavailableReason}</span>
              </span>
              <Badge variant="secondary">不可定位</Badge>
            </div>
          ),
        )}
      </SourcesContent>
    </Sources>
  );
}

/** 将稳定来源 ID 解析成当前决策范围内可安全使用的内部链接。 */
function resolveCitationView(
  sourceId: string,
  location: { projectId: number; decisionId: number } | undefined,
  fallbackProjectId: number | null,
  fallbackDecisionId: number | null,
): AiCitationView {
  const decisionMatch = /^decision:([1-9]\d*)$/.exec(sourceId);

  if (!decisionMatch) {
    return {
      sourceId,
      label: '来源暂不可定位',
      href: null,
      unavailableReason: '当前版本尚不支持此来源类型，或来源已经失效。',
    };
  }

  const sourceDecisionId = Number(decisionMatch[1]);
  const projectId = location?.projectId ?? fallbackProjectId;
  const decisionId = location?.decisionId ?? fallbackDecisionId;
  const hasValidScope =
    typeof projectId === 'number' &&
    Number.isSafeInteger(projectId) &&
    projectId > 0 &&
    typeof decisionId === 'number' &&
    Number.isSafeInteger(decisionId) &&
    decisionId > 0 &&
    sourceDecisionId === decisionId;

  if (!hasValidScope) {
    return {
      sourceId,
      label: `决策 #${sourceDecisionId}`,
      href: null,
      unavailableReason: '该来源不再属于当前会话的可访问决策范围。',
    };
  }

  const searchParams = new URLSearchParams({
    projectId: String(projectId),
    section: 'decisions',
    decisionId: String(decisionId),
  });

  return {
    sourceId,
    label: `当前决策 #${sourceDecisionId}`,
    href: `/projects?${searchParams.toString()}`,
    unavailableReason: null,
  };
}
