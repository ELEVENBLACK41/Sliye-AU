/**
 * 本文件实现单轮投票的选票提交、关闭确认及操作结果反馈。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, LockKeyhole, Send, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DecisionVoteRound } from '@workspace/contracts/decisions';

import { closeDecisionVoteRound, submitDecisionBallot } from '@/features/decisions/services/decisions-client.service';
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
import { Label } from '@workspace/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group';
import { Textarea } from '@workspace/ui/components/textarea';

/** 单轮投票操作组件属性。 */
type DecisionVoteRoundActionsProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
  /** 当前开放投票轮次及其选项。 */
  round: DecisionVoteRound;
  /** 当前用户是否具备提交选票的身份。 */
  canVote: boolean;
  /** 当前用户是否具备关闭轮次的管理权限。 */
  canClose: boolean;
};

/** 渲染投票选择表单和不可逆关闭确认。 */
export function DecisionVoteRoundActions({ decisionId, round, canVote, canClose }: DecisionVoteRoundActionsProps) {
  const router = useRouter();
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /** 校验并提交当前用户的单选选票。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const optionId = Number(selectedOptionId);

    if (!Number.isInteger(optionId) || optionId < 1) {
      setErrorMessage('请选择赞成、反对或弃权');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await submitDecisionBallot(decisionId, round.id, {
        optionId,
        reason: reason.trim() || undefined,
      });
      setSuccessMessage('选票已提交，每轮投票只能提交一次');
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '提交选票失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 关闭当前投票轮次并刷新最终统计和时间线。 */
  async function handleClose() {
    setIsClosing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await closeDecisionVoteRound(decisionId, round.id);
      setSuccessMessage('投票已关闭，最终统计已经固化');
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '关闭投票失败，请稍后重试'));
    } finally {
      setIsClosing(false);
    }
  }

  const canSubmitBallot = canVote && !round.hasVoted;

  return (
    <div className="grid gap-4 border-t pt-4">
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

      {round.hasVoted ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" aria-hidden />
          你已经提交本轮选票，投票关闭后将展示最终票数。
        </p>
      ) : null}

      {canSubmitBallot ? (
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <fieldset className="grid gap-3" disabled={isSubmitting || isClosing}>
            <legend className="text-sm font-medium">选择你的意见</legend>
            <RadioGroup value={selectedOptionId} onValueChange={setSelectedOptionId}>
              {round.options.map((option) => {
                const optionControlId = `decision-vote-${round.id}-option-${option.id}`;

                return (
                  <div key={option.id} className="flex items-center gap-3 rounded-md border p-3">
                    <RadioGroupItem id={optionControlId} value={String(option.id)} />
                    <Label htmlFor={optionControlId} className="flex-1 cursor-pointer">
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor={`decision-vote-${round.id}-reason`}>投票理由</Label>
            <Textarea
              id={`decision-vote-${round.id}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="补充本次选择的依据（可选）"
              className="min-h-20 resize-y"
              disabled={isSubmitting || isClosing}
            />
          </div>

          <div>
            <Button type="submit" disabled={isSubmitting || isClosing || !selectedOptionId}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              {isSubmitting ? '正在提交…' : '提交选票'}
            </Button>
          </div>
        </form>
      ) : null}

      {canClose ? (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isSubmitting || isClosing}>
                {isClosing ? <Loader2 className="animate-spin" aria-hidden /> : <LockKeyhole aria-hidden />}
                {isClosing ? '正在关闭…' : '关闭投票'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认关闭本轮投票？</AlertDialogTitle>
                <AlertDialogDescription>
                  关闭后将不再接受选票，并立即固化最终票数和统计结论。此操作不能撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isClosing}>继续投票</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleClose} disabled={isClosing}>
                  确认关闭
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}

/** 将结构化 API 错误或未知异常转换为可展示中文文案。 */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
