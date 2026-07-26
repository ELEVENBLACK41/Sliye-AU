/**
 * 本文件实现将私有分区选定消息发布为公共摘要的 Sheet 表单。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { DecisionSummary } from '@workspace/contracts/decisions';

import { publishMatterSummary } from '../../services/matters-client.service';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
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

/** 公开摘要操作属性。 */
type MatterPublicationActionProps = {
  matterId: number;
  areaId: number;
  sourceMessageIds: number[];
  decisions: DecisionSummary[];
  onPublished: () => void;
};

/** 渲染摘要填写与发布操作。 */
export function MatterPublicationAction({
  matterId,
  areaId,
  sourceMessageIds,
  decisions,
  onPublished,
}: MatterPublicationActionProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [decisionId, setDecisionId] = useState('none');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 发布只包含公开标题、摘要和选定来源快照的消息。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!sourceMessageIds.length || title.trim().length < 2 || summary.trim().length < 2) return;
    setPending(true);
    setError('');
    try {
      await publishMatterSummary(matterId, areaId, {
        title: title.trim(),
        summary: summary.trim(),
        sourceMessageIds,
        ...(decisionId === 'none' ? {} : { decisionId: Number(decisionId) }),
      });
      setOpen(false);
      setTitle('');
      setSummary('');
      setDecisionId('none');
      onPublished();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '发布失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" disabled={!sourceMessageIds.length}>
          <Send aria-hidden />
          发布到公共区（{sourceMessageIds.length}）
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>发布公共摘要</SheetTitle>
          <SheetDescription>公共成员只能看到快照，不能打开私有原文。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="publication-title">公开标题</Label>
            <Input
              id="publication-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="publication-summary">公开摘要</Label>
            <Textarea
              id="publication-summary"
              value={summary}
              maxLength={2000}
              className="min-h-40"
              onChange={(event) => setSummary(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>关联决策</Label>
            <Select value={decisionId} onValueChange={setDecisionId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不关联决策</SelectItem>
                {decisions.map((decision) => (
                  <SelectItem key={decision.id} value={String(decision.id)}>
                    {decision.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <SheetFooter>
            <Button
              disabled={pending || !sourceMessageIds.length || title.trim().length < 2 || summary.trim().length < 2}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}确认发布
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
