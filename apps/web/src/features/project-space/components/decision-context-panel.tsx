/**
 * 本文件展示当前选中议题的摘要、成员与后续查看入口。
 */
import { ExternalLink, MessageCircle, UsersRound, X } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 参与成员的线框头像标识。 */
const participantInitials = ['李', '周', '陈', '许'];

/** 渲染当前议题的右侧上下文详情面板。 */
export function DecisionContextPanel() {
  return (
    <aside className="flex min-h-0 flex-col border-t border-black/10 bg-white/35 lg:border-t-0 lg:border-l" aria-labelledby="context-title">
      <header className="flex items-start gap-3 px-4 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f5bf19] text-[#292a27]">
          <UsersRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="context-title" className="truncate text-sm font-semibold">邀请机制优化</h2>
          <span className="mt-1 inline-flex rounded border border-sky-300/60 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-600">讨论中</span>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7 rounded-full text-black/40" aria-label="关闭议题详情">
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-4 px-4 py-5 text-xs">
        <dt className="text-black/40">创建人</dt><dd>李思远</dd>
        <dt className="text-black/40">创建时间</dt><dd><time dateTime="2026-04-18T10:24:00">2026.04.18&nbsp; 10:24</time></dd>
        <dt className="text-black/40">提案数量</dt><dd>3 个</dd>
        <dt className="text-black/40">投票轮次</dt><dd>2 轮</dd>
      </dl>

      <div className="border-t border-black/8 px-4 py-5">
        <h3 className="text-xs font-semibold">决策问题</h3>
        <p className="mt-2 text-xs leading-5 text-black/55">如何优化邀请机制，提升新用户转化率，同时控制激励成本？</p>

        <h3 className="mt-6 text-xs font-semibold">参与成员</h3>
        <div className="mt-3 flex -space-x-1.5" aria-label="参与成员头像组">
          {participantInitials.map((initial, index) => (
            <span key={initial} className={`grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] text-[10px] font-semibold ${index % 2 ? 'bg-slate-300' : 'bg-amber-200'}`}>
              {initial}
            </span>
          ))}
          <span className="grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] bg-black/8 text-[9px] text-black/45">+7</span>
        </div>
      </div>

      <div className="mt-auto space-y-2 p-4">
        <Button type="button" className="h-9 w-full rounded-full bg-[#292a27] text-xs text-white hover:bg-black">
          查看决策 <ExternalLink className="size-3.5" aria-hidden />
        </Button>
        <Button type="button" variant="outline" className="h-9 w-full rounded-full border-black/35 bg-transparent text-xs shadow-none">
          进入讨论 <MessageCircle className="size-3.5" aria-hidden />
        </Button>
      </div>
    </aside>
  );
}
