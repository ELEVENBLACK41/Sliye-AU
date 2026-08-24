/**
 * 本文件展示 AI Run 的授权决策候选、空结果补充查询和刷新后继续执行入口。
 */
'use client';

import { useState } from 'react';
import { ArrowRight, Building2, CheckCheck, LoaderCircle, Search, Sparkles } from 'lucide-react';

import type { AiRunScopeResolutionResponse } from '@workspace/contracts/ai';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Checkbox } from '@workspace/ui/components/checkbox';
import { Input } from '@workspace/ui/components/input';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 候选确认卡属性。 */
export type AiScopeCandidateCardProps = {
  /** 当前 Run 的权威范围快照。 */
  scope: AiRunScopeResolutionResponse | null;
  /** 刷新后是否仍在恢复范围。 */
  loading: boolean;
  /** 当前候选操作。 */
  action: 'confirming' | 'searching' | 'starting' | null;
  /** 范围读取或操作的安全错误。 */
  error: string | null;
  /** 重新读取持久化范围。 */
  onReload: () => Promise<void>;
  /** 确认经过权限过滤的候选。 */
  onConfirm: (decisionIds: number[]) => Promise<void>;
  /** 使用补充说明重新发现候选。 */
  onRediscover: (query: string) => Promise<void>;
  /** 继续已明确范围的排队 Run。 */
  onStart: () => Promise<void>;
};

/** 渲染独立于普通工具活动流的用户确认部件。 */
export function AiScopeCandidateCard({
  scope,
  loading,
  action,
  error,
  onReload,
  onConfirm,
  onRediscover,
  onStart,
}: AiScopeCandidateCardProps) {
  const [selectedDecisionIds, setSelectedDecisionIds] = useState<number[]>([]);
  const [query, setQuery] = useState('');

  /** 切换一项候选，同时保持选择顺序与候选展示顺序一致。 */
  function toggleCandidate(decisionId: number, checked: boolean): void {
    setSelectedDecisionIds((current) =>
      checked ? [...current, decisionId] : current.filter((id) => id !== decisionId),
    );
  }

  if (loading) {
    return <AiScopeCandidateSkeleton />;
  }

  if (!scope) {
    return error ? (
      <Alert variant="destructive">
        <AlertTitle>决策范围暂时无法恢复</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void onReload()}>
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    ) : null;
  }

  const resolution = scope.resolution;
  return (
    <section
      className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      aria-label="确认本次对话的决策范围"
      aria-busy={action !== null}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          {resolution.status === 'RESOLVED' ? <CheckCheck aria-hidden /> : <Sparkles aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">
              {resolution.status === 'AWAITING_CONFIRMATION'
                ? '确认这次要对照的决策'
                : resolution.status === 'RESOLVED'
                  ? '决策范围已确认'
                  : '还没有定位到可用决策'}
            </h3>
            <Badge variant="outline">权限已过滤</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {resolution.status === 'AWAITING_CONFIRMATION'
              ? '可以跨项目选择一项或多项；确认前不会读取候选正文，也不会生成确定性结论。'
              : resolution.status === 'RESOLVED'
                ? `本次 Run 已固定 ${resolution.scopes.length} 项最小授权范围，可以继续生成原问题的回答。`
                : '补充决策名称、项目名称或明确的决策编号，AI 会继续使用同一条消息查找。'}
          </p>
        </div>
      </div>

      {resolution.status === 'AWAITING_CONFIRMATION' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (selectedDecisionIds.length > 0) void onConfirm(selectedDecisionIds);
          }}
        >
          <fieldset className="space-y-2" disabled={action !== null}>
            <legend className="sr-only">选择要分析的决策候选</legend>
            {resolution.candidates.map((candidate) => {
              const checked = selectedDecisionIds.includes(candidate.decision.id);
              const checkboxId = `ai-scope-${scope.runId}-${candidate.decision.id}`;
              return (
                <label
                  key={candidate.decision.id}
                  htmlFor={checkboxId}
                  className="group flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/60 has-data-checked:border-primary/60 has-data-checked:bg-primary/5"
                >
                  <Checkbox
                    id={checkboxId}
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(value) => toggleCandidate(candidate.decision.id, value === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{candidate.decision.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Building2 aria-hidden className="size-3" />
                        {candidate.department.name}
                      </span>
                      <span>{candidate.project.title}</span>
                      <span>{candidate.area?.name ?? '项目级决策'}</span>
                      <span>#{candidate.decision.id}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              已选择 {selectedDecisionIds.length} 项，确认时会再次校验权限。
            </p>
            <Button type="submit" disabled={selectedDecisionIds.length === 0 || action !== null}>
              {action === 'confirming' ? (
                <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {action === 'confirming' ? '正在确认' : '确认并继续'}
              {action !== 'confirming' ? <ArrowRight aria-hidden /> : null}
            </Button>
          </div>
        </form>
      ) : null}

      {resolution.status === 'UNRESOLVED' ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const normalizedQuery = query.trim();
            if (normalizedQuery) void onRediscover(normalizedQuery);
          }}
        >
          <Input
            value={query}
            aria-label="补充决策名称或项目名称"
            placeholder="例如：比较官网改版与移动端重构两项决策"
            disabled={action !== null}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <Button type="submit" variant="outline" disabled={!query.trim() || action !== null}>
            {action === 'searching' ? (
              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Search aria-hidden />
            )}
            {action === 'searching' ? '正在查找' : '重新查找'}
          </Button>
        </form>
      ) : null}

      {resolution.status === 'RESOLVED' ? (
        <div className="flex justify-end">
          <Button type="button" disabled={action !== null} onClick={() => void onStart()}>
            {action === 'starting' ? (
              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : null}
            {action === 'starting' ? '正在继续' : '继续生成回答'}
            {action !== 'starting' ? <ArrowRight aria-hidden /> : null}
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert className="mt-4" variant="destructive">
          <AlertTitle>本次范围操作未完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

/** 渲染历史恢复阶段的候选卡骨架，避免工作区布局跳动。 */
function AiScopeCandidateSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4" role="status" aria-label="正在恢复决策候选">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
