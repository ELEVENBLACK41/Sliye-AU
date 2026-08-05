/**
 * 本文件展示项目空间左侧的真实项目搜索、切换和创建入口。
 */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderSearch, Search } from 'lucide-react';
import type { ProjectSummary } from '@workspace/contracts/projects';

import { Input } from '@workspace/ui/components/input';
import type { ProjectCreateDepartmentOption } from '../types/project-space.type';
import { ProjectCreateSheet } from './project-create-sheet';

/** 项目列表面板属性。 */
type ProjectListPanelProps = {
  /** 当前用户可见的项目。 */
  projects: ProjectSummary[];
  /** 当前选中项目主键。 */
  currentProjectId: number;
  /** 当前用户是否可以创建项目。 */
  canCreate: boolean;
  /** 当前用户创建项目时可以选择的启用部门。 */
  createDepartmentOptions: ProjectCreateDepartmentOption[];
};

/** 项目状态中文文案。 */
const statusText: Record<ProjectSummary['status'], string> = {
  ACTIVE: '进行中',
  CLOSED: '已关闭',
  ARCHIVED: '已归档',
};

/** 渲染项目空间左侧项目导航，并在本地完成轻量搜索。 */
export function ProjectListPanel({
  projects,
  currentProjectId,
  canCreate,
  createDepartmentOptions,
}: ProjectListPanelProps) {
  const [keyword, setKeyword] = useState('');
  const filteredProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('zh-CN');
    if (!normalizedKeyword) return projects;

    return projects.filter((project) => project.title.toLocaleLowerCase('zh-CN').includes(normalizedKeyword));
  }, [keyword, projects]);

  return (
    <aside
      className="flex min-w-0 shrink-0 flex-col border-b border-black/10 bg-white/28 lg:min-h-0 lg:border-r lg:border-b-0"
      aria-label="项目列表"
    >
      <div className="p-3">
        <label className="relative block" htmlFor="project-search">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-black/35" aria-hidden />
          <Input
            id="project-search"
            type="search"
            value={keyword}
            placeholder="搜索项目"
            className="h-9 rounded-xl border-black/10 bg-white/45 pl-9 shadow-none placeholder:text-black/35"
            onChange={(event) => setKeyword(event.currentTarget.value)}
          />
        </label>
        <div className="mt-4 flex items-center justify-between px-1 text-xs text-black/45">
          <span>项目</span>
          <span>{projects.length}</span>
        </div>
      </div>

      <nav className="min-w-0 px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0" aria-label="可访问项目">
        {filteredProjects.length ? (
          <ul className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {filteredProjects.map((project) => {
              const isCurrent = project.id === currentProjectId;
              return (
                <li key={project.id} className="w-52 shrink-0 lg:w-auto">
                  <Link
                    href={`/projects?projectId=${project.id}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`block w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${
                      isCurrent
                        ? 'border-[#e4bd42]/45 bg-[#fff7da]/75 shadow-[inset_3px_0_0_#efb900]'
                        : 'border-transparent hover:border-black/8 hover:bg-white/35'
                    }`}
                  >
                    <span className="block truncate text-sm font-semibold text-[#292a27]">{project.title}</span>
                    <span className="mt-1.5 block text-xs text-black/45">
                      {statusText[project.status]} · {project.decisionCount} 项决策
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="grid min-h-32 place-items-center px-3 text-center text-xs text-black/45">
            <div>
              <FolderSearch className="mx-auto mb-2 size-5" aria-hidden />
              没有匹配的项目
            </div>
          </div>
        )}
      </nav>

      {canCreate ? (
        <div className="p-3">
          <ProjectCreateSheet departments={createDepartmentOptions} placement="sidebar" />
        </div>
      ) : null}
    </aside>
  );
}
