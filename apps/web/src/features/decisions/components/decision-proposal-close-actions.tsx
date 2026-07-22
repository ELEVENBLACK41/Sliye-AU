/**
 * 本文件实现负责人拒绝或取消开放提案的确认交互与结果反馈。
 */
'use client';

import { useState, type ReactNode } from 'react';
import { Ban, CheckCircle2, Loader2, TriangleAlert, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CloseDecisionProposalRequestPayload } from '@workspace/contracts/decisions';

import { closeDecisionProposal } from '@/features/decisions/services/decisions-client.service';
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
  AlertDialogTrigger,
} from '@workspace/ui/components/alert-dialog';
import { Button } from '@workspace/ui/components/button';

/** 提案关闭操作组件属性。 */
type DecisionProposalCloseActionsProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前开放提案数据库主键。 */
  proposalId: number;
  /** 当前开放提案标题。 */
  proposalTitle: string;
};

/** 渲染拒绝和取消提案操作，并在执行前说明关联投票影响。 */
export function DecisionProposalCloseActions({
  decisionId,
  proposalId,
  proposalTitle,
}: DecisionProposalCloseActionsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<CloseDecisionProposalRequestPayload['status'] | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /** 提交提案终态并刷新提案、投票和事件数据。 */
  async function handleClose(status: CloseDecisionProposalRequestPayload['status']) {
    setPendingStatus(status);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await closeDecisionProposal(decisionId, proposalId, { status });
      setSuccessMessage(status === 'REJECTED' ? '提案已拒绝' : '提案已取消');
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '提案关闭失败，请稍后重试'));
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <div className="grid gap-3 border-t pt-3">
      {errorMessage ? (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert aria-hidden />
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert aria-live="polite">
          <CheckCircle2 aria-hidden />
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <ProposalCloseDialog
          title="确认取消该提案？"
          description={`“${proposalTitle}”将标记为已取消，关联的开放投票也会同步取消。此操作不能撤销。`}
          triggerLabel="取消提案"
          confirmLabel="确认取消"
          icon={<Ban aria-hidden />}
          isPending={pendingStatus !== null}
          onConfirm={() => handleClose('CANCELLED')}
        />
        <ProposalCloseDialog
          title="确认拒绝该提案？"
          description={`“${proposalTitle}”将标记为已拒绝，关联的开放投票也会同步取消。此操作不能撤销。`}
          triggerLabel="拒绝提案"
          confirmLabel="确认拒绝"
          icon={<XCircle aria-hidden />}
          isPending={pendingStatus !== null}
          destructive
          onConfirm={() => handleClose('REJECTED')}
        />
      </div>
    </div>
  );
}

/** 单个提案终态确认弹窗属性。 */
type ProposalCloseDialogProps = {
  /** 确认弹窗标题。 */
  title: string;
  /** 确认弹窗影响说明。 */
  description: string;
  /** 触发按钮文案。 */
  triggerLabel: string;
  /** 确认按钮文案。 */
  confirmLabel: string;
  /** 触发按钮图标。 */
  icon: ReactNode;
  /** 当前是否已有关闭请求执行中。 */
  isPending: boolean;
  /** 是否使用破坏性按钮样式。 */
  destructive?: boolean;
  /** 确认后的异步操作。 */
  onConfirm: () => Promise<void>;
};

/** 复用标准 AlertDialog 渲染单个提案终态确认。 */
function ProposalCloseDialog({
  title,
  description,
  triggerLabel,
  confirmLabel,
  icon,
  isPending,
  destructive = false,
  onConfirm,
}: ProposalCloseDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={destructive ? 'destructive' : 'outline'} size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : icon}
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>返回</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={isPending}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 将结构化 API 错误或未知异常转换为可展示中文文案。 */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
