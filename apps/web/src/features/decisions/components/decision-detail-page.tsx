/**
 * 本文件实现决策详情展示；资源不存在和越权均在后端以同一个 404 结果处理。
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, UserRound } from 'lucide-react';
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
} from '@workspace/contracts/decisions';

import { DecisionEventTimeline } from './decision-event-timeline';
import { DecisionStatusActions } from './decision-status-actions';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策详情组件属性。 */
type DecisionDetailPageProps = {
  /** 已经过权限与数据范围校验的决策详情。 */
  decision: DecisionDetail;
  /** 已经过权限与数据范围校验的决策事件时间线。 */
  events: DecisionEventTimelineItem[];
  /** 当前用户是否具备开始讨论的展示条件；最终权限仍由 NestJS 校验。 */
  canStartDiscussion: boolean;
};

/** 参与者身份对应的中文文案。 */
const participantRoleText: Record<DecisionDetail['participants'][number]['role'], string> = {
  VIEWER: '查看者',
  EDITOR: '编辑者',
  APPROVER: '审批人',
  OWNER: '负责人',
};

/** 渲染决策基本资料、参与者列表和只读事件时间线。 */
export function DecisionDetailPage({
  decision,
  events,
  canStartDiscussion,
}: DecisionDetailPageProps) {
  return (
    <main className="flex flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/decisions">
            <ArrowLeft aria-hidden />
            返回决策列表
          </Link>
        </Button>
      </div>

      <Card className="rounded-md shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">决策 #{decision.id}</p>
              <CardTitle className="mt-1 text-2xl">{decision.title}</CardTitle>
            </div>
            <Badge>{decision.status}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {decision.description || '暂无背景说明'}
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem label="所属部门" value={decision.department.name} icon={<Building2 aria-hidden />} />
          <SummaryItem
            label="创建人"
            value={decision.creator.name || `用户 ${decision.creator.id}`}
            icon={<UserRound aria-hidden />}
          />
          <SummaryItem label="负责人" value={decision.owner?.name || '未指定'} icon={<UserRound aria-hidden />} />
          <SummaryItem label="创建时间" value={formatDateTime(decision.createdAt)} />
        </CardContent>
      </Card>

      {canStartDiscussion ? <DecisionStatusActions decisionId={decision.id} /> : null}

      <Card className="rounded-md shadow-none">
        <CardHeader>
          <CardTitle className="text-base">参与者（{decision.participants.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {decision.participants.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {decision.participants.map((participant) => (
                <li key={participant.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {participant.user.name || `用户 ${participant.user.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">加入于 {formatDateTime(participant.createdAt)}</p>
                  </div>
                  <Badge variant="secondary">{participantRoleText[participant.role]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无参与者</p>
          )}
        </CardContent>
      </Card>

      <DecisionEventTimeline events={events} />
    </main>
  );
}

/** 渲染决策详情中的单个摘要字段。 */
function SummaryItem({
  label,
  value,
  icon,
}: {
  /** 字段中文名称。 */
  label: string;
  /** 字段展示值。 */
  value: string;
  /** 可选的辅助图标。 */
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-medium">
        {icon ? <span className="[&>svg]:size-4">{icon}</span> : null}
        {value}
      </p>
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
