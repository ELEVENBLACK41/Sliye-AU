/**
 * 本文件实现负责人创建并立即开启提案投票的 Sheet 表单与结果反馈。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, TriangleAlert, Vote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DecisionProposal } from '@workspace/contracts/decisions';

import { createDecisionVoteRound } from '@/features/decisions/services/decisions-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
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
import { Switch } from '@workspace/ui/components/switch';
import { Textarea } from '@workspace/ui/components/textarea';

/** 创建投票操作组件属性。 */
type DecisionVoteCreateActionProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前可以发起新一轮投票的开放提案。 */
  proposals: DecisionProposal[];
};

/** 渲染创建投票 Sheet，并覆盖校验、提交中、失败和成功状态。 */
export function DecisionVoteCreateAction({ decisionId, proposals }: DecisionVoteCreateActionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposalId, setProposalId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quorumCount, setQuorumCount] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /** 打开表单时清理上一轮输入和操作反馈。 */
  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen);
    setErrorMessage('');
    setSuccessMessage('');

    if (nextOpen) {
      setProposalId(proposals.length === 1 ? String(proposals[0]?.id) : '');
      setTitle('');
      setDescription('');
      setQuorumCount('');
      setIsAnonymous(false);
    }
  }

  /** 校验并提交投票创建请求，成功后刷新服务端轮次和时间线数据。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedProposalId = Number(proposalId);
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    const normalizedQuorumCount = quorumCount ? Number(quorumCount) : undefined;

    if (!Number.isInteger(normalizedProposalId) || normalizedProposalId < 1) {
      setErrorMessage('请选择需要表决的提案');
      return;
    }

    if (normalizedTitle && normalizedTitle.length < 2) {
      setErrorMessage('自定义投票标题至少需要 2 个字符');
      return;
    }

    if (
      normalizedQuorumCount !== undefined &&
      (!Number.isInteger(normalizedQuorumCount) || normalizedQuorumCount < 1)
    ) {
      setErrorMessage('最少有效票数必须是大于 0 的整数');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const round = await createDecisionVoteRound(decisionId, {
        proposalId: normalizedProposalId,
        title: normalizedTitle || undefined,
        description: normalizedDescription || undefined,
        isAnonymous,
        quorumCount: normalizedQuorumCount,
      });

      setProposalId('');
      setSuccessMessage(`投票“${round.title}”已开启`);
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '创建投票失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button disabled={proposals.length === 0} title={proposals.length ? undefined : '暂无可发起投票的开放提案'}>
          <Vote aria-hidden />
          发起投票
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>发起提案投票</SheetTitle>
          <SheetDescription>投票开启后由负责人或审批人提交赞成、反对或弃权选票。</SheetDescription>
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
                <AlertTitle>投票已开启</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="decision-vote-proposal">表决提案</Label>
              <Select value={proposalId} onValueChange={setProposalId} disabled={isSubmitting}>
                <SelectTrigger id="decision-vote-proposal">
                  <SelectValue placeholder="选择一个开放提案" />
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
              <Label htmlFor="decision-vote-title">投票标题</Label>
              <Input
                id="decision-vote-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={2}
                maxLength={120}
                placeholder="留空则根据提案标题自动生成"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="decision-vote-description">投票说明</Label>
              <Textarea
                id="decision-vote-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                placeholder="补充表决规则或判断依据（可选）"
                className="min-h-28 resize-y"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="decision-vote-quorum">最少有效票数</Label>
              <Input
                id="decision-vote-quorum"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quorumCount}
                onChange={(event) => setQuorumCount(event.target.value)}
                placeholder="留空表示不限制"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="grid gap-1">
                <Label htmlFor="decision-vote-anonymous">匿名投票</Label>
                <p className="text-xs text-muted-foreground">时间线不会展示投票人与所选选项的对应关系。</p>
              </div>
              <Switch
                id="decision-vote-anonymous"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isSubmitting || !proposalId}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Vote aria-hidden />}
              {isSubmitting ? '正在开启…' : '确认开启'}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                关闭
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** 将结构化 API 错误或未知异常转换为可展示中文文案。 */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
