/**
 * 本文件展示决策提案列表、空状态和具备权限时的创建入口。
 */
import { FileText } from 'lucide-react';
import type { DecisionProposal } from '@workspace/contracts/decisions';

import { DecisionProposalActions } from './decision-proposal-actions';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策提案列表组件属性。 */
type DecisionProposalSectionProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前决策按照创建时间排序的提案列表。 */
  proposals: DecisionProposal[];
  /** 当前用户是否具备创建提案的展示条件；最终权限仍由 NestJS 校验。 */
  canCreateProposal: boolean;
};

/** 提案状态对应的中文名称和徽标样式。 */
const proposalStatusView: Record<
  DecisionProposal['status'],
  {
    /** 面向用户展示的中文状态。 */
    label: string;
    /** shadcn Badge 使用的视觉变体。 */
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  OPEN: { label: '开放中', variant: 'secondary' },
  ACCEPTED: { label: '已采纳', variant: 'default' },
  REJECTED: { label: '已拒绝', variant: 'destructive' },
  CANCELLED: { label: '已取消', variant: 'outline' },
};

/** 渲染决策提案列表，并在没有数据时展示明确空状态。 */
export function DecisionProposalSection({ decisionId, proposals, canCreateProposal }: DecisionProposalSectionProps) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">提案（{proposals.length}）</CardTitle>
        {canCreateProposal ? <DecisionProposalActions decisionId={decisionId} /> : null}
      </CardHeader>
      <CardContent>
        {proposals.length ? (
          <ul className="grid gap-3">
            {proposals.map((proposal) => {
              const statusView = proposalStatusView[proposal.status];

              return (
                <li key={proposal.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{proposal.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        由 {proposal.creator.name || `用户 ${proposal.creator.id}`} 创建于{' '}
                        {formatDateTime(proposal.createdAt)}
                      </p>
                    </div>
                    <Badge variant={statusView.variant}>{statusView.label}</Badge>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {proposal.description || '暂无提案说明'}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">暂无提案</p>
            <p className="text-sm text-muted-foreground">
              {canCreateProposal ? '创建第一条候选方案，开始记录讨论方向。' : '当前决策还没有记录候选方案。'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 把 ISO 时间格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
