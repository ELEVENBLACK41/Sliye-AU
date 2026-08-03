/**
 * 本文件展示项目会议模块尚未接入真实数据时的结构占位。
 */
import { CalendarDays, Plus, Video } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 渲染项目会议入口和后续会议列表的空状态。 */
export function ProjectMeetingWorkspace() {
  return (
    <section className="grid min-h-[30rem] flex-1 place-items-center bg-white/18 p-6 text-center" aria-labelledby="project-meetings-title">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-black/10 bg-white/65">
          <Video className="size-5" aria-hidden />
        </span>
        <h2 id="project-meetings-title" className="mt-4 text-base font-semibold">项目会议</h2>
        <p className="mt-2 text-xs leading-5 text-black/45">后续这里展示项目会议日程、参会部门以及由群聊发起的临时会议。</p>
        <Button type="button" className="mt-4 rounded-full bg-[#292a27] text-xs text-white">
          <Plus className="size-3.5" aria-hidden /> 新建会议
        </Button>
        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-black/35">
          <CalendarDays className="size-3.5" aria-hidden /> 目前安排了 2 场会议
        </div>
      </div>
    </section>
  );
}
