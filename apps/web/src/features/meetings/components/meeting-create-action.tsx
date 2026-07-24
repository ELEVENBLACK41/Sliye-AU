/**
 * 本文件实现从决策详情创建会议的 Sheet 表单。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { CalendarPlus, Loader2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { createMeeting } from '../services/meetings-client.service';
import { DateTimePicker } from '@/components/date-time-picker';
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

/** 创建会议操作属性。 */
type MeetingCreateActionProps = {
  /** 当前决策主键。 */
  decisionId: number;
};

/** 渲染会议创建表单并在成功后进入独立会议房间。 */
export function MeetingCreateAction({ decisionId }: MeetingCreateActionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date>();
  const [errorMessage, setErrorMessage] = useState('');

  /** 打开表单时清空上一次输入和反馈。 */
  function handleOpenChange(nextOpen: boolean): void {
    setIsOpen(nextOpen);
    setErrorMessage('');

    if (nextOpen) {
      setTitle('');
      setDescription('');
      setScheduledAt(undefined);
    }
  }

  /** 校验并创建会议，成功后跳转到独立会议房间。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (title.trim().length < 2) {
      setErrorMessage('会议标题至少需要 2 个字符');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const meeting = await createMeeting(decisionId, {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: scheduledAt?.toISOString(),
      });

      setIsOpen(false);
      router.push(`/meetings/${meeting.id}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button>
          <CalendarPlus aria-hidden />
          创建会议
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>创建决策会议</SheetTitle>
          <SheetDescription>会议不强制绑定提案，进入房间后可以继续产生多个提案和多轮投票。</SheetDescription>
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
            <div className="grid gap-2">
              <Label htmlFor="meeting-title">会议标题</Label>
              <Input
                id="meeting-title"
                value={title}
                minLength={2}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meeting-description">会议目标</Label>
              <Textarea
                id="meeting-description"
                value={description}
                maxLength={2000}
                className="min-h-28 resize-y"
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <DateTimePicker
              id="meeting-scheduled-at"
              label="计划时间（可选）"
              value={scheduledAt}
              placeholder="选择计划日期和时间"
              disabled={isSubmitting}
              disablePast
              onChange={setScheduledAt}
            />
          </div>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting || title.trim().length < 2}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />}
              {isSubmitting ? '正在创建…' : '创建并进入房间'}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** 将请求异常转换为安全中文提示。 */
function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError || error instanceof Error ? error.message : '会议创建失败，请稍后重试';
}
