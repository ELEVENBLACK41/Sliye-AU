/**
 * 本文件展示单个决策的只读事件时间线，说明谁在什么时候完成了什么操作。
 */
import { Clock3, History } from 'lucide-react';
import type {
  DecisionEventTimelineItem,
  DecisionEventType,
} from '@workspace/contracts/decisions';

import { Badge } from '@workspace/ui/components/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card';

/** 决策事件类型对应的中文文案。 */
const eventTypeText: Record<DecisionEventType, string> = {
  DECISION_CREATED: '创建决策',
  DECISION_UPDATED: '更新决策',
  STATUS_CHANGED: '状态变更',
  PARTICIPANT_ADDED: '添加参与者',
  PARTICIPANT_REMOVED: '移除参与者',
  PROPOSAL_CREATED: '创建提案',
  PROPOSAL_UPDATED: '更新提案',
  VOTE_CAST: '提交投票',
  VOTE_CLOSED: '结束投票',
  TASK_CREATED: '创建任务',
  TASK_UPDATED: '更新任务',
  MEETING_STARTED: '开始会议',
  MEETING_ENDED: '结束会议',
  AI_SUMMARY_CREATED: '生成 AI 摘要',
};

/** 决策事件时间线组件属性。 */
type DecisionEventTimelineProps = {
  /** 已经过权限与数据范围校验的事件列表。 */
  events: DecisionEventTimelineItem[];
};

/** 渲染决策事件时间线的空状态或成功状态。 */
export function DecisionEventTimeline({ events }: DecisionEventTimelineProps) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden />
          事件时间线（{events.length}）
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length ? (
          <ol className="relative ms-2 border-s border-border">
            {events.map((event) => (
              <DecisionEventItem key={event.id} event={event} />
            ))}
          </ol>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
            <Clock3 className="size-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">暂无事件记录</p>
            <p className="text-xs text-muted-foreground">后续关键操作会按照发生时间记录在这里。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 渲染时间线中的单个决策事件。 */
function DecisionEventItem({ event }: { event: DecisionEventTimelineItem }) {
  const actorName = event.actor?.name || (event.actor ? `用户 ${event.actor.id}` : '系统');

  return (
    <li className="relative ms-6 pb-6 last:pb-0">
      <span
        className="absolute top-1.5 -start-[1.75rem] size-3 rounded-full border-2 border-background bg-primary"
        aria-hidden
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">操作者：{actorName}</p>
        </div>
        <Badge variant="secondary">{eventTypeText[event.type]}</Badge>
      </div>
      <time className="mt-2 block text-xs text-muted-foreground" dateTime={event.occurredAt}>
        {formatDateTime(event.occurredAt)}
      </time>
    </li>
  );
}

/** 把 ISO 时间格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
