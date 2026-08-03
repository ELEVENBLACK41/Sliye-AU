/**
 * 本文件展示项目空间左侧的搜索、项目切换和创建入口。
 */
import { Plus, Search } from 'lucide-react';

import { projectSpaceProjects } from '../project-space.constants';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';

/** 渲染项目空间左侧项目导航。 */
export function ProjectListPanel() {
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
            placeholder="搜索项目"
            className="h-9 rounded-xl border-black/10 bg-white/45 pl-9 shadow-none placeholder:text-black/35"
          />
        </label>
        <div className="mt-4 flex items-center justify-between px-1 text-xs text-black/45">
          <span>项目</span>
          <span>{projectSpaceProjects.length + 8}</span>
        </div>
      </div>

      <nav className="min-w-0 px-2 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-0" aria-label="可访问项目">
        <ul className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {projectSpaceProjects.map((project, index) => (
            <li key={project.id} className="w-52 shrink-0 lg:w-auto">
              <button
                type="button"
                aria-current={index === 0 ? 'page' : undefined}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${
                  index === 0
                    ? 'border-[#e4bd42]/45 bg-[#fff7da]/75 shadow-[inset_3px_0_0_#efb900]'
                    : 'border-transparent hover:border-black/8 hover:bg-white/35'
                }`}
              >
                <span className="block truncate text-sm font-semibold text-[#292a27]">{project.title}</span>
                <span className="mt-1.5 block text-xs text-black/45">
                  {project.status} · {project.decisionCount} 项决策
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-3">
        <Button type="button" className="h-10 w-full rounded-full bg-[#f5bf19] text-[#292a27] shadow-none hover:bg-[#eeb50b]">
          <Plus className="size-4" aria-hidden />
          新建项目
        </Button>
      </div>
    </aside>
  );
}
