/**
 * 本文件展示当前项目的基础信息、协作部门和项目成员。
 */
import { Building2, FolderKanban, UsersRound } from 'lucide-react';

/** 项目参与成员的线框头像标识。 */
const projectMemberInitials = ['李', '周', '陈', '许'];

/** 渲染项目空间右侧的项目级信息。 */
export function ProjectOverviewPanel() {
  return (
    <aside
      className="flex min-h-[34rem] min-w-0 shrink-0 flex-col border-t border-black/10 bg-white/35 lg:min-h-0 lg:shrink lg:overflow-y-auto lg:border-t-0 lg:border-l"
      aria-labelledby="project-overview-title"
    >
      <header className="flex items-start gap-3 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#292a27] text-white">
          <FolderKanban className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-black/40">当前项目</p>
          <h2 id="project-overview-title" className="mt-0.5 text-sm font-semibold">
            产品体验升级计划
          </h2>
          <span className="mt-1.5 inline-flex rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
            进行中
          </span>
        </div>
      </header>

      <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-3 border-t border-black/8 px-4 py-4 text-xs">
        <dt className="text-black/40">负责人</dt>
        <dd>李思远</dd>
        <dt className="text-black/40">成员</dt>
        <dd>12 人</dd>
        <dt className="text-black/40">决策</dt>
        <dd>7 项已决议 · 1 项已废弃</dd>
        <dt className="text-black/40">会议</dt>
        <dd>2 场已安排</dd>
        <dt className="text-black/40">群组</dt>
        <dd>3 个讨论群组</dd>
      </dl>

      <section className="border-t border-black/8 px-4 py-4" aria-labelledby="departments-title">
        <h3 id="departments-title" className="flex items-center gap-1.5 text-xs font-semibold">
          <Building2 className="size-3.5" aria-hidden />
          协作部门
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['产品部', '研发部', '设计部'].map((department) => (
            <span key={department} className="rounded-full border border-black/10 bg-white/55 px-2 py-1 text-[10px] text-black/55">
              {department}
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-black/8 px-4 py-4" aria-labelledby="project-members-title">
        <h3 id="project-members-title" className="flex items-center gap-1.5 text-xs font-semibold">
          <UsersRound className="size-3.5" aria-hidden />
          项目成员
        </h3>
        <div className="mt-3 flex -space-x-1.5" aria-label="项目成员头像组">
          {projectMemberInitials.map((initial, index) => (
            <span
              key={initial}
              className={`grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] text-[10px] font-semibold ${
                index % 2 ? 'bg-slate-300' : 'bg-amber-200'
              }`}
            >
              {initial}
            </span>
          ))}
          <span className="grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] bg-black/8 text-[9px] text-black/45">
            +8
          </span>
        </div>
      </section>

    </aside>
  );
}
