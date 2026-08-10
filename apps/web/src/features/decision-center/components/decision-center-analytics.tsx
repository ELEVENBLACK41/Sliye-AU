/**
 * 本文件展示跨项目决策过程指标与可解释观察，不对决策内容本身做质量评分。
 */
import { Clock3, FileCheck2, Gauge, Lightbulb, TimerReset, UsersRound, Vote } from 'lucide-react';
import type {
  DecisionCenterAnalyticsResponse,
  DecisionCenterObservation,
  DecisionCenterObservationKind,
} from '@workspace/contracts/decisions';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 分析区属性。 */
type DecisionCenterAnalyticsProps = {
  /** 服务端计算的真实过程分析。 */
  analytics: DecisionCenterAnalyticsResponse;
};

/** 观察类别对应的展示元数据。 */
const observationMeta: Record<DecisionCenterObservationKind, { label: string; icon: typeof Clock3 }> = {
  FASTEST_RESOLUTION: { label: '最快形成决议', icon: Gauge },
  LONGEST_DISCUSSION: { label: '持续讨论最久', icon: TimerReset },
  MOST_PROPOSALS: { label: '提案最充分', icon: Lightbulb },
  MOST_PARTICIPANTS: { label: '参与范围最广', icon: UsersRound },
  RECENT_RESOLUTION: { label: '最近形成决议', icon: FileCheck2 },
  CONSENSUS_WITHOUT_VOTE: { label: '无需投票形成共识', icon: Vote },
};

/** 渲染过程指标和代表性过程观察。 */
export function DecisionCenterAnalytics({ analytics }: DecisionCenterAnalyticsProps) {
  const { metrics } = analytics;
  const metricItems = [
    { label: '平均决策周期', value: formatDays(metrics.averageCycleDays), note: '从创建到正式收口' },
    { label: '讨论时长中位数', value: formatDays(metrics.medianDiscussionDays), note: '从开始讨论到形成决议' },
    { label: '提案采纳率', value: formatPercentage(metrics.proposalAdoptionRate), note: '已结束提案中的采纳比例' },
    { label: '投票闭合率', value: formatPercentage(metrics.voteClosureRate), note: '已开启投票中正常关闭的比例' },
    { label: '正式决议率', value: formatPercentage(metrics.formalResolutionRate), note: '非草稿决策中的正式收口比例' },
    {
      label: '停滞中的决策',
      value: String(metrics.stalledDecisionCount),
      note: `连续 ${analytics.stalledThresholdDays} 天未出现进展`,
    },
  ];

  return (
    <section className="grid gap-3" aria-labelledby="decision-analytics-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-medium tracking-[0.18em] text-muted-foreground">PROCESS LENS</p>
          <h2 id="decision-analytics-title" className="mt-1 text-lg font-medium tracking-tight">
            过程透镜
          </h2>
        </div>
        <p className="max-w-md text-right text-xs leading-5 text-muted-foreground">
          这些指标描述决策如何发生，不替你判断决定是否正确。
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-6">
        {metricItems.map((metric, index) => (
          <Card
            key={metric.label}
            className={`rounded-[1.35rem] py-0 shadow-none ${index === 0 ? 'border-decision-panel bg-decision-panel text-primary-foreground' : 'border-border/70 bg-decision-surface'}`}
          >
            <CardContent className="p-4">
              <p className="text-xs opacity-65">{metric.label}</p>
              <p className="mt-2 text-2xl font-medium tracking-tight">{metric.value}</p>
              <p className="mt-1 text-[0.68rem] leading-4 opacity-60">{metric.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[1.75rem] border-border/70 bg-decision-surface py-0 shadow-none">
        <CardHeader className="gap-1.5 px-5 pt-5 pb-3 sm:px-6">
          <CardTitle className="text-sm">代表性过程切片</CardTitle>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            最多 6 条，每类只取 1 项。入选边界：已形成正式决议、讨论停滞至少 {analytics.stalledThresholdDays}{' '}
            天、至少存在 1
            个提案或参与者；“无需投票形成共识”仅统计已收口且没有投票轮次的决策。同一决策可能成为多个类别的代表；这里不是质量评分。
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6">
          {analytics.observations.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
              形成更多决策过程后，这里会自动出现可回看的代表性样本。
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {analytics.observations.map((observation) => (
                <ObservationCard key={observation.kind} observation={observation} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** 渲染一条过程观察，不提供跨路由跳转。 */
function ObservationCard({ observation }: { observation: DecisionCenterObservation }) {
  const meta = observationMeta[observation.kind];
  const Icon = meta.icon;
  return (
    <li className="rounded-2xl border bg-background/40 p-4">
      <div>
        <span className="grid size-8 place-items-center rounded-full bg-decision-accent-soft text-decision-ink">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{meta.label}</p>
      <p className="mt-1 truncate text-sm font-medium">{observation.decision.title}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{observation.decision.projectTitle}</p>
      <p className="mt-3 text-sm font-medium text-decision-ink">{formatObservationValue(observation)}</p>
    </li>
  );
}

/** 格式化观察类别对应的数值或日期。 */
function formatObservationValue(observation: DecisionCenterObservation): string {
  if (observation.kind === 'RECENT_RESOLUTION' || observation.kind === 'CONSENSUS_WITHOUT_VOTE') {
    return observation.occurredAt
      ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(observation.occurredAt))
      : '—';
  }
  if (observation.kind === 'MOST_PROPOSALS') return `${observation.value ?? 0} 个提案`;
  if (observation.kind === 'MOST_PARTICIPANTS') return `${observation.value ?? 0} 位参与者`;
  return formatDays(observation.value);
}

/** 格式化天数指标。 */
function formatDays(value: number | null): string {
  return value === null ? '—' : `${value} 天`;
}

/** 格式化百分比指标。 */
function formatPercentage(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}
