/**
 * 本文件实现决策详情页新增参与者的候选加载、身份选择、提交和反馈状态。
 */
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, TriangleAlert, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { AddableDecisionParticipantRole, DecisionParticipantCandidate } from '@workspace/contracts/decisions';

import {
  addDecisionParticipant,
  getDecisionParticipantCandidates,
} from '@/features/decisions/services/decisions-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
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

/** 新增参与者操作组件属性。 */
type DecisionParticipantActionsProps = {
  /** 当前决策数据库主键。 */
  decisionId: number;
};

/** Sheet 当前入场动画时长，请求在动画结束后启动，避免状态刷新影响动画流畅度。 */
const SHEET_ENTER_ANIMATION_MS = 200;

/** 表单可分配的非负责人身份选项。 */
const participantRoleOptions: ReadonlyArray<{
  /** 提交给服务端的稳定身份代码。 */
  value: AddableDecisionParticipantRole;
  /** 面向用户展示的中文身份名称。 */
  label: string;
}> = [
  { value: 'VIEWER', label: '查看者' },
  { value: 'EDITOR', label: '编辑者' },
  { value: 'APPROVER', label: '审批人' },
];

/** 渲染新增参与者 Sheet，并覆盖加载、空、错误、提交和成功状态。 */
export function DecisionParticipantActions({ decisionId }: DecisionParticipantActionsProps) {
  const router = useRouter();
  const loadCandidatesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<DecisionParticipantCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState<AddableDecisionParticipantRole>('VIEWER');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /** 组件卸载时取消尚未开始的候选人请求，避免卸载后继续更新状态。 */
  useEffect(() => {
    return () => {
      if (loadCandidatesTimerRef.current) {
        clearTimeout(loadCandidatesTimerRef.current);
      }
    };
  }, []);

  /** 从决策专用候选接口加载可添加用户，避免依赖权限管理权限。 */
  async function loadCandidates() {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await getDecisionParticipantCandidates(decisionId);
      setCandidates(result);
      setSelectedUserId(result[0]?.id.toString() ?? '');
    } catch (error) {
      setCandidates([]);
      setSelectedUserId('');
      setErrorMessage(getErrorMessage(error, '参与者候选列表加载失败，请稍后重试'));
    } finally {
      setIsLoading(false);
    }
  }

  /** 打开面板时刷新候选数据，关闭时清理本次操作反馈。 */
  function handleOpenChange(nextOpen: boolean) {
    if (loadCandidatesTimerRef.current) {
      clearTimeout(loadCandidatesTimerRef.current);
      loadCandidatesTimerRef.current = null;
    }

    setIsOpen(nextOpen);
    setErrorMessage('');
    setSuccessMessage('');

    if (nextOpen) {
      setCandidates([]);
      setSelectedUserId('');
      setIsLoading(true);
      loadCandidatesTimerRef.current = setTimeout(() => {
        loadCandidatesTimerRef.current = null;
        void loadCandidates();
      }, SHEET_ENTER_ANIMATION_MS);
    } else {
      setIsLoading(false);
    }
  }

  /** 提交参与者和身份，成功后刷新服务端详情并从候选列表移除该用户。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userId = Number(selectedUserId);

    if (!Number.isInteger(userId) || userId < 1) {
      setErrorMessage('请选择需要添加的用户');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const participant = await addDecisionParticipant(decisionId, {
        userId,
        role,
      });
      const remainingCandidates = candidates.filter((candidate) => candidate.id !== participant.user.id);

      setCandidates(remainingCandidates);
      setSelectedUserId(remainingCandidates[0]?.id.toString() ?? '');
      setSuccessMessage(
        `${participant.user.name || `用户 ${participant.user.id}`}已添加为${getRoleLabel(participant.role)}`,
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '添加参与者失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          添加参与者
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>添加参与者</SheetTitle>
          <SheetDescription>选择尚未参与当前决策的可用用户，并分配决策内身份。</SheetDescription>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                正在加载候选用户…
              </div>
            ) : null}

            {!isLoading && errorMessage ? (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertTitle>操作失败</AlertTitle>
                <AlertDescription>
                  <p>{errorMessage}</p>
                  {!candidates.length ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadCandidates()}>
                      重新加载
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {successMessage ? (
              <Alert>
                <CheckCircle2 aria-hidden />
                <AlertTitle>添加成功</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            ) : null}

            {!isLoading && !errorMessage && !candidates.length ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                当前没有可以继续添加的用户。
              </p>
            ) : null}

            {candidates.length ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="decision-participant-user">参与用户</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger id="decision-participant-user">
                      <SelectValue placeholder="请选择用户" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id.toString()}>
                          {candidate.name || `用户 ${candidate.id}`} · {candidate.department?.name || '未分配部门'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="decision-participant-role">决策身份</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as AddableDecisionParticipantRole)}>
                    <SelectTrigger id="decision-participant-role">
                      <SelectValue placeholder="请选择身份" />
                    </SelectTrigger>
                    <SelectContent>
                      {participantRoleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
          </div>

          <SheetFooter>
            <Button type="submit" disabled={isLoading || isSubmitting || !selectedUserId}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
              {isSubmitting ? '正在添加…' : '确认添加'}
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

/** 返回新增成功提示使用的参与者身份中文名称。 */
function getRoleLabel(role: string): string {
  return participantRoleOptions.find((option) => option.value === role)?.label ?? role;
}
