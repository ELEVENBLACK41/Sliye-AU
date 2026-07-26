/**
 * 本文件展示当前用户加入的议事列表与创建入口。
 */
import Link from 'next/link';
import { CalendarClock, MessagesSquare, Users } from 'lucide-react';
import type { MatterSummary } from '@workspace/contracts/matters';

import { MatterCreateForm, type MatterDepartmentOption } from './matter-create-form';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 议事列表页属性。 */
type MattersPageProps = { matters: MatterSummary[]; canCreate: boolean; departments: MatterDepartmentOption[] };

/** 议事状态中文文案。 */
const statusText: Record<MatterSummary['status'], string> = { ACTIVE: '进行中', CLOSED: '已关闭', ARCHIVED: '已归档' };

/** 渲染议事列表的成功或空状态。 */
export function MattersPage({ matters, canCreate, departments }: MattersPageProps) {
  return (
    <main className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-4">
        <div className="rounded-md border bg-background p-5">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-5 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-semibold">议事空间</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">一项议事统一承载公共与私有讨论、会议和多项决策。</p>
        </div>
        {matters.length ? (
          <div className="grid gap-3">
            {matters.map((matter) => (
              <MatterCard key={matter.id} matter={matter} />
            ))}
          </div>
        ) : (
          <Card className="rounded-md border-dashed shadow-none">
            <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
              <MessagesSquare className="size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">暂无可见议事</p>
              <p className="mt-1 text-sm text-muted-foreground">创建议事或被加入成员后，将在这里显示。</p>
            </CardContent>
          </Card>
        )}
      </section>
      {canCreate ? <MatterCreateForm departments={departments} /> : null}
    </main>
  );
}

/** 渲染一条议事摘要。 */
function MatterCard({ matter }: { matter: MatterSummary }) {
  return (
    <Link
      href={`/dashboard/matters/${matter.id}`}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="rounded-md shadow-none transition-colors hover:border-emerald-600">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{matter.title}</CardTitle>
            <Badge variant="secondary">{statusText[matter.status]}</Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{matter.description || '暂无说明'}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>{matter.department.name}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {matter.memberCount} 人
          </span>
          <span>{matter.decisionCount} 项决策</span>
          <span>{matter.meetingCount} 场会议</span>
          <time className="inline-flex items-center gap-1" dateTime={matter.updatedAt}>
            <CalendarClock className="size-3.5" aria-hidden />
            {formatDateTime(matter.updatedAt)}
          </time>
        </CardContent>
      </Card>
    </Link>
  );
}

/** 格式化议事最近更新时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
