/**
 * 本文件组合新版项目空间的决策推进工作台与真实过程回放画布。
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, GitBranch, Minus, Network, Plus, RefreshCw, Search } from 'lucide-react';
import type { DecisionEventTimelineItem, DecisionSummary } from '@workspace/contracts/decisions';
import type { DiscussionAreaSummary, ProjectDetail, ProjectUserSummary } from '@workspace/contracts/projects';

import { useProjectDecisionWorkspace } from '../hooks/use-project-decision-workspace';
import { useDecisionReplay } from '../hooks/use-decision-replay';
import { getProjectSpaceDecisionEvents } from '../services/project-space-client.service';
import {
  buildProjectDecisionReplayModel,
  type ProjectDecisionEventSource,
} from '../utils/project-decision-replay.mapper';
import { DecisionMapCanvas, type DecisionMapCanvasHandle } from './decision-map-canvas';
import { DecisionReplayTimeline } from './decision-replay-timeline';
import { ProjectDecisionCreateSheet } from './project-decision-create-sheet';
import { ProjectDecisionWorkbench } from './project-decision-workbench';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 项目决策工作区属性。 */
type ProjectDecisionsWorkspaceProps = {
  project: ProjectDetail;
  areas: DiscussionAreaSummary[];
  currentArea: DiscussionAreaSummary;
  decisions: DecisionSummary[];
  currentUser: ProjectUserSummary;
  canCreate: boolean;
  canUpdate: boolean;
};

/** 渲染跟随当前讨论分区的单一决策业务工作区。 */
export function ProjectDecisionsWorkspace({
  project,
  areas,
  currentArea,
  decisions: initialDecisions,
  currentUser,
  canCreate,
  canUpdate,
}: ProjectDecisionsWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isProcessReplayVisible, setIsProcessReplayVisible] = useState(false);
  const queryDecisionId = parsePositiveInteger(searchParams.get('decisionId'));
  const focusedProcessNode = parseFocusedProcessNode(
    searchParams.get('focusType'),
    searchParams.get('focusId'),
  );
  const scopedDecisions = useMemo(
    () => initialDecisions.filter((decision) =>
      currentArea.type === 'PUBLIC'
        ? decision.scope === 'PROJECT'
        : decision.scope === 'AREA' && decision.area?.id === currentArea.id,
    ),
    [currentArea.id, currentArea.type, initialDecisions],
  );
  const workspace = useProjectDecisionWorkspace({ initialDecisions: scopedDecisions, requestedDecisionId: queryDecisionId });

  /** 更新决策选择，同时保留当前项目和讨论分区查询参数。 */
  function handleDecisionChange(value: string): void {
    const decisionId = Number(value);
    if (!Number.isInteger(decisionId)) return;
    updateDecisionQuery(decisionId);
  }

  /** 更新当前分区选中的决策，并清理旧版双视图查询参数。 */
  function updateDecisionQuery(decisionId: number): void {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set('decisionId', String(decisionId));
    nextSearchParams.delete('decisionView');
    router.push(`${pathname}?${nextSearchParams}`, { scroll: false });
  }

  /** 新决策创建后选中它并留在当前群组业务工作区。 */
  function handleDecisionCreated(decision: Parameters<typeof workspace.addDecision>[0]): void {
    workspace.addDecision(decision);
    updateDecisionQuery(decision.id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-black/[0.07] bg-project-surface/75 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden shrink-0 rounded-full border border-project-accent/50 bg-project-accent-soft px-2.5 py-1 text-[10px] font-medium text-project-ink sm:inline-flex">
            {currentArea.type === 'PUBLIC' ? '项目级决策' : `${currentArea.name} · 小组级`}
          </span>
          {workspace.decisions.length ? (
            <Select value={workspace.selectedDecisionId ? String(workspace.selectedDecisionId) : undefined} onValueChange={handleDecisionChange}>
              <SelectTrigger className="min-w-0 flex-1 sm:max-w-sm" aria-label="选择要推进的决策">
                <SelectValue placeholder="选择一项决策" />
              </SelectTrigger>
              <SelectContent>
                {workspace.decisions.map((decision) => (
                  <SelectItem key={decision.id} value={String(decision.id)}>{decision.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">还没有决策</p>
              <p className="text-xs text-muted-foreground">从当前项目或小组上下文直接发起。</p>
            </div>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={isProcessReplayVisible ? 'outline' : 'default'}
          disabled={workspace.decisions.length === 0}
          className={isProcessReplayVisible
            ? 'border-black/10 bg-white/55 shadow-none'
            : 'bg-project-accent text-project-ink shadow-none hover:bg-project-accent/85'}
          onClick={() => setIsProcessReplayVisible((visible) => !visible)}
        >
          {isProcessReplayVisible ? <ArrowLeft aria-hidden /> : <Network aria-hidden />}
          {isProcessReplayVisible ? '返回决策详情' : '过程回放'}
        </Button>
        <ProjectDecisionCreateSheet
          project={project}
          currentArea={currentArea}
          canCreate={canCreate}
          onCreated={handleDecisionCreated}
          compact
        />
      </header>

      {isProcessReplayVisible ? (
        <ProjectDecisionReplayWorkspace
          project={project}
          areas={areas}
          decisions={workspace.decisions}
          refreshKey={workspace.workspaceData?.events.length ?? 0}
        />
      ) : workspace.isLoading ? (
        <DecisionWorkbenchLoading />
      ) : workspace.error ? (
        <DecisionWorkbenchError message={workspace.error} onRetry={workspace.refresh} />
      ) : workspace.workspaceData ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProjectDecisionWorkbench
            data={workspace.workspaceData}
            currentUser={currentUser}
            canUpdate={canUpdate}
            onChanged={workspace.refresh}
            focusedProcessNode={focusedProcessNode}
          />
        </div>
      ) : (
        <DecisionWorkspaceEmptyState canCreate={canCreate} />
      )}
    </div>
  );
}

/** 解析关系图谱传入的具体过程节点定位参数，拒绝未知类型和非法主键。 */
function parseFocusedProcessNode(
  type: string | null,
  id: string | null,
): { type: 'proposal' | 'vote_round' | 'resolution'; id: number } | null {
  const parsedId = parsePositiveInteger(id);
  if (!parsedId) return null;
  if (type !== 'proposal' && type !== 'vote_round' && type !== 'resolution') return null;
  return { type, id: parsedId };
}

/** 项目级回放视图属性。 */
type ProjectDecisionReplayWorkspaceProps = {
  project: ProjectDetail;
  areas: DiscussionAreaSummary[];
  decisions: DecisionSummary[];
  refreshKey: number;
};

/** 单项决策事件请求完成后的客户端结果。 */
type LoadedDecisionEvents = { decisionId: number; events: DecisionEventTimelineItem[] };

/** 按需读取项目全部决策事件并渲染过程图谱。 */
function ProjectDecisionReplayWorkspace({ project, areas, decisions, refreshKey }: ProjectDecisionReplayWorkspaceProps) {
  const [loadedEvents, setLoadedEvents] = useState<LoadedDecisionEvents[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  /** 回放视图挂载后再并行读取项目全部决策事件。 */
  useEffect(() => {
    if (decisions.length === 0) return;
    let isCurrent = true;
    void Promise.all(decisions.map(async (decision) => ({
      decisionId: decision.id,
      events: await getProjectSpaceDecisionEvents(decision.id),
    })))
      .then((results) => { if (isCurrent) setLoadedEvents(results); })
      .catch(() => {
        if (!isCurrent) return;
        setLoadedEvents(null);
        setHasError(true);
      });
    return () => { isCurrent = false; };
  }, [decisions, refreshKey, retryVersion]);

  /** 重新执行当前项目的全部回放事件读取。 */
  function retryLoading(): void {
    setLoadedEvents(null);
    setHasError(false);
    setRetryVersion((version) => version + 1);
  }

  if (decisions.length === 0) return <DecisionWorkspaceEmptyState canCreate={false} />;
  if (hasError) return <DecisionWorkbenchError message="决策回放加载失败，项目其他数据仍可使用。" onRetry={retryLoading} />;
  if (!loadedEvents) return <DecisionWorkbenchLoading />;

  const eventSources: ProjectDecisionEventSource[] = decisions.map((decision) => ({
    decision,
    events: loadedEvents.find((item) => item.decisionId === decision.id)?.events ?? [],
  }));
  const replayModel = buildProjectDecisionReplayModel(project.title, eventSources, areas);
  if (replayModel.events.length === 0) return <DecisionEventsEmptyState />;
  return <ProjectDecisionReplay replayModel={replayModel} />;
}

/** 已加载回放模型的交互画布属性。 */
type ProjectDecisionReplayProps = { replayModel: ReturnType<typeof buildProjectDecisionReplayModel> };

/** 渲染真实事件驱动的 D3 画布和播放控制器。 */
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

/** 渲染决策工作台按需读取时的局部骨架。 */
function DecisionWorkbenchLoading() {
  return <section className="min-h-[30rem] flex-1 space-y-4 p-5" aria-label="决策工作台正在加载" aria-busy="true"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div></section>;
}

/** 决策工作台错误状态属性。 */
type DecisionWorkbenchErrorProps = { message: string; onRetry: () => void };

/** 渲染不会影响项目其他模块的局部错误状态。 */
function DecisionWorkbenchError({ message, onRetry }: DecisionWorkbenchErrorProps) {
  return <section className="grid min-h-[30rem] flex-1 place-items-center p-6"><Alert variant="destructive" className="max-w-md"><GitBranch aria-hidden /><AlertTitle>决策数据加载失败</AlertTitle><AlertDescription className="space-y-3"><p>{message}</p><Button type="button" variant="outline" onClick={onRetry}><RefreshCw aria-hidden />重新加载</Button></AlertDescription></Alert></section>;
}

/** 渲染项目尚未创建决策时的真实空状态。 */
function DecisionWorkspaceEmptyState({ canCreate }: { canCreate: boolean }) {
  return <section className="grid min-h-[30rem] flex-1 place-items-center p-6 text-center"><div className="max-w-sm"><GitBranch className="mx-auto size-8 text-muted-foreground" aria-hidden /><h2 className="mt-4 text-base font-semibold">从第一个需要确认的问题开始</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">发起后会自动继承当前协作成员，并完整记录提案、投票和正式决议。</p>{!canCreate ? <p className="mt-3 text-xs text-muted-foreground">当前账号没有创建决策权限。</p> : null}</div></section>;
}

/** 渲染决策存在但尚无持久化事件的真实空状态。 */
function DecisionEventsEmptyState() {
  return <section className="grid min-h-[30rem] flex-1 place-items-center p-6 text-center"><div><GitBranch className="mx-auto size-8 text-muted-foreground" aria-hidden /><p className="mt-3 font-medium">暂无可回放事件</p><p className="mt-1 text-xs text-muted-foreground">决策过程产生事件后会自动出现在这里。</p></div></section>;
}

/** 将查询参数解析为安全的正整数主键。 */
function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
