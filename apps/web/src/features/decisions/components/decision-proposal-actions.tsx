/**
 * 本文件实现决策详情页创建提案的表单、提交状态和结果反馈。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, FilePlus2, Loader2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { createDecisionProposal } from '@/features/decisions/services/decisions-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
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

/** 创建提案操作组件属性。 */
type DecisionProposalActionsProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
};

/** 渲染创建提案 Sheet，并覆盖提交中、失败和成功状态。 */
export function DecisionProposalActions({ decisionId }: DecisionProposalActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /** 打开面板时提供干净表单，关闭时清理本次操作反馈。 */
  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen);
    setErrorMessage('');
    setSuccessMessage('');

    if (nextOpen) {
      setTitle('');
      setDescription('');
    }
  }

  /** 校验并提交新提案，成功后刷新服务端提案列表和事件时间线。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (normalizedTitle.length < 2) {
      setErrorMessage('提案标题至少需要 2 个字符');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const proposal = await createDecisionProposal(decisionId, {
        title: normalizedTitle,
        description: normalizedDescription || undefined,
      });

      setTitle('');
      setDescription('');
      setSuccessMessage(`提案“${proposal.title}”已创建`);
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '创建提案失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button>
          <FilePlus2 aria-hidden />
          创建提案
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>创建提案</SheetTitle>
          <SheetDescription>记录当前决策中的候选方案，后续可围绕提案发起投票。</SheetDescription>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
            {errorMessage ? (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertTitle>创建失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {successMessage ? (
              <Alert>
                <CheckCircle2 aria-hidden />
                <AlertTitle>创建成功</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="decision-proposal-title">提案标题</Label>
              <Input
                id="decision-proposal-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={2}
                maxLength={120}
                placeholder="例如：先抽离权限计算服务"
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">使用一句话概括候选方案，最多 120 个字符。</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="decision-proposal-description">提案说明</Label>
              <Textarea
                id="decision-proposal-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                placeholder="补充方案背景、实施方式、收益或风险（可选）"
                className="min-h-32 resize-y"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">可选，最多 2000 个字符。</p>
            </div>
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isSubmitting || title.trim().length < 2}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <FilePlus2 aria-hidden />}
              {isSubmitting ? '正在创建…' : '确认创建'}
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
