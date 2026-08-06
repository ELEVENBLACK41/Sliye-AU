/**
 * 本文件展示新版决策工作台的提案列表，并提供创建、拒绝和取消操作。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { FilePlus2, Loader2, MoreHorizontal, XCircle } from 'lucide-react';
import type { DecisionProposalStatus } from '@workspace/contracts/decisions';

import {
  closeProjectSpaceDecisionProposal,
  createProjectSpaceDecisionProposal,
} from '../services/project-space-client.service';
import type { ProjectDecisionWorkspaceData } from '../types/project-space.type';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@workspace/ui/components/alert-dialog';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
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

/** 新版提案面板属性。 */
type ProjectDecisionProposalPanelProps = {
  /** 当前决策工作台数据。 */
  data: ProjectDecisionWorkspaceData;
  /** 当前认证用户主键。 */
  currentUserId: number;
  /** 当前用户是否拥有决策更新权限。 */
  canUpdate: boolean;
  /** 写操作成功后刷新工作台。 */
  onChanged: () => void;
};

/** 渲染提案创建入口与按状态排列的真实提案。 */
export function ProjectDecisionProposalPanel({
  data,
  currentUserId,
  canUpdate,
  onChanged,
}: ProjectDecisionProposalPanelProps) {
  const participantRole = data.decision.participants.find((item) => item.user.id === currentUserId)?.role;
  const canCreate =
    canUpdate &&
    (data.decision.status === 'DRAFT' || data.decision.status === 'DISCUSSING') &&
    (participantRole === 'OWNER' || participantRole === 'EDITOR');
  const canManage =
    canUpdate && data.decision.status === 'DISCUSSING' && data.decision.owner?.id === currentUserId;

  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="decision-proposals-title">
      <header className="flex items-start justify-between gap-3 border-b bg-project-accent-soft/25 px-4 py-3">
        <div>
          <h3 id="decision-proposals-title" className="text-sm font-semibold">提案</h3>
          <p className="mt-1 text-xs text-muted-foreground">先记录候选方案，再决定是否进入表决。</p>
        </div>
        {canCreate ? <ProposalCreateSheet decisionId={data.decision.id} onCreated={onChanged} /> : null}
      </header>
      {data.proposals.length ? (
        <ul className="divide-y">
          {data.proposals.map((proposal) => (
            <li key={proposal.id} className="grid gap-3 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{proposal.title}</p>
                    <Badge variant="secondary">{proposalStatusText[proposal.status]}</Badge>
                  </div>
                  {proposal.description ? (
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{proposal.description}</p>
                  ) : null}
                </div>
                {canManage && proposal.status === 'OPEN' ? (
                  <div className="flex shrink-0 gap-1">
                    <ProposalCloseDialog
                      decisionId={data.decision.id}
                      proposalId={proposal.id}
                      proposalTitle={proposal.title}
                      status="REJECTED"
                      onChanged={onChanged}
                    />
                    <ProposalCloseDialog
                      decisionId={data.decision.id}
                      proposalId={proposal.id}
                      proposalTitle={proposal.title}
                      status="CANCELLED"
                      onChanged={onChanged}
                    />
                  </div>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                由 {proposal.creator.name || `用户 ${proposal.creator.id}`} 提交
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-8 text-center">
          <FilePlus2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">还没有提案</p>
          <p className="mt-1 text-xs text-muted-foreground">把讨论中的候选方案先沉淀下来。</p>
        </div>
      )}
    </section>
  );
}

/** 提案创建 Sheet 属性。 */
type ProposalCreateSheetProps = {
  /** 当前决策主键。 */
  decisionId: number;
  /** 创建成功回调。 */
  onCreated: () => void;
};

/** 渲染简洁的提案创建表单。 */
function ProposalCreateSheet({ decisionId, onCreated }: ProposalCreateSheetProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 创建开放提案并刷新当前决策。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || title.trim().length < 2) return;
    setPending(true);
    setError('');
    try {
      await createProjectSpaceDecisionProposal(decisionId, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setOpen(false);
      setTitle('');
      setDescription('');
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '提案创建失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button type="button" size="sm" variant="secondary"><FilePlus2 aria-hidden />新提案</Button></SheetTrigger>
      <SheetContent className="border-black/10 bg-project-surface">
        <SheetHeader className="border-b border-black/[0.07] px-5 py-5">
          <span className="mb-2 grid size-10 place-items-center rounded-2xl bg-project-accent text-project-ink">
            <FilePlus2 className="size-5" aria-hidden />
          </span>
          <SheetTitle>记录一个候选提案</SheetTitle>
          <SheetDescription>提案创建后保持开放，可以继续讨论、发起投票或由负责人收口。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="decision-proposal-title">提案标题</Label>
            <Input id="decision-proposal-title" value={title} minLength={2} maxLength={120} required onChange={(event) => setTitle(event.currentTarget.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="decision-proposal-description">方案说明</Label>
            <Textarea id="decision-proposal-description" value={description} maxLength={1000} className="min-h-32 resize-none" onChange={(event) => setDescription(event.currentTarget.value)} />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={pending || title.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}创建提案
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** 提案关闭确认框属性。 */
type ProposalCloseDialogProps = {
  decisionId: number;
  proposalId: number;
  proposalTitle: string;
  status: Extract<DecisionProposalStatus, 'REJECTED' | 'CANCELLED'>;
  onChanged: () => void;
};

/** 二次确认拒绝或取消提案，并提示关联投票也会被取消。 */
function ProposalCloseDialog({ decisionId, proposalId, proposalTitle, status, onChanged }: ProposalCloseDialogProps) {
  const [pending, setPending] = useState(false);

  /** 执行提案关闭操作。 */
  async function handleConfirm(): Promise<void> {
    setPending(true);
    try {
      await closeProjectSpaceDecisionProposal(decisionId, proposalId, { status });
      onChanged();
    } finally {
      setPending(false);
    }
  }

  const isReject = status === 'REJECTED';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label={isReject ? '拒绝提案' : '取消提案'}>
          {isReject ? <XCircle aria-hidden /> : <MoreHorizontal aria-hidden />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isReject ? '拒绝这项提案？' : '取消这项提案？'}</AlertDialogTitle>
          <AlertDialogDescription>
            “{proposalTitle}”将停止开放，所有仍在进行且关联它的投票也会被取消。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>保留提案</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void handleConfirm()}>
            {isReject ? '确认拒绝' : '确认取消'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 提案状态中文文案。 */
const proposalStatusText: Record<DecisionProposalStatus, string> = {
  OPEN: '开放',
  ACCEPTED: '已采纳',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
};
