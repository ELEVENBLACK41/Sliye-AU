/**
 * 本文件展示项目内部的讨论、决策与会议一级导航。
 */
'use client';

import type { MouseEvent } from 'react';
import { CalendarDays, GitBranch, MessageCircle } from 'lucide-react';

import type { ProjectSectionKey } from '../types/project-space.type';

/** 项目内部一级导航属性。 */
type ProjectSectionNavigationProps = {
  /** 当前正在展示的项目模块。 */
  activeSection: ProjectSectionKey;
  /** 用户选择项目模块时触发的状态更新。 */
  onSectionChange: (section: ProjectSectionKey) => void;
};

/** 项目内部一级导航的展示配置。 */
const projectSections = [
  { key: 'discussion', label: '讨论', count: 12, icon: MessageCircle },
  { key: 'decisions', label: '决策', count: 4, icon: GitBranch },
  { key: 'meetings', label: '会议', count: 2, icon: CalendarDays },
] satisfies Array<{ key: ProjectSectionKey; label: string; count: number; icon: typeof MessageCircle }>;

/** 渲染当前项目内部的模块切换入口。 */
export function ProjectSectionNavigation({ activeSection, onSectionChange }: ProjectSectionNavigationProps) {
  /** 根据按钮携带的模块标识切换中央工作区域。 */
  function handleSectionClick(event: MouseEvent<HTMLButtonElement>): void {
    onSectionChange(event.currentTarget.dataset.sectionKey as ProjectSectionKey);
  }

  return (
    <nav className="mt-3 w-full max-w-full overflow-x-auto" aria-label="项目内部导航">
      <ul className="flex w-max min-w-full items-center gap-1">
        {projectSections.map((section) => {
          const isActive = activeSection === section.key;
          const Icon = section.icon;

          return (
            <li key={section.key}>
              <button
                type="button"
                data-section-key={section.key}
                aria-current={isActive ? 'page' : undefined}
                onClick={handleSectionClick}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${
                  isActive ? 'bg-[#292a27] text-white' : 'text-black/50 hover:bg-white/55 hover:text-black/80'
                }`}
              >
                <Icon className="size-3.5" aria-hidden />
                {section.label}
                <span
                  className={`grid min-w-4 place-items-center rounded-full px-1 text-[9px] ${
                    isActive ? 'bg-white/18 text-white/75' : 'bg-black/7 text-black/45'
                  }`}
                >
                  {section.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
