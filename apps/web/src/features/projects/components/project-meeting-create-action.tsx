/**
 * 本文件实现从当前公共或私有分区创建多决策会议。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type { DiscussionAreaSummary, ProjectUserSummary } from '@workspace/contracts/projects';

import { DateTimePicker } from '@/components/date-time-picker';
import { createProjectMeeting } from '../services/projects-client.service';
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
import { cn } from '@workspace/ui/lib/utils';

/** 当前分区会议创建操作属性。 */
type ProjectMeetingCreateActionProps = {
  projectId: number;
  area: DiscussionAreaSummary;
  decisions: DecisionSummary[];
  candidates: ProjectUserSummary[];
};

/** 渲染会议信息、多决策和多参会人选择。 */
export function ProjectMeetingCreateAction({ projectId, area, decisions, candidates }: ProjectMeetingCreateActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date>();
  const [decisionIds, setDecisionIds] = useState<number[]>([]);
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 在数字集合中切换一项选择。 */
  function toggle(values: number[], value: number, setter: (next: number[]) => void): void {
    setter(values.includes(value) ? values.filter((id) => id !== value) : [...values, value]);
  }

  /** 创建分区会议并进入独立会议房间。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || title.trim().length < 2) return;
    setPending(true);
    setError('');
    try {
      const meeting = await createProjectMeeting(projectId, {
        areaId: area.id,
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: scheduledAt?.toISOString(),
        decisionIds,
        participantIds,
      });
      setOpen(false);
      router.push(`/meetings/${meeting.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '会议创建失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <CalendarPlus aria-hidden />
          在当前分区开会
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{area.type === 'PUBLIC' ? '创建公共会议' : '创建私有会议'}</SheetTitle>
          <SheetDescription>参会人候选范围已按当前分区自动裁剪。</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="project-meeting-title">会议标题</Label>
            <Input
              id="project-meeting-title"
              value={title}
              required
              maxLength={120}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-meeting-description">会议说明</Label>
            <Textarea
              id="project-meeting-description"
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </div>
          <DateTimePicker
            id="project-meeting-time"
            label="计划时间"
            value={scheduledAt}
            onChange={setScheduledAt}
            disablePast
          />
          <ChoiceGroup
            label="关联决策（可为空）"
            items={decisions.map((item) => ({
              id: item.id,
              label: `${item.scope === 'AREA' ? '【小组】' : '【项目】'}${item.title}`,
            }))}
            selected={decisionIds}
            onToggle={(id) => toggle(decisionIds, id, setDecisionIds)}
          />
          <ChoiceGroup
            label="参会人"
            items={candidates.map((item) => ({ id: item.id, label: item.name || `用户 ${item.id}` }))}
            selected={participantIds}
            onToggle={(id) => toggle(participantIds, id, setParticipantIds)}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <SheetFooter>
            <Button disabled={pending || title.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}创建会议
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** 使用语义按钮实现无原生 Checkbox 的多选组。 */
function ChoiceGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: Array<{ id: number; label: string }>;
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={selected.includes(item.id) ? 'secondary' : 'outline'}
              className={cn('h-auto whitespace-normal text-left')}
              aria-pressed={selected.includes(item.id)}
              onClick={() => onToggle(item.id)}
            >
              {item.label}
            </Button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">暂无可选项</p>
        )}
      </div>
    </fieldset>
  );
}
