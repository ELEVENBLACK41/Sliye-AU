/**
 * 本文件展示决策正式结论、来源依据、空状态和负责人闭环入口。
 */
import Link from 'next/link';
import { CircleCheckBig, History, Scale } from 'lucide-react';
import type { DecisionProposal, DecisionResolution, DecisionVoteRound } from '@workspace/contracts/decisions';

import { DecisionResolutionCreateAction } from './decision-resolution-create-action';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 正式决议展示组件属性。 */
type DecisionResolutionSectionProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前决策的全部提案。 */
  proposals: DecisionProposal[];
  /** 当前决策的全部投票轮次。 */
  voteRounds: DecisionVoteRound[];
  /** 当前决策已经形成的正式决议。 */
  resolutions: DecisionResolution[];
  /** 当前用户是否具备形成正式决议的管理权限。 */
  canManageConclusion: boolean;
};

/** 展示最终结论，并提供全过程回放和形成正式决议入口。 */
export function DecisionResolutionSection({
  decisionId,
  proposals,
  voteRounds,
  resolutions,
  canManageConclusion,
}: DecisionResolutionSectionProps) {
  const openProposals = proposals.filter((proposal) => proposal.status === 'OPEN');

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="size-4" aria-hidden />
          正式决议（{resolutions.length}）
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/decisions/${decisionId}/replay`}>
              <History aria-hidden />
              查看过程回放
            </Link>
          </Button>
          {canManageConclusion ? (
            <DecisionResolutionCreateAction
              decisionId={decisionId}
              proposals={openProposals}
              voteRounds={voteRounds}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {resolutions.length ? (
          <ol className="grid gap-4">
            {resolutions.map((resolution) => {
              const proposal = proposals.find((item) => item.id === resolution.sourceProposalId);
              const voteRound = voteRounds.find((item) => item.id === resolution.sourceVoteRoundId);

              return (
                <li key={resolution.id} className="grid gap-4 rounded-md border border-primary/30 bg-primary/5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold">
                        <CircleCheckBig className="size-5 text-primary" aria-hidden />
                        {resolution.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        由 {resolution.decidedBy.name || `用户 ${resolution.decidedBy.id}`} 于{' '}
                        {formatDateTime(resolution.decidedAt)} 正式确认
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge>{resolution.kind === 'FINAL' ? '最终决议' : resolution.kind}</Badge>
                      <Badge variant="outline">{resolution.status === 'ACTIVE' ? '当前有效' : resolution.status}</Badge>
                    </div>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-7">{resolution.content}</p>

                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <ResolutionSourceItem label="采纳提案" value={proposal?.title || '来源提案已不可用'} />
                    <ResolutionSourceItem label="来源投票" value={voteRound?.title || '未关联投票，由负责人直接确认'} />
                  </dl>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
            <Scale className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">尚未形成正式结论</p>
            <p className="max-w-xl text-sm text-muted-foreground">
              {canManageConclusion
                ? '负责人可以采纳一条开放提案，按需关联已关闭投票，并写下最终结论完成决策闭环。'
                : '提案和投票是讨论证据，只有形成正式决议后，这项决策才真正闭环。'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 展示正式决议的一项来源依据。 */
function ResolutionSourceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background p-3">
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
