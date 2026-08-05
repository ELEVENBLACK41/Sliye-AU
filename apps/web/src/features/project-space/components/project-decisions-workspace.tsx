/**
 * 本文件按需加载当前项目的真实决策事件，并组合 D3 过程画布与回放控制器。
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, RefreshCw, Search, GitBranch, Plus } from 'lucide-react';
import type { DecisionEventTimelineItem, DecisionSummary } from '@workspace/contracts/decisions';
import type { ProjectDetail } from '@workspace/contracts/projects';

import { getDecisionEvents } from '@/features/decisions/services/decisions-client.service';
import { useDecisionReplay } from '../hooks/use-decision-replay';
import {
  buildProjectDecisionReplayModel,
  type ProjectDecisionEventSource,
} from '../utils/project-decision-replay.mapper';
import { DecisionMapCanvas, type DecisionMapCanvasHandle } from './decision-map-canvas';
import { DecisionReplayTimeline } from './decision-replay-timeline';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 项目决策工作区属性。 */
type ProjectDecisionsWorkspaceProps = {
  /** 当前项目。 */
  project: ProjectDetail;
  /** 当前项目下用户可见的决策摘要。 */
  decisions: DecisionSummary[];
};

/** 单项决策事件请求完成后的客户端结果。 */
type LoadedDecisionEvents = {
  /** 决策数据库主键。 */
  decisionId: number;
  /** 当前决策的真实事件时间线。 */
  events: DecisionEventTimelineItem[];
};

/** 按需读取项目决策事件，并处理加载、空数据和局部失败状态。 */
export function ProjectDecisionsWorkspace({ project, decisions }: ProjectDecisionsWorkspaceProps) {
  const [loadedEvents, setLoadedEvents] = useState<LoadedDecisionEvents[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  /** 决策模块实际挂载后再并行读取事件，避免拖慢项目空间讨论首屏。 */
  useEffect(() => {
    if (decisions.length === 0) return;

    let isCurrent = true;
    void Promise.all(
      decisions.map(async (decision) => ({
        decisionId: decision.id,
        events: await getDecisionEvents(decision.id),
      })),
    )
      .then((results) => {
        if (isCurrent) setLoadedEvents(results);
      })
      .catch(() => {
        if (isCurrent) setHasError(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [decisions, retryVersion]);

  /** 重新执行当前项目的局部事件读取。 */
  function retryLoading(): void {
    setLoadedEvents(null);
    setHasError(false);
    setRetryVersion((version) => version + 1);
  }

  if (decisions.length === 0) return <DecisionReplayEmptyState />;
  if (hasError) return <DecisionReplayError onRetry={retryLoading} />;
  if (!loadedEvents) return <DecisionReplayLoading />;

  const eventSources: ProjectDecisionEventSource[] = decisions.map((decision) => ({
    decision,
    events: loadedEvents.find((item) => item.decisionId === decision.id)?.events ?? [],
  }));
  const replayModel = buildProjectDecisionReplayModel(project.title, eventSources);
  if (replayModel.events.length === 0) return <DecisionEventsEmptyState />;

  return <ProjectDecisionReplay replayModel={replayModel} />;
}

/** 已加载回放模型的交互画布属性。 */
type ProjectDecisionReplayProps = {
  /** 当前项目完整的树与事件模型。 */
  replayModel: ReturnType<typeof buildProjectDecisionReplayModel>;
};

/** 渲染真实事件驱动的 D3 决策画布和底部播放胶囊。 */
function ProjectDecisionReplay({ replayModel }: ProjectDecisionReplayProps) {
  const decisionMapRef = useRef<DecisionMapCanvasHandle | null>(null);
  const stableEvents = useMemo(() => replayModel.events, [replayModel.events]);
  const replayController = useDecisionReplay(stableEvents);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-1.5 border-b border-black/[0.06] px-4 py-2" aria-label="关系画布工具">
        <Button type="button" variant="outline" size="sm" onClick={() => decisionMapRef.current?.fitCanvas()} className="h-8 rounded-lg border-black/10 bg-white/45 text-xs shadow-none">
          适应画布
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => decisionMapRef.current?.zoomOut()} className="size-8 rounded-lg border-black/10 bg-white/45 shadow-none" aria-label="缩小画布">
          <Search className="size-3.5" aria-hidden /><Minus className="size-2.5" aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => decisionMapRef.current?.zoomIn()} className="size-8 rounded-lg border-black/10 bg-white/45 shadow-none" aria-label="放大画布">
          <Search className="size-3.5" aria-hidden /><Plus className="size-2.5" aria-hidden />
        </Button>
      </div>
      <DecisionMapCanvas
        ref={decisionMapRef}
        treeData={replayModel.tree}
        events={stableEvents}
        currentIndex={replayController.currentIndex}
        progress={replayController.progress}
      />
      <DecisionReplayTimeline controller={replayController} events={stableEvents} />
    </div>
  );
}

/** 渲染项目尚未创建决策时的空状态。 */
function DecisionReplayEmptyState() {
  return (
    <section className="grid min-h-[30rem] flex-1 place-items-center p-6 text-center" aria-labelledby="project-decisions-title">
      <div className="max-w-sm">
        <GitBranch className="mx-auto size-8 text-black/35" aria-hidden />
        <h2 id="project-decisions-title" className="mt-4 text-base font-semibold">暂无决策</h2>
        <p className="mt-2 text-xs leading-5 text-black/45">项目形成决策后，过程事件会在这里生成可回放图谱。</p>
      </div>
    </section>
  );
}

/** 渲染事件时间线正在按需读取时的局部骨架。 */
function DecisionReplayLoading() {
  return (
    <section className="min-h-[30rem] flex-1 space-y-4 p-5" aria-label="决策回放正在加载" aria-busy="true">
      <Skeleton className="h-16 w-60 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-16 w-full rounded-full" />
    </section>
  );
}

/** 渲染决策存在但尚无持久化事件的真实空状态。 */
function DecisionEventsEmptyState() {
  return (
    <section className="grid min-h-[30rem] flex-1 place-items-center p-6 text-center">
      <div>
        <GitBranch className="mx-auto size-8 text-black/35" aria-hidden />
        <p className="mt-3 font-medium">暂无可回放事件</p>
        <p className="mt-1 text-xs text-black/45">决策过程产生事件后会自动出现在这里。</p>
      </div>
    </section>
  );
}

/** 决策回放局部错误状态属性。 */
type DecisionReplayErrorProps = {
  /** 重新读取全部当前项目事件。 */
  onRetry: () => void;
};

/** 渲染不会影响项目其他模块的回放错误状态。 */
function DecisionReplayError({ onRetry }: DecisionReplayErrorProps) {
  return (
    <section className="grid min-h-[30rem] flex-1 place-items-center p-6">
      <Alert variant="destructive" className="max-w-md bg-white/65">
        <GitBranch aria-hidden />
        <AlertTitle>决策回放加载失败</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>项目其他数据仍可使用，可以单独重试回放事件。</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden />重新加载回放
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
