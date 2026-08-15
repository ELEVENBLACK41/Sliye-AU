/**
 * 本文件提供新版决策工作台中从开放提案发起标准表决的表单。
 */
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, Vote } from 'lucide-react';
import type { DecisionProposal, DecisionVoteRound } from '@workspace/contracts/decisions';

import { createProjectSpaceDecisionVoteRound } from '../services/project-space-client.service';
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
import { Switch } from '@workspace/ui/components/switch';
import { Textarea } from '@workspace/ui/components/textarea';

/** 投票创建 Sheet 属性。 */
type ProjectDecisionVoteCreateSheetProps = {
  /** 当前决策主键。 */
  decisionId: number;
  /** 当前决策的全部提案。 */
  proposals: DecisionProposal[];
  /** 当前决策已经存在的投票轮次。 */
  voteRounds: DecisionVoteRound[];
  /** 投票创建成功后的刷新回调。 */
  onCreated: () => void;
};

/** 从尚无开放投票的开放提案创建赞成、反对、弃权表决。 */
export function ProjectDecisionVoteCreateSheet({
  decisionId,
  proposals,
  voteRounds,
  onCreated,
}: ProjectDecisionVoteCreateSheetProps) {
  const availableProposals = useMemo(
    () => proposals.filter((proposal) =>
      proposal.status === 'OPEN' &&
      !voteRounds.some((round) => round.proposalId === proposal.id && round.status === 'OPEN'),
    ),
    [proposals, voteRounds],
  );
  const [open, setOpen] = useState(false);
  const [proposalId, setProposalId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quorumCount, setQuorumCount] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 创建并立即开启当前提案的标准表决。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsedProposalId = Number(proposalId);
    const parsedQuorumCount = quorumCount ? Number(quorumCount) : undefined;
    if (pending || !Number.isInteger(parsedProposalId)) return;

    setPending(true);
    setError('');
    try {
      await createProjectSpaceDecisionVoteRound(decisionId, {
        proposalId: parsedProposalId,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        isAnonymous,
        quorumCount: parsedQuorumCount,
      });
      setOpen(false);
      setProposalId('');
      setTitle('');
      setDescription('');
      setQuorumCount('');
      setIsAnonymous(false);
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '投票开启失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="secondary" disabled={availableProposals.length === 0}>
          <Vote aria-hidden />发起投票
        </Button>
      </SheetTrigger>
      <SheetContent className="border-black/10 bg-project-surface">
        <SheetHeader className="border-b border-black/[0.07] px-5 py-5">
          <span className="mb-2 grid size-10 place-items-center rounded-2xl bg-project-accent text-project-ink">
            <Vote className="size-5" aria-hidden />
          </span>
          <SheetTitle>为提案发起投票</SheetTitle>
          <SheetDescription>系统将创建赞成、反对、弃权三个选项；开放期间不会展示实时票数。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="decision-vote-proposal">表决提案</Label>
            <Select value={proposalId} onValueChange={setProposalId}>
              <SelectTrigger id="decision-vote-proposal"><SelectValue placeholder="选择一个开放提案" /></SelectTrigger>
              <SelectContent>
                {availableProposals.map((proposal) => (
                  <SelectItem key={proposal.id} value={String(proposal.id)}>{proposal.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="decision-vote-title">投票标题</Label>
            <Input id="decision-vote-title" value={title} maxLength={120} placeholder="留空则自动生成" onChange={(event) => setTitle(event.currentTarget.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="decision-vote-description">规则说明</Label>
            <Textarea id="decision-vote-description" value={description} maxLength={1000} className="min-h-24 resize-none" onChange={(event) => setDescription(event.currentTarget.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="decision-vote-quorum">最低有效票数</Label>
            <Input id="decision-vote-quorum" type="number" min={1} value={quorumCount} placeholder="不填写则不限制" onChange={(event) => setQuorumCount(event.currentTarget.value)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <div>
              <Label htmlFor="decision-vote-anonymous">匿名投票</Label>
              <p className="mt-1 text-xs text-muted-foreground">隐藏投票人与具体选项的对应关系。</p>
            </div>
            <Switch id="decision-vote-anonymous" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={pending || !proposalId} className="bg-project-accent text-project-ink hover:bg-project-accent/85">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}开启投票
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
