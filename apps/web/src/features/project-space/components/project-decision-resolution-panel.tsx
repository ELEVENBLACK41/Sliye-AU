/**
 * 本文件展示新版决策工作台的正式决议，并提供最终收口表单。
 */
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, Gavel, Loader2 } from 'lucide-react';

import { createProjectSpaceDecisionResolution } from '../services/project-space-client.service';
import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';
import { Textarea } from '@workspace/ui/components/textarea';

/** 正式决议面板属性。 */
type ProjectDecisionResolutionPanelProps = {
  data: ProjectDecisionWorkspaceData;
  currentUserId: number;
  canUpdate: boolean;
  onChanged: () => void;
};

/** 展示最终结论，并只向负责人开放收口操作。 */
export function ProjectDecisionResolutionPanel({
  data,
  currentUserId,
  canUpdate,
  onChanged,
}: ProjectDecisionResolutionPanelProps) {
  const canResolve =
    canUpdate && data.decision.status === 'DISCUSSING' && data.decision.owner?.id === currentUserId;

  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="decision-resolution-title">
      <header className="flex items-start justify-between gap-3 border-b bg-project-accent-soft/25 px-4 py-3">
        <div>
          <h3 id="decision-resolution-title" className="text-sm font-semibold">正式决议</h3>
          <p className="mt-1 text-xs text-muted-foreground">只有确认后的正式决议才会结束这项决策。</p>
        </div>
        {canResolve ? <ResolutionCreateSheet data={data} onCreated={onChanged} /> : null}
      </header>
      {data.resolutions.length ? (
        <div className="grid gap-3 p-3">
          {data.resolutions.map((resolution) => (
            <article key={resolution.id} className="rounded-xl border bg-primary p-4 text-primary-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <BadgeCheck className="size-4" aria-hidden />
                <h4 className="font-semibold">{resolution.title}</h4>
                <Badge variant="secondary">正式决议</Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-primary-foreground/80">{resolution.content}</p>
              <p className="mt-3 text-[11px] text-primary-foreground/60">
                由 {resolution.decidedBy.name || `用户 ${resolution.decidedBy.id}`} 于 {formatDateTime(resolution.decidedAt)} 确认
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <Gavel className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">尚未形成正式决议</p>
          <p className="mt-1 text-xs text-muted-foreground">可以采纳提案，也可以直接记录讨论共识。</p>
        </div>
      )}
    </section>
  );
}

/** 正式决议创建 Sheet 属性。 */
type ResolutionCreateSheetProps = {
  data: ProjectDecisionWorkspaceData;
  onCreated: () => void;
};

/** 渲染来源提案、投票依据与决议正文表单。 */
function ResolutionCreateSheet({ data, onCreated }: ResolutionCreateSheetProps) {
  const [open, setOpen] = useState(false);
  const [proposalId, setProposalId] = useState('none');
  const [voteRoundId, setVoteRoundId] = useState('none');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const openProposals = data.proposals.filter((proposal) => proposal.status === 'OPEN');
  const matchingClosedVotes = useMemo(() => {
    if (proposalId === 'none') return [];
    return data.voteRounds.filter(
      (round) => round.status === 'CLOSED' && round.proposalId === Number(proposalId),
    );
  }, [data.voteRounds, proposalId]);

  /** 切换来源提案时清理不再合法的投票依据。 */
  function handleProposalChange(value: string): void {
    setProposalId(value);
    setVoteRoundId('none');
  }

  /** 创建最终决议，并由后端原子收口所有开放业务项。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || title.trim().length < 2 || content.trim().length < 2) return;
    setPending(true);
    setError('');
    try {
      await createProjectSpaceDecisionResolution(data.decision.id, {
        sourceProposalId: proposalId === 'none' ? undefined : Number(proposalId),
        sourceVoteRoundId: voteRoundId === 'none' ? undefined : Number(voteRoundId),
        title: title.trim(),
        content: content.trim(),
      });
      setOpen(false);
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '正式决议创建失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button type="button" size="sm"><Gavel aria-hidden />形成决议</Button></SheetTrigger>
      <SheetContent className="border-black/10 bg-project-surface sm:max-w-lg">
        <SheetHeader className="border-b border-black/[0.07] px-5 py-5">
          <span className="mb-2 grid size-10 place-items-center rounded-2xl bg-project-accent text-project-ink">
            <Gavel className="size-5" aria-hidden />
          </span>
          <SheetTitle>形成正式决议</SheetTitle>
          <SheetDescription>确认后当前决策将结束，其他开放提案和投票会被统一收口。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="resolution-proposal">来源提案</Label>
            <Select value={proposalId} onValueChange={handleProposalChange}>
              <SelectTrigger id="resolution-proposal"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不关联提案，直接记录共识</SelectItem>
                {openProposals.map((proposal) => <SelectItem key={proposal.id} value={String(proposal.id)}>{proposal.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {proposalId !== 'none' ? (
            <div className="grid gap-2">
              <Label htmlFor="resolution-vote">投票依据</Label>
              <Select value={voteRoundId} onValueChange={setVoteRoundId}>
                <SelectTrigger id="resolution-vote"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联投票</SelectItem>
                  {matchingClosedVotes.map((round) => <SelectItem key={round.id} value={String(round.id)}>{round.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="resolution-title">决议标题</Label>
            <Input id="resolution-title" value={title} minLength={2} maxLength={120} required onChange={(event) => setTitle(event.currentTarget.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="resolution-content">决议正文与确认理由</Label>
            <Textarea id="resolution-content" value={content} minLength={2} maxLength={4000} required className="min-h-40 resize-none" onChange={(event) => setContent(event.currentTarget.value)} />
          </div>
          <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive">
            这是最终收口操作。确认后将不能继续创建提案、开启投票或修改参与人。
          </p>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={pending || title.trim().length < 2 || content.trim().length < 2} className="bg-project-accent text-project-ink hover:bg-project-accent/85">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}确认并形成正式决议
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** 将 ISO 时间格式化为中文日期时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
