/**
 * 本文件展示项目、议题、提案和正式决议之间的关系画布线框。
 */
import { CircleUserRound, UsersRound } from 'lucide-react';

import { decisionBranches } from '../project-space.constants';
import type { DecisionBranch } from '../types/project-space.type';
import { Badge } from '@workspace/ui/components/badge';

/** 渲染单条议题分支及其提案状态。 */
function DecisionBranchRow({ branch, index }: { branch: DecisionBranch; index: number }) {
  const Icon = index === 1 ? UsersRound : CircleUserRound;

  return (
    <article className="grid grid-cols-[8.5rem_minmax(16rem,1fr)] items-center gap-5" aria-label={`${branch.title}议题分支`}>
      <div className="relative flex items-center gap-2.5">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full border bg-white ${
            index === 1 ? 'border-[#eeb50b]' : 'border-black/15'
          }`}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold">{branch.title}</h3>
          <p className="mt-0.5 text-[10px] text-black/40">{branch.status}</p>
          <span className="mt-1 inline-flex rounded-full border border-black/10 bg-white/60 px-2 py-0.5 text-[9px] text-black/45">
            ··· {branch.participantCount}
          </span>
        </div>
        <span className="absolute top-1/2 -right-5 h-px w-5 bg-black/25" aria-hidden />
      </div>

      <div className="space-y-1.5">
        {branch.proposals.map((proposal) => (
          <div key={proposal.title} className="grid grid-cols-[4.4rem_minmax(6.5rem,1fr)_4.8rem] items-center">
            <span className="rounded-lg border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-medium shadow-sm shadow-black/[0.02]">
              {proposal.title}
            </span>
            <span className="flex min-w-0 items-center">
              <span className="h-px min-w-3 flex-1 bg-black/25" aria-hidden />
              <Badge variant="outline" className="max-w-full shrink rounded-full border-black/10 bg-white/55 px-2 py-1 text-[9px] font-normal text-black/55">
                <span className="truncate">{proposal.status}</span>
              </Badge>
              <span className={`h-px min-w-3 flex-1 ${proposal.resolved ? 'bg-[#efb900]' : 'bg-black/25'}`} aria-hidden />
            </span>
            {proposal.resolved ? (
              <span className="rounded-full border border-[#efb900]/70 bg-[#fff4ca] px-2 py-1 text-center text-[9px] font-medium">正式决议</span>
            ) : (
              <span className="pl-2 text-[11px] tracking-[0.2em] text-black/35">···</span>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

/** 渲染项目空间中央决策关系画布。 */
export function DecisionMapCanvas() {
  return (
    <div className="min-h-[25rem] min-w-0 flex-1 overflow-auto bg-white/18 p-5 lg:min-h-0">
        <div className="relative mx-auto grid min-h-[25rem] min-w-[42rem] grid-cols-[7.5rem_1fr] items-center gap-8">
          <div className="relative z-10 grid size-24 place-items-center justify-self-center rounded-full border-2 border-white bg-[#30312e] p-3 text-center text-white shadow-[0_0_0_1px_rgba(0,0,0,0.18)]">
            <div>
              <h2 className="text-sm leading-tight font-semibold">产品体验<br />升级计划</h2>
              <span className="mt-1 block text-[9px] text-white/55">项目</span>
            </div>
          </div>

          <div className="relative z-10 space-y-3">
            {decisionBranches.map((branch, index) => <DecisionBranchRow key={branch.id} branch={branch} index={index} />)}
          </div>

          <svg className="pointer-events-none absolute inset-0 size-full text-black/55" viewBox="0 0 720 400" preserveAspectRatio="none" aria-hidden>
            <path d="M105 200 C150 200 145 53 205 53" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M105 200 C155 200 150 150 205 150" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M105 200 C155 200 150 250 205 250" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M105 200 C150 200 145 347 205 347" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
    </div>
  );
}
