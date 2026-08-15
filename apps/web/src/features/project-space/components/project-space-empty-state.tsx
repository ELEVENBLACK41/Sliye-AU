/**
 * 本文件展示用户暂无可见项目时的项目空间空状态。
 */
import { FolderKanban } from 'lucide-react';

import type { ProjectCreateDepartmentOption } from '../types/project-space.type';
import { ProjectCreateSheet } from './project-create-sheet';

/** 项目空间空状态属性。 */
type ProjectSpaceEmptyStateProps = {
  /** 当前用户是否具备创建项目权限。 */
  canCreate: boolean;
  /** 当前用户创建项目时可以选择的启用部门。 */
  createDepartmentOptions: ProjectCreateDepartmentOption[];
};

/** 渲染真实空状态，并按权限提供已验证的项目创建入口。 */
export function ProjectSpaceEmptyState({ canCreate, createDepartmentOptions }: ProjectSpaceEmptyStateProps) {
  return (
    <section className="mt-6 grid min-h-[32rem] place-items-center rounded-[1.4rem] border border-white/70 bg-[#f8f7f2]/82 p-6 text-center shadow-[0_18px_60px_rgba(41,42,39,0.08)]">
      <div className="max-w-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#292a27] text-white">
          <FolderKanban aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold">暂无可见项目</h1>
        <p className="mt-2 text-sm leading-6 text-black/50">创建项目或被加入项目成员后，协作空间会显示在这里。</p>
        {canCreate ? (
          <ProjectCreateSheet departments={createDepartmentOptions} placement="empty" />
        ) : null}
      </div>
    </section>
  );
}
