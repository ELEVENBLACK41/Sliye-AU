/**
 * 本文件展示决策投票轮次、开放操作、最终统计与明确空状态。
 */
import { ShieldCheck, Vote } from 'lucide-react';
import type { DecisionProposal, DecisionVoteRound } from '@workspace/contracts/decisions';

import { DecisionVoteCreateAction } from './decision-vote-create-action';
import { DecisionVoteRoundActions } from './decision-vote-round-actions';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策投票区域组件属性。 */
type DecisionVoteSectionProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前决策的全部提案。 */
  proposals: DecisionProposal[];
  /** 当前决策的全部投票轮次。 */
  voteRounds: DecisionVoteRound[];
  /** 当前用户是否具备创建与关闭轮次的管理权限。 */
  canManageVoteRounds: boolean;
  /** 当前用户是否具备提交选票的参与身份。 */
  canVote: boolean;
  /** 可选的当前会议主键，用于标记房间内新投票。 */
  meetingId?: number;
};

/** 投票轮次状态对应的中文名称和徽标样式。 */
const voteRoundStatusView: Record<
  DecisionVoteRound['status'],
  {
    /** 面向用户展示的中文状态。 */
    label: string;
    /** shadcn Badge 使用的视觉变体。 */
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  DRAFT: { label: '草稿', variant: 'outline' },
  OPEN: { label: '投票中', variant: 'default' },
  CLOSED: { label: '已关闭', variant: 'secondary' },
  CANCELLED: { label: '已取消', variant: 'destructive' },
};

/** 关闭投票后的统计结论中文名称。 */
const voteOutcomeText: Record<NonNullable<DecisionVoteRound['result']>['outcome'], string> = {
  APPROVED: '赞成票领先',
  REJECTED: '反对票领先',
  TIED: '赞成与反对票相同',
  QUORUM_NOT_MET: '未达到最少有效票数',
};

/** 渲染全部投票轮次，并按当前身份提供发起、提交和关闭入口。 */
export function DecisionVoteSection({
  decisionId,
  proposals,
  voteRounds,
  canManageVoteRounds,
  canVote,
  meetingId,
}: DecisionVoteSectionProps) {
  const openProposalIds = new Set(
    voteRounds.filter((round) => round.status === 'OPEN').map((round) => round.proposalId),
  );
  const availableProposals = proposals.filter(
    (proposal) => proposal.status === 'OPEN' && !openProposalIds.has(proposal.id),
  );

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">投票（{voteRounds.length}）</CardTitle>
        {canManageVoteRounds ? (
          <DecisionVoteCreateAction decisionId={decisionId} proposals={availableProposals} meetingId={meetingId} />
        ) : null}
      </CardHeader>
      <CardContent>
        {voteRounds.length ? (
          <ul className="grid gap-4">
            {voteRounds.map((round) => {
              const statusView = voteRoundStatusView[round.status];
              const proposal = proposals.find((item) => item.id === round.proposalId);

              return (
                <li key={round.id} className="grid gap-4 rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{round.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {proposal ? `关联提案：${proposal.title}` : '未关联具体提案'} · 由{' '}
                        {round.creator.name || `用户 ${round.creator.id}`} 创建
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {round.isAnonymous ? <Badge variant="outline">匿名</Badge> : null}
                      <Badge variant={statusView.variant}>{statusView.label}</Badge>
                    </div>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {round.description || '暂无投票说明'}
                  </p>

                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <VoteSummaryItem label="投票方式" value="单选" />
                    <VoteSummaryItem
                      label="最少有效票数"
                      value={round.quorumCount === null ? '不限制' : `${round.quorumCount} 票`}
                    />
                    <VoteSummaryItem
                      label={round.status === 'CLOSED' ? '关闭时间' : '开启时间'}
                      value={formatDateTime(round.closedAt ?? round.openedAt ?? round.createdAt)}
                    />
                  </dl>

                  {round.result ? (
                    <div className="grid gap-3 rounded-md bg-muted/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <ShieldCheck className="size-4" aria-hidden />
                          {voteOutcomeText[round.result.outcome]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          共 {round.result.totalBallots} 票 ·{' '}
                          {round.result.quorumMet ? '已达到有效票数' : '未达到有效票数'}
                        </p>
                      </div>
                      <ul className="grid gap-2 sm:grid-cols-3">
                        {round.options.map((option) => (
                          <li
                            key={option.id}
                            className="flex items-center justify-between rounded-md border bg-background p-3"
                          >
                            <span className="text-sm">{option.label}</span>
                            <Badge variant="secondary">{option.voteCount ?? 0} 票</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <ul className="flex flex-wrap gap-2" aria-label="本轮投票选项">
                      {round.options.map((option) => (
                        <li key={option.id}>
                          <Badge variant="outline">{option.label}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}

                  {round.status === 'OPEN' ? (
                    <DecisionVoteRoundActions
                      decisionId={decisionId}
                      round={round}
                      canVote={canVote}
                      canClose={canManageVoteRounds}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
            <Vote className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">暂无投票</p>
            <p className="text-sm text-muted-foreground">
              {canManageVoteRounds ? '为开放提案发起第一轮投票，开始收集参与者意见。' : '当前决策还没有开启投票。'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 渲染投票轮次中的单个摘要字段。 */
function VoteSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

/** 把 ISO 时间格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
