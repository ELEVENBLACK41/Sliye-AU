/**
 * 本文件实现决策详情页的状态流转交互，当前只允许将草稿推进到讨论中。
 */
'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, MessageCircleMore, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { updateDecisionStatus } from '@/features/decisions/services/decisions-client.service';
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
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策状态操作组件属性。 */
type DecisionStatusActionsProps = {
  /** 当前决策的数据库主键。 */
  decisionId: number;
};

/** 渲染开始讨论操作，并处理确认、提交、成功刷新与结构化错误。 */
export function DecisionStatusActions({ decisionId }: DecisionStatusActionsProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /** 在非提交状态下同步弹窗开关，并在重新打开时清除旧错误。 */
  function handleDialogOpenChange(open: boolean) {
    if (isPending) {
      return;
    }

    setIsDialogOpen(open);

    if (open) {
      setErrorMessage('');
    }
  }

  /** 确认开始讨论，成功后刷新服务端详情与事件时间线。 */
  async function handleStartDiscussion() {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setErrorMessage('');

    try {
      await updateDecisionStatus(decisionId, { status: 'DISCUSSING' });
      setIsCompleted(true);
      setIsDialogOpen(false);
      router.refresh();
    } catch (error) {
      const requestId = error instanceof ApiClientError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : '决策状态更新失败，请稍后重试';
      setErrorMessage(requestId ? `${message}（请求编号：${requestId}）` : message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircleMore className="size-4" aria-hidden />
          决策操作
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          准备完成后可以开始讨论。操作成功会更新决策状态，并在下方时间线中记录本次变更。
        </p>

        {isCompleted ? (
          <Alert>
            <CheckCircle2 aria-hidden />
            <AlertTitle>已开始讨论</AlertTitle>
            <AlertDescription>正在刷新决策状态和事件时间线。</AlertDescription>
          </Alert>
        ) : (
          <AlertDialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <AlertDialogTrigger asChild>
              <Button>
                <MessageCircleMore aria-hidden />
                开始讨论
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认开始讨论？</AlertDialogTitle>
                <AlertDialogDescription>
                  决策将从“草稿”进入“讨论中”，并写入一条状态变更事件。当前阶段暂不支持退回草稿。
                </AlertDialogDescription>
              </AlertDialogHeader>

              {errorMessage ? (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden />
                  <AlertTitle>开始讨论失败</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleStartDiscussion();
                  }}
                >
                  {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  {isPending ? '正在开始…' : '确认开始'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
