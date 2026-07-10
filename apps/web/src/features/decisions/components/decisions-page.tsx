/**
 * 本文件实现真实决策列表、创建入口以及加载后的空状态展示。
 */
import Link from 'next/link';
import { ClipboardList, Users } from 'lucide-react';
import type { DecisionSummary } from '@workspace/contracts/decisions';

import type { DecisionDepartmentOption } from './decision-create-form';
import { DecisionCreateForm } from './decision-create-form';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策列表页面属性。 */
type DecisionsPageProps = {
  /** 后端按照数据范围裁剪后的决策列表。 */
  decisions: DecisionSummary[];
  /** 当前用户是否拥有决策创建权限。 */
  canCreate: boolean;
  /** 当前创建范围内可选择的启用部门。 */
  departments: DecisionDepartmentOption[];
};

/** 决策状态的中文文案。 */
const statusText: Record<DecisionSummary['status'], string> = {
  DRAFT: '草稿',
  DISCUSSING: '讨论中',
  VOTING: '投票中',
  DECIDED: '已决策',
  ARCHIVED: '已归档',
};

/** 渲染决策列表和可选创建表单。 */
export function DecisionsPage({ decisions, canCreate, departments }: DecisionsPageProps) {
  return (
    <main className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex min-w-0 flex-col gap-4">
        <div className="rounded-md border bg-background p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-semibold tracking-tight">决策记录</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            列表已经叠加角色范围、直接授权、全局拒绝和参与关系，未授权数据不会返回浏览器。
          </p>
        </div>

        {decisions.length ? (
          <div className="grid gap-3">
            {decisions.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))}
          </div>
        ) : (
          <Card className="rounded-md border-dashed shadow-none">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <ClipboardList className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">当前授权范围内暂无决策</p>
              <p className="text-sm text-muted-foreground">创建决策或被加入参与者后，可见内容会出现在这里。</p>
            </CardContent>
          </Card>
        )}
      </section>

      {canCreate ? <DecisionCreateForm departments={departments} /> : null}
    </main>
  );
}

/** 渲染一条可跳转详情的决策摘要。 */
function DecisionCard({ decision }: { decision: DecisionSummary }) {
  return (
    <Link
      href={`/dashboard/decisions/${decision.id}`}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="rounded-md shadow-none transition-colors hover:border-emerald-600 focus-within:ring-2 focus-within:ring-ring">
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">{decision.title}</CardTitle>
            <Badge variant="secondary">{statusText[decision.status]}</Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{decision.description || '暂无背景说明'}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>{decision.department.name}</span>
          <span>创建人：{decision.creator.name || `用户 ${decision.creator.id}`}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {decision.participantCount} 人参与
          </span>
          <time dateTime={decision.updatedAt}>更新于 {formatDateTime(decision.updatedAt)}</time>
        </CardContent>
      </Card>
    </Link>
  );
}

/** 把 ISO 时间格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
