/**
 * 本文件实现负责人采纳提案并形成最终正式决议的 Sheet 表单与二次确认。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Gavel, Loader2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DecisionProposal, DecisionVoteRound } from '@workspace/contracts/decisions';

import { createDecisionResolution } from '@/features/decisions/services/decisions-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';
import { Textarea } from '@workspace/ui/components/textarea';

/** 创建正式决议组件属性。 */
type DecisionResolutionCreateActionProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前可被采纳的开放提案。 */
  proposals: DecisionProposal[];
  /** 当前决策中可作为依据的已关闭投票轮次。 */
  voteRounds: DecisionVoteRound[];
};

/** 渲染正式决议表单，并在真正闭环前执行不可逆操作确认。 */
export function DecisionResolutionCreateAction({
  decisionId,
  proposals,
  voteRounds,
}: DecisionResolutionCreateActionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposalId, setProposalId] = useState('');
  const [voteRoundId, setVoteRoundId] = useState('none');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const availableVoteRounds = voteRounds.filter(
    (round) => round.status === 'CLOSED' && round.proposalId === Number(proposalId),
  );

  /** 打开表单时清理上一轮输入和操作反馈。 */
  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) return;

    setIsOpen(nextOpen);
    setIsConfirmOpen(false);
    setErrorMessage('');
    setSuccessMessage('');

    if (nextOpen) {
      setProposalId(proposals.length === 1 ? String(proposals[0]?.id) : '');
      setVoteRoundId('none');
      setTitle('');
      setContent('');
    }
  }

  /** 切换来源提案，并清除不再属于该提案的来源投票。 */
  function handleProposalChange(value: string) {
    setProposalId(value);
    setVoteRoundId('none');
  }

  /** 校验正式结论内容，通过后打开最终确认弹窗。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!Number.isInteger(Number(proposalId)) || Number(proposalId) < 1) {
      setErrorMessage('请选择需要采纳的开放提案');
      return;
    }

    if (title.trim().length < 2) {
      setErrorMessage('正式决议标题至少需要 2 个字符');
      return;
    }

    if (content.trim().length < 2) {
      setErrorMessage('正式决议正文至少需要 2 个字符');
      return;
    }

    setErrorMessage('');
    setIsConfirmOpen(true);
  }

  /** 创建最终决议并刷新决策状态、提案、投票与事件数据。 */
  async function handleConfirm() {
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const resolution = await createDecisionResolution(decisionId, {
        sourceProposalId: Number(proposalId),
        sourceVoteRoundId: voteRoundId === 'none' ? undefined : Number(voteRoundId),
        title: title.trim(),
        content: content.trim(),
      });

      setIsConfirmOpen(false);
      setSuccessMessage(`正式决议“${resolution.title}”已形成，决策已闭环`);
      router.refresh();
    } catch (error) {
      setIsConfirmOpen(false);
      setErrorMessage(getErrorMessage(error, '正式决议创建失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button disabled={proposals.length === 0} title={proposals.length ? undefined : '暂无可采纳的开放提案'}>
          <Gavel aria-hidden />
          形成正式决议
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>形成正式决议</SheetTitle>
          <SheetDescription>采纳一条开放提案，记录最终结论与依据，并将当前决策标记为已解决。</SheetDescription>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
            {errorMessage ? (
              <Alert variant="destructive" aria-live="polite">
                <TriangleAlert aria-hidden />
                <AlertTitle>创建失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {successMessage ? (
              <Alert aria-live="polite">
                <CheckCircle2 aria-hidden />
                <AlertTitle>决策已闭环</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="decision-resolution-proposal">采纳提案</Label>
              <Select value={proposalId} onValueChange={handleProposalChange} disabled={isSubmitting}>
                <SelectTrigger id="decision-resolution-proposal">
                  <SelectValue placeholder="选择一条开放提案" />
                </SelectTrigger>
                <SelectContent>
                  {proposals.map((proposal) => (
                    <SelectItem key={proposal.id} value={String(proposal.id)}>
                      {proposal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="decision-resolution-vote">来源投票</Label>
              <Select value={voteRoundId} onValueChange={setVoteRoundId} disabled={isSubmitting || !proposalId}>
                <SelectTrigger id="decision-resolution-vote">
                  <SelectValue placeholder="可选：选择已关闭投票" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联投票</SelectItem>
                  {availableVoteRounds.map((round) => (
                    <SelectItem key={round.id} value={String(round.id)}>
                      {round.title}{round.result ? ` · ${formatVoteOutcome(round.result.outcome)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">投票是决议依据，不会自动代替负责人作出正式结论。</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="decision-resolution-title">决议标题</Label>
              <Input
                id="decision-resolution-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={2}
                maxLength={160}
                placeholder="例如：正式采用权限服务拆分方案"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="decision-resolution-content">正式结论与确认理由</Label>
              <Textarea
                id="decision-resolution-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                minLength={2}
                maxLength={5000}
                placeholder="写明最终决定、适用范围、关键依据和需要保留的约束"
                className="min-h-40 resize-y"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              type="submit"
              disabled={isSubmitting || !proposalId || title.trim().length < 2 || content.trim().length < 2}
            >
              <Gavel aria-hidden />
              检查并确认
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                关闭
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认形成最终正式决议？</AlertDialogTitle>
            <AlertDialogDescription>
              确认后将采纳所选提案、取消其他开放提案和投票，并把决策推进为已解决。此操作不能撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>返回检查</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Gavel aria-hidden />}
              {isSubmitting ? '正在闭环…' : '确认形成决议'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

/** 将投票统计结论转换为决议来源选择中的中文摘要。 */
function formatVoteOutcome(outcome: NonNullable<DecisionVoteRound['result']>['outcome']): string {
  return {
    APPROVED: '赞成领先',
    REJECTED: '反对领先',
    TIED: '票数相同',
    QUORUM_NOT_MET: '未达有效票数',
  }[outcome];
}

/** 将结构化 API 错误或未知异常转换为可展示中文文案。 */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
