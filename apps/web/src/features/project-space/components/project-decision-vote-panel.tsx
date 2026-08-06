/**
 * 本文件展示新版决策工作台的投票轮次、选票提交和关闭结果。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { BarChart3, Loader2, LockKeyhole, Vote } from 'lucide-react';
import type { DecisionVoteRound } from '@workspace/contracts/decisions';

import {
  closeProjectSpaceDecisionVoteRound,
  submitProjectSpaceDecisionBallot,
} from '../services/project-space-client.service';
import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';
import { ProjectDecisionVoteCreateSheet } from './project-decision-vote-create-sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@workspace/ui/components/alert-dialog';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group';

/** 新版投票面板属性。 */
type ProjectDecisionVotePanelProps = {
  data: ProjectDecisionWorkspaceData;
  currentUserId: number;
  canUpdate: boolean;
  onChanged: () => void;
};

/** 渲染真实投票轮次，并按参与身份开放对应操作。 */
export function ProjectDecisionVotePanel({ data, currentUserId, canUpdate, onChanged }: ProjectDecisionVotePanelProps) {
  const participantRole = data.decision.participants.find((item) => item.user.id === currentUserId)?.role;
  const isOwner = data.decision.owner?.id === currentUserId;
  const canManage = canUpdate && data.decision.status === 'DISCUSSING' && isOwner;
  const canVote =
    data.decision.status === 'DISCUSSING' && (participantRole === 'OWNER' || participantRole === 'APPROVER');

  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="decision-votes-title">
      <header className="flex items-start justify-between gap-3 border-b bg-project-accent-soft/25 px-4 py-3">
        <div>
          <h3 id="decision-votes-title" className="text-sm font-semibold">投票</h3>
          <p className="mt-1 text-xs text-muted-foreground">投票结果是决议依据，不会自动替代正式决议。</p>
        </div>
        {canManage ? (
          <ProjectDecisionVoteCreateSheet
            decisionId={data.decision.id}
            proposals={data.proposals}
            voteRounds={data.voteRounds}
            onCreated={onChanged}
          />
        ) : null}
      </header>
      {data.voteRounds.length ? (
        <div className="grid gap-3 p-3">
          {data.voteRounds.map((round) => (
            <VoteRoundCard
              key={round.id}
              decisionId={data.decision.id}
              round={round}
              canVote={canVote}
              canClose={canManage && round.status === 'OPEN'}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <Vote className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">暂无投票</p>
          <p className="mt-1 text-xs text-muted-foreground">负责人可以从开放提案发起一轮表决。</p>
        </div>
      )}
    </section>
  );
}

/** 单轮投票卡片属性。 */
type VoteRoundCardProps = {
  decisionId: number;
  round: DecisionVoteRound;
  canVote: boolean;
  canClose: boolean;
  onChanged: () => void;
};

/** 渲染开放选票或关闭后的稳定统计。 */
function VoteRoundCard({ decisionId, round, canVote, canClose, onChanged }: VoteRoundCardProps) {
  const [optionId, setOptionId] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 提交当前用户的单选选票。 */
  async function handleVote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || !optionId) return;
    setPending(true);
    setError('');
    try {
      await submitProjectSpaceDecisionBallot(decisionId, round.id, {
        optionId: Number(optionId),
        reason: reason.trim() || undefined,
      });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '选票提交失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{round.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={round.status === 'OPEN' ? 'default' : 'secondary'}>{round.status === 'OPEN' ? '投票中' : round.status === 'CLOSED' ? '已关闭' : '已取消'}</Badge>
            {round.isAnonymous ? <Badge variant="outline"><LockKeyhole aria-hidden />匿名</Badge> : null}
          </div>
        </div>
        {canClose ? <VoteCloseDialog decisionId={decisionId} round={round} onChanged={onChanged} /> : null}
      </div>
      {round.description ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{round.description}</p> : null}
      {round.status === 'OPEN' ? (
        round.hasVoted ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">你的选票已提交，结果将在负责人关闭投票后公开。</p>
        ) : canVote ? (
          <form className="mt-3 grid gap-3" onSubmit={handleVote}>
            <RadioGroup value={optionId} onValueChange={setOptionId} className="grid grid-cols-3 gap-2">
              {round.options.map((option) => (
                <Label key={option.id} htmlFor={`vote-${round.id}-${option.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs has-data-checked:border-primary has-data-checked:bg-primary/5">
                  <RadioGroupItem id={`vote-${round.id}-${option.id}`} value={String(option.id)} />{option.label}
                </Label>
              ))}
            </RadioGroup>
            <Input value={reason} maxLength={500} placeholder="投票理由（选填）" onChange={(event) => setReason(event.currentTarget.value)} />
            {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
            <Button type="submit" size="sm" disabled={pending || !optionId}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}提交选票
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">当前身份不参与本轮表决。</p>
        )
      ) : round.status === 'CLOSED' ? (
        <VoteResult round={round} />
      ) : null}
    </article>
  );
}

/** 展示关闭投票后的公开统计与结论。 */
function VoteResult({ round }: { round: DecisionVoteRound }) {
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex items-center gap-2 text-xs font-medium"><BarChart3 className="size-4" aria-hidden />{round.result ? outcomeText[round.result.outcome] : '统计已固化'}</div>
      <div className="grid grid-cols-3 gap-2">
        {round.options.map((option) => (
          <div key={option.id} className="rounded-lg bg-muted/60 px-2 py-2 text-center">
            <p className="text-[11px] text-muted-foreground">{option.label}</p>
            <p className="mt-1 text-sm font-semibold">{option.voteCount ?? 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 关闭投票确认框属性。 */
type VoteCloseDialogProps = { decisionId: number; round: DecisionVoteRound; onChanged: () => void };

/** 二次确认关闭投票并固化最终结果。 */
function VoteCloseDialog({ decisionId, round, onChanged }: VoteCloseDialogProps) {
  const [pending, setPending] = useState(false);
  /** 关闭当前投票轮次。 */
  async function handleClose(): Promise<void> {
    setPending(true);
    try {
      await closeProjectSpaceDecisionVoteRound(decisionId, round.id);
      onChanged();
    } finally {
      setPending(false);
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button type="button" size="sm" variant="outline">关闭投票</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>关闭并公布结果？</AlertDialogTitle><AlertDialogDescription>关闭后不再接受新选票，当前票数、法定人数和统计结论会写入决策时间线。</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>继续投票</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={() => void handleClose()}>确认关闭</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 投票统计结论中文文案。 */
const outcomeText = { APPROVED: '统计结果：通过', REJECTED: '统计结果：未通过', TIED: '统计结果：平票', QUORUM_NOT_MET: '统计结果：未达到法定人数' } as const;
