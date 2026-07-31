/**
 * 本文件展示当前用户加入的项目列表与创建入口。
 */
import Link from 'next/link';
import { CalendarClock, MessagesSquare, Users } from 'lucide-react';
import type { ProjectSummary } from '@workspace/contracts/projects';

import { ProjectCreateForm, type ProjectDepartmentOption } from './project-create-form';
import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 项目列表页属性。 */
type ProjectsPageProps = { projects: ProjectSummary[]; canCreate: boolean; departments: ProjectDepartmentOption[] };

/** 项目状态中文文案。 */
const statusText: Record<ProjectSummary['status'], string> = { ACTIVE: '进行中', CLOSED: '已关闭', ARCHIVED: '已归档' };

/** 渲染项目列表的成功或空状态。 */
export function ProjectsPage({ projects, canCreate, departments }: ProjectsPageProps) {
  return (
    <main className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-4">
        <div className="rounded-md border bg-background p-5">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-5 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-semibold">项目空间</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">一项项目统一承载公共与私有讨论、会议和多项决策。</p>
        </div>
        {projects.length ? (
          <div className="grid gap-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <Card className="rounded-md border-dashed shadow-none">
            <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
              <MessagesSquare className="size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">暂无可见项目</p>
              <p className="mt-1 text-sm text-muted-foreground">创建项目或被加入成员后，将在这里显示。</p>
            </CardContent>
          </Card>
        )}
      </section>
      {canCreate ? <ProjectCreateForm departments={departments} /> : null}
    </main>
  );
}

/** 渲染一条项目摘要。 */
function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="rounded-md shadow-none transition-colors hover:border-emerald-600">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{project.title}</CardTitle>
            <Badge variant="secondary">{statusText[project.status]}</Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.description || '暂无说明'}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>{project.department.name}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            {project.memberCount} 人
          </span>
          <span>{project.decisionCount} 项决策</span>
          <span>{project.meetingCount} 场会议</span>
          <time className="inline-flex items-center gap-1" dateTime={project.updatedAt}>
            <CalendarClock className="size-3.5" aria-hidden />
            {formatDateTime(project.updatedAt)}
          </time>
        </CardContent>
      </Card>
    </Link>
  );
}

/** 格式化项目最近更新时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
