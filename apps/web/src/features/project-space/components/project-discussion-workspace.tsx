/**
 * 本文件展示项目群组列表、聊天消息与消息转议题和提案的讨论链路线框。
 */
import {
  ArrowRight,
  FileText,
  Hash,
  Lightbulb,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  UsersRound,
  Video,
} from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';

/** 项目讨论区内的群组线框数据。 */
const discussionGroups = [
  { id: 'all-members', name: '项目全员群', meta: '12 位成员', unreadCount: 8, active: true },
  { id: 'product-engineering', name: '产品 × 研发', meta: '跨部门群组', unreadCount: 3, active: false },
  { id: 'design', name: '设计部协作群', meta: '部门群组', unreadCount: 1, active: false },
] as const;

/** 渲染项目讨论模块的群组选择、消息流和消息输入区域。 */
export function ProjectDiscussionWorkspace() {
  return (
    <div className="grid min-h-[44rem] min-w-0 flex-1 grid-cols-[minmax(0,1fr)] bg-white/18 md:min-h-[38rem] md:grid-cols-[12rem_minmax(0,1fr)] lg:min-h-0">
      <aside className="min-w-0 border-b border-black/8 bg-white/30 p-3 md:border-r md:border-b-0" aria-label="项目讨论群组">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold">讨论群组</h2>
            <p className="mt-1 text-[10px] text-black/40">1 个全员群 · 2 个协作群</p>
          </div>
          <Button type="button" variant="outline" size="icon" className="size-7 rounded-lg border-black/10 bg-white/55 shadow-none" aria-label="新建讨论群组">
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>

        <ul className="mt-3 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1 md:block md:space-y-1.5 md:overflow-visible" aria-label="群组列表">
          {discussionGroups.map((group) => (
            <li key={group.id} className="w-44 shrink-0 md:w-auto">
              <button
                type="button"
                aria-current={group.active ? 'page' : undefined}
                className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${
                  group.active ? 'border-[#e5bd37]/50 bg-[#fff6d2]/75' : 'border-transparent hover:bg-white/55'
                }`}
              >
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${group.active ? 'bg-[#f5bf19]' : 'bg-black/7'}`}>
                  {group.id === 'all-members' ? <UsersRound className="size-3.5" aria-hidden /> : <Hash className="size-3.5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{group.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-black/40">{group.meta}</span>
                </span>
                <span className="grid min-w-5 place-items-center rounded-full bg-[#292a27] px-1.5 py-0.5 text-[9px] text-white">
                  {group.unreadCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-[34rem] min-w-0 flex-col" aria-labelledby="active-group-title">
        <header className="flex flex-wrap items-center gap-3 border-b border-black/8 bg-white/28 px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f5bf19]">
            <UsersRound className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="active-group-title" className="text-sm font-semibold">项目全员群</h2>
            <p className="mt-0.5 text-[10px] text-black/40">全部 12 位项目成员 · 3 个部门</p>
          </div>
          <div className="flex items-center gap-1.5" aria-label="群组操作">
            <Button type="button" variant="outline" size="icon" className="size-8 rounded-lg border-black/10 bg-white/55 shadow-none" aria-label="搜索群消息">
              <Search className="size-3.5" aria-hidden />
            </Button>
            <Button type="button" variant="outline" size="icon" className="size-8 rounded-lg border-black/10 bg-white/55 shadow-none" aria-label="发起群会议">
              <Video className="size-3.5" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="更多群组操作">
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-label="项目群聊天消息">
          <div className="text-center text-[10px] text-black/35">今天 10:24</div>

          <article className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-200 text-[10px] font-semibold">李</span>
            <div className="max-w-[78%]">
              <div className="flex items-center gap-2 text-[10px] text-black/40"><span className="font-medium text-black/65">李思远</span><time>10:24</time></div>
              <p className="mt-1 rounded-2xl rounded-tl-sm bg-white/75 px-3 py-2 text-xs leading-5 text-black/70">这轮体验升级涉及产品、研发和设计，邀请机制先在这里统一讨论，结论再进入正式决策。</p>
            </div>
          </article>

          <article className="ml-10 max-w-xl rounded-2xl border border-[#e6bf3c]/45 bg-[#fff8dc]/85 p-3" aria-label="聊天消息发起的议题">
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#f5bf19]">
                <Lightbulb className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-medium text-[#8a6500]">由聊天发起议题</span>
                <h3 className="mt-1 text-sm font-semibold">邀请机制优化</h3>
                <p className="mt-1 text-[11px] leading-4 text-black/50">如何提升新用户转化率，同时控制激励成本？</p>
                <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 rounded-full px-2 text-[10px] text-black/65 hover:bg-black/5">
                  查看议题链路 <ArrowRight className="size-3" aria-hidden />
                </Button>
              </div>
            </div>
          </article>

          <article className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-300 text-[10px] font-semibold">周</span>
            <div className="max-w-[78%]">
              <div className="flex items-center gap-2 text-[10px] text-black/40"><span className="font-medium text-black/65">周然</span><time>10:36</time></div>
              <p className="mt-1 rounded-2xl rounded-tl-sm bg-white/75 px-3 py-2 text-xs leading-5 text-black/70">研发评估可以先做分层邀请，老用户获得固定额度，新用户完成关键行为后再释放奖励。</p>
            </div>
          </article>

          <article className="ml-10 max-w-xl rounded-2xl border border-black/10 bg-white/70 p-3" aria-label="聊天讨论形成的提案">
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#292a27] text-white">
                <FileText className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-medium text-black/40">议题内新增提案</span>
                <h3 className="mt-1 text-sm font-semibold">提案 A：分层邀请与延迟激励</h3>
                <p className="mt-1 text-[11px] text-black/45">创建人：周然 · 等待讨论确认</p>
              </div>
            </div>
          </article>
        </div>

        <footer className="border-t border-black/8 bg-white/35 p-3">
          <div className="rounded-2xl border border-black/10 bg-white/70 p-2 shadow-sm shadow-black/[0.02]">
            <Textarea
              aria-label="发送项目群消息"
              placeholder="发送消息，或从讨论中发起议题、提案……"
              className="min-h-14 resize-none border-0 bg-transparent px-2 py-1 text-xs shadow-none focus-visible:ring-0"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-7 rounded-lg" aria-label="添加附件">
                  <Paperclip className="size-3.5" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[10px]">
                  <Lightbulb className="size-3.5" aria-hidden /> 发起议题
                </Button>
              </div>
              <Button type="button" size="sm" className="h-7 rounded-full bg-[#292a27] px-3 text-[10px] text-white">
                发送 <Send className="size-3" aria-hidden />
              </Button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
