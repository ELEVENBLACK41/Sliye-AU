/**
 * 本文件组合新版单项决策的推进脊柱、提案、投票与正式决议业务区域。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircleMore, UsersRound } from 'lucide-react';
import type { ProjectUserSummary } from '@workspace/contracts/projects';

import { startProjectSpaceDecisionDiscussion } from '../services/project-space-client.service';
import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';
import { ProjectDecisionProposalPanel } from './project-decision-proposal-panel';
import { ProjectDecisionResolutionPanel } from './project-decision-resolution-panel';
import { ProjectDecisionStageRail } from './project-decision-stage-rail';
import { ProjectDecisionVotePanel } from './project-decision-vote-panel';
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';

/** 新版决策聚焦工作台属性。 */
type ProjectDecisionWorkbenchProps = {
  data: ProjectDecisionWorkspaceData;
  currentUser: ProjectUserSummary;
  canUpdate: boolean;
  onChanged: () => void;
  /** 从关系图谱进入时需要定位的具体过程实体。 */
  focusedProcessNode: {
    type: 'proposal' | 'vote_round' | 'resolution';
    id: number;
  } | null;
};

/** 渲染一项决策从草稿到正式决议的完整推进界面。 */
export function ProjectDecisionWorkbench({
  data,
  currentUser,
  canUpdate,
  onChanged,
  focusedProcessNode,
}: ProjectDecisionWorkbenchProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const decision = data.decision;
  const isOwner = decision.owner?.id === currentUser.id;
  const canStartDiscussion = canUpdate && isOwner && decision.status === 'DRAFT';
  const visibleParticipants = decision.participants.slice(0, 8);

  /** 首次从关系图谱进入或目标变化时，将具体过程卡片滚动到工作台可视区域。 */
  useEffect(() => {
    if (!focusedProcessNode) return;
    const target = workbenchRef.current?.querySelector<HTMLElement>(
      `[data-process-node="${focusedProcessNode.type}:${focusedProcessNode.id}"]`,
    );
    if (!target) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }, [focusedProcessNode]);

  /** 将负责人管理的草稿决策推进到讨论阶段。 */
  async function handleStartDiscussion(): Promise<void> {
    setPending(true);
    setError('');
    try {
      await startProjectSpaceDecisionDiscussion(decision.id);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '开始讨论失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={workbenchRef} className="grid gap-4 p-4 sm:p-5">
      <section className="rounded-2xl border border-project-accent/35 bg-project-accent-soft/20 p-4" aria-labelledby="focused-decision-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{decisionStatusText[decision.status]}</Badge>
              <Badge variant="outline" className="border-project-accent/60 bg-project-accent-soft text-project-ink">
                {decision.scope === 'PROJECT' ? '项目级' : decision.area?.name || '小组级'}
              </Badge>
            </div>
            <h2 id="focused-decision-title" className="mt-3 text-lg font-semibold tracking-tight">{decision.title}</h2>
            {decision.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{decision.description}</p> : null}
          </div>
          {canStartDiscussion ? (
            <Button type="button" className="shrink-0" disabled={pending} onClick={() => void handleStartDiscussion()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MessageCircleMore aria-hidden />}开始讨论
            </Button>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><UsersRound className="size-4" aria-hidden />{decision.participantCount} 位参与者</div>
          <AvatarGroup className="space-x-0">
            {visibleParticipants.map((participant) => {
              const name = participant.user.name || `用户 ${participant.user.id}`;
              return <Avatar key={participant.id} className="size-7"><AvatarImage src={participant.user.avatarUrl ?? undefined} alt={name} /><AvatarFallback>{name.slice(0, 1)}</AvatarFallback></Avatar>;
            })}
            {decision.participants.length > visibleParticipants.length ? <AvatarGroupCount className="size-7 text-[10px]">+{decision.participants.length - visibleParticipants.length}</AvatarGroupCount> : null}
          </AvatarGroup>
          <span className="text-xs text-muted-foreground">负责人：{decision.owner?.name || `用户 ${decision.owner?.id ?? '-'}`}</span>
        </div>
      </section>

      <ProjectDecisionStageRail data={data} />

      {decision.status === 'DRAFT' ? (
        <p className="rounded-xl border bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          草稿阶段可以先整理提案；开始讨论后，负责人才能开启投票并形成正式决议。
        </p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <ProjectDecisionProposalPanel
          data={data}
          currentUserId={currentUser.id}
          canUpdate={canUpdate}
          onChanged={onChanged}
          focusedProposalId={focusedProcessNode?.type === 'proposal' ? focusedProcessNode.id : null}
        />
        <ProjectDecisionVotePanel
          data={data}
          currentUserId={currentUser.id}
          canUpdate={canUpdate}
          onChanged={onChanged}
          focusedVoteRoundId={focusedProcessNode?.type === 'vote_round' ? focusedProcessNode.id : null}
        />
      </div>
      <ProjectDecisionResolutionPanel
        data={data}
        currentUserId={currentUser.id}
        canUpdate={canUpdate}
        onChanged={onChanged}
        focusedResolutionId={focusedProcessNode?.type === 'resolution' ? focusedProcessNode.id : null}
      />
    </div>
  );
}

/** 决策状态中文文案。 */
const decisionStatusText = { DRAFT: '草稿', DISCUSSING: '讨论中', RESOLVED: '已形成决议', CANCELLED: '已取消', ARCHIVED: '已归档' } as const;
