/**
 * 本文件实现在当前议事中创建一项决策的 Sheet 表单。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { createMatterDecision } from '../services/matters-client.service';
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

/** 议事决策创建操作属性。 */
type MatterDecisionCreateActionProps = { matterId: number; departmentId: number };

/** 创建决策并跳转到新的嵌套路由。 */
export function MatterDecisionCreateAction({ matterId, departmentId }: MatterDecisionCreateActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 提交新决策并进入决策详情。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || title.trim().length < 2) return;
    setPending(true);
    setError('');
    try {
      const decision = await createMatterDecision(matterId, {
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId,
      });
      setOpen(false);
      router.push(`/dashboard/matters/${matterId}/decisions/${decision.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '决策创建失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden />
          新建决策
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>在议事中创建决策</SheetTitle>
          <SheetDescription>决策共享当前议事讨论，不再创建独立群聊。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="matter-decision-title">决策标题</Label>
            <Input
              id="matter-decision-title"
              value={title}
              minLength={2}
              maxLength={120}
              required
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="matter-decision-description">背景说明</Label>
            <Textarea
              id="matter-decision-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <SheetFooter>
            <Button disabled={pending || title.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}创建决策
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
