/**
 * 本文件用真实决策状态与业务产物展示新版工作台的推进脊柱。
 */
import { Check, Circle, FileText, Gavel, Lightbulb, MessagesSquare, Vote } from 'lucide-react';

import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';
import { cn } from '@workspace/ui/lib/utils';

/** 决策推进脊柱属性。 */
type ProjectDecisionStageRailProps = {
  /** 当前决策的完整工作台数据。 */
  data: ProjectDecisionWorkspaceData;
};

/** 按真实状态计算并展示创建、讨论、提案、投票和决议阶段。 */
export function ProjectDecisionStageRail({ data }: ProjectDecisionStageRailProps) {
  const isDiscussionStarted = data.decision.status !== 'DRAFT';
  const hasProposal = data.proposals.length > 0;
  const hasVote = data.voteRounds.length > 0;
  const hasResolution = data.resolutions.length > 0 || data.decision.status === 'RESOLVED';
  const stages = [
    { label: '已发起', complete: true, icon: Lightbulb },
    { label: '讨论', complete: isDiscussionStarted, icon: MessagesSquare },
    { label: '提案', complete: hasProposal, icon: FileText },
    { label: '投票', complete: hasVote, icon: Vote },
    { label: '正式决议', complete: hasResolution, icon: Gavel },
  ];
  const currentStageIndex = stages.reduce((latestIndex, stage, index) => stage.complete ? index : latestIndex, 0);

  return (
    <ol className="grid grid-cols-5 overflow-hidden rounded-2xl border bg-card" aria-label="决策推进阶段">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        const isCurrentStage = index === currentStageIndex;
        return (
          <li
            key={stage.label}
            className={cn(
              'relative flex min-w-0 flex-col items-center gap-1.5 px-1 py-3 text-center sm:px-2',
              index > 0 && 'border-l',
              isCurrentStage
                ? 'bg-project-accent text-project-ink'
                : stage.complete
                  ? 'bg-project-ink text-white'
                  : 'bg-muted/30 text-muted-foreground',
            )}
          >
            <span className="relative grid size-6 place-items-center rounded-full border border-current/25">
              <Icon className="size-3.5" aria-hidden />
              {stage.complete ? (
                <Check className="absolute -right-1 -bottom-1 size-3 rounded-full bg-background p-0.5 text-foreground" aria-hidden />
              ) : (
                <Circle className="absolute -right-1 -bottom-1 size-2.5 fill-background text-background" aria-hidden />
              )}
            </span>
            <span className="truncate text-[10px] font-medium sm:text-xs">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
