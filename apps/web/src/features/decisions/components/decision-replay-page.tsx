/**
 * 本文件实现决策全过程回放页，把事件、提案、投票和正式结论还原为可读时间序列。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleCheckBig, Clock3, FileText, Gavel, History, Vote } from 'lucide-react';
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionEventType,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策回放页组件属性。 */
type DecisionReplayPageProps = {
  /** 已完成数据范围校验的决策详情。 */
  decision: DecisionDetail;
  /** 当前决策的完整事件时间线。 */
  events: DecisionEventTimelineItem[];
  /** 当前决策的全部提案。 */
  proposals: DecisionProposal[];
  /** 当前决策的全部投票轮次。 */
  voteRounds: DecisionVoteRound[];
  /** 当前决策的全部正式决议。 */
  resolutions: DecisionResolution[];
};

/** 决策事件类型对应的中文动作名称。 */
const eventTypeText: Record<DecisionEventType, string> = {
  DECISION_CREATED: '创建决策',
  DECISION_UPDATED: '更新决策',
  STATUS_CHANGED: '状态变更',
  PARTICIPANT_ADDED: '添加参与者',
  PARTICIPANT_REMOVED: '移除参与者',
  PROPOSAL_CREATED: '创建提案',
  PROPOSAL_UPDATED: '更新提案',
  VOTE_ROUND_CREATED: '创建投票轮次',
  VOTE_ROUND_OPENED: '开放投票',
  VOTE_ROUND_CLOSED: '结束投票轮次',
  VOTE_CAST: '提交投票',
  RESOLUTION_CREATED: '形成正式决议',
  RESOLUTION_SUPERSEDED: '替代正式决议',
  RESOLUTION_REVOKED: '撤销正式决议',
  TASK_CREATED: '创建任务',
  TASK_UPDATED: '更新任务',
  SPACE_LINKED: '关联讨论空间',
  MESSAGE_PINNED: '置顶重要消息',
  MEETING_STARTED: '开始会议',
  MEETING_ENDED: '结束会议',
  RECORDING_READY: '会议录像已就绪',
  AI_SUMMARY_CREATED: '生成 AI 摘要',
};

/** 渲染决策结论摘要和按发生时间排列的全过程事件。 */
export function DecisionReplayPage({ decision, events, proposals, voteRounds, resolutions }: DecisionReplayPageProps) {
  const activeResolution = resolutions.find((resolution) => resolution.status === 'ACTIVE');
  const orderedEvents = [...events].sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
  );

  return (
    <main className="flex flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/matters/${decision.matterId}/decisions/${decision.id}`}>
            <ArrowLeft aria-hidden />
            返回决策详情
          </Link>
        </Button>
      </div>

      <Card className="rounded-md shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <History className="size-4" aria-hidden />
                决策全过程回放 · #{decision.id}
              </p>
              <CardTitle className="mt-1 text-2xl">{decision.title}</CardTitle>
            </div>
            <Badge>{decision.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            从创建、参与讨论、提案、投票到正式结论，按真实发生顺序还原这项决策。
          </p>
        </CardHeader>
      </Card>

      {activeResolution ? (
        <Card className="rounded-md border-primary/30 bg-primary/5 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleCheckBig className="size-5 text-primary" aria-hidden />
              最终结论：{activeResolution.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="whitespace-pre-wrap text-sm leading-7">{activeResolution.content}</p>
            <p className="text-xs text-muted-foreground">
              {activeResolution.decidedBy.name || `用户 ${activeResolution.decidedBy.id}`} 于{' '}
              {formatDateTime(activeResolution.decidedAt)} 正式确认
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-md shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="size-4" aria-hidden />
            过程记录（{orderedEvents.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orderedEvents.length ? (
            <ol className="relative ms-3 border-s border-border">
              {orderedEvents.map((event) => (
                <ReplayEventItem
                  key={event.id}
                  event={event}
                  proposal={proposals.find((item) => item.id === event.proposalId)}
                  voteRound={voteRounds.find((item) => item.id === event.voteRoundId)}
                  resolution={resolutions.find((item) => item.id === event.resolutionId)}
                />
              ))}
            </ol>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
              <Clock3 className="size-7 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">暂无可回放事件</p>
              <p className="text-sm text-muted-foreground">关键操作发生后会按时间顺序记录在这里。</p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/** 单条回放事件组件属性。 */
type ReplayEventItemProps = {
  /** 当前时间线事件。 */
  event: DecisionEventTimelineItem;
  /** 事件关联的提案。 */
  proposal?: DecisionProposal;
  /** 事件关联的投票轮次。 */
  voteRound?: DecisionVoteRound;
  /** 事件关联的正式决议。 */
  resolution?: DecisionResolution;
};

/** 渲染单个事件及其关联业务对象和状态变化。 */
function ReplayEventItem({ event, proposal, voteRound, resolution }: ReplayEventItemProps) {
  const actorName = event.actor?.name || (event.actor ? `用户 ${event.actor.id}` : '系统');
  const changeSummary = getChangeSummary(event);

  return (
    <li className="relative ms-7 pb-7 last:pb-0">
      <span
        className="absolute top-1.5 -start-[2.05rem] size-3 rounded-full border-2 border-background bg-primary"
        aria-hidden
      />
      <article className="grid gap-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{event.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {actorName} · <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
            </p>
          </div>
          <Badge variant="secondary">{eventTypeText[event.type]}</Badge>
        </div>

        {proposal ? <RelatedItem icon={<FileText aria-hidden />} label="关联提案" value={proposal.title} /> : null}
        {voteRound ? <RelatedItem icon={<Vote aria-hidden />} label="关联投票" value={voteRound.title} /> : null}
        {resolution ? <RelatedItem icon={<Gavel aria-hidden />} label="正式决议" value={resolution.title} /> : null}
        {changeSummary ? <p className="rounded-md bg-muted/50 p-3 text-sm">{changeSummary}</p> : null}
      </article>
    </li>
  );
}

/** 关联业务对象展示属性。 */
type RelatedItemProps = {
  /** 业务对象图标。 */
  icon: ReactNode;
  /** 业务对象类型名称。 */
  label: string;
  /** 业务对象标题。 */
  value: string;
};

/** 展示事件关联的提案、投票或正式决议。 */
function RelatedItem({ icon, label, value }: RelatedItemProps) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="[&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      {label}：<span className="font-medium text-foreground">{value}</span>
    </p>
  );
}

/** 从安全快照中提取最常用的状态变化摘要，避免直接暴露原始 JSON。 */
function getChangeSummary(event: DecisionEventTimelineItem): string | null {
  const beforeStatus = typeof event.before?.status === 'string' ? event.before.status : null;
  const afterStatus = typeof event.after?.status === 'string' ? event.after.status : null;

  if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
    return `状态从 ${beforeStatus} 变更为 ${afterStatus}`;
  }

  return null;
}

/** 把 ISO 时间格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
