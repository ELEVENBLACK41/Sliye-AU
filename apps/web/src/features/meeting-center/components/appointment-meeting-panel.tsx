/**
 * 本文件实现预约会议创建表单、联系人选择和可选项目上下文。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, LoaderCircle, Search, Video } from 'lucide-react';
import type { MeetingMediaMode, MeetingParticipantCandidate } from '@workspace/contracts/meetings';
import type { DiscussionAreaSummary } from '@workspace/contracts/projects';
import type { DecisionSummary } from '@workspace/contracts/decisions';

import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
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
import { toast } from '@workspace/ui/components/sonner';

import type { MeetingCenterProjectOption } from '../types/meeting-center.types';
import {
  createAppointment,
  getMeetingContextAreas,
  getMeetingContextDecisions,
  getMeetingParticipantCandidates,
} from '../services/meeting-center-client.service';

/** 预约会议面板属性。 */
type AppointmentMeetingPanelProps = {
  /** 当前用户可访问的项目。 */
  projects: MeetingCenterProjectOption[];
};

/** 渲染预约会议创建面板。 */
export function AppointmentMeetingPanel({ projects }: AppointmentMeetingPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [mediaMode, setMediaMode] = useState<MeetingMediaMode>('VIDEO');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<MeetingParticipantCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [projectId, setProjectId] = useState('independent');
  const [areaId, setAreaId] = useState('none');
  const [decisionId, setDecisionId] = useState('none');
  const [areas, setAreas] = useState<DiscussionAreaSummary[]>([]);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || candidates.length > 0) return;
    void getMeetingParticipantCandidates()
      .then((response) => setCandidates(response.items))
      .catch((error: Error) => toast.error(error.message));
  }, [open, candidates.length]);

  useEffect(() => {
    if (projectId === 'independent') return;
    void Promise.all([getMeetingContextAreas(Number(projectId)), getMeetingContextDecisions(Number(projectId))])
      .then(([nextAreas, nextDecisions]) => {
        setAreas(nextAreas);
        setDecisions(nextDecisions);
      })
      .catch((error: Error) => toast.error(error.message));
  }, [projectId]);

  /** 切换项目上下文并清空旧项目下的分区和决策选择。 */
  function handleProjectChange(value: string): void {
    setProjectId(value);
    setAreaId('none');
    setDecisionId('none');
    if (value === 'independent') {
      setAreas([]);
      setDecisions([]);
    }
  }

  const visibleCandidates = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('zh-CN');
    if (!keyword) return candidates;
    return candidates.filter((candidate) =>
      [candidate.name, candidate.email, candidate.departmentName]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('zh-CN').includes(keyword)),
    );
  }, [candidates, search]);

  /** 选择或取消选择一位受邀成员。 */
  function toggleParticipant(userId: number): void {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  /** 提交预约会议并刷新服务端日程数据。 */
  async function handleCreate(): Promise<void> {
    if (title.trim().length < 2 || !scheduledAt) {
      toast.error('请填写会议标题和开始时间');
      return;
    }
    if (projectId !== 'independent' && areaId === 'none') {
      toast.error('选择项目后还需要选择会议分区');
      return;
    }
    setSubmitting(true);
    try {
      await createAppointment({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: new Date(scheduledAt).toISOString(),
        scheduledDurationMinutes: Number(duration),
        mediaMode,
        participantIds: selectedIds,
        areaId: areaId === 'none' ? undefined : Number(areaId),
        decisionIds: decisionId === 'none' ? [] : [Number(decisionId)],
      });
      toast.success('预约会议已创建');
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预约会议创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="lg" className="h-11 rounded-xl px-4">
          <CalendarDays aria-hidden />
          预约会议
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-meeting-accent-soft/35 px-6 py-5">
          <SheetTitle>预约会议</SheetTitle>
          <SheetDescription>受邀人可在计划时间前 30 分钟进入，无需等待主持人。</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="会议标题" />
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="会议说明（可选）"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                aria-label="计划开始时间"
              />
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[30, 45, 60, 90, 120].map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} 分钟
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Select value={mediaMode} onValueChange={(value) => setMediaMode(value as MeetingMediaMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIDEO">视频会议</SelectItem>
                <SelectItem value="AUDIO">语音会议</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <section aria-labelledby="appointment-members-title">
            <div className="flex items-center justify-between">
              <h3 id="appointment-members-title" className="text-sm font-semibold">
                受邀成员
              </h3>
              <span className="text-xs text-muted-foreground">已选 {selectedIds.length} 人</span>
            </div>
            <div className="relative mt-3">
              <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="筛选联系人"
                className="pl-9"
              />
            </div>
            <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1">
              {visibleCandidates.map((candidate) => {
                const selected = selectedIds.includes(candidate.id);
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    variant="ghost"
                    onClick={() => toggleParticipant(candidate.id)}
                    className="h-auto justify-between rounded-xl border px-3 py-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{candidate.name ?? candidate.email}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {candidate.departmentName}
                      </span>
                    </span>
                    {selected ? <Check aria-hidden className="size-4 text-meeting-accent" /> : null}
                  </Button>
                );
              })}
            </div>
          </section>

          <section
            className="grid gap-3 rounded-2xl border bg-muted/20 p-4"
            aria-labelledby="appointment-context-title"
          >
            <div>
              <h3 id="appointment-context-title" className="text-sm font-semibold">
                关联上下文（可选）
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">独立预约只对受邀人可见。</p>
            </div>
            <Select value={projectId} onValueChange={handleProjectChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="independent">独立预约</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectId !== 'independent' ? (
              <>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择会议分区" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">选择会议分区</SelectItem>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={String(area.id)}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={decisionId} onValueChange={setDecisionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="不关联决策" />
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
              </>
            ) : null}
          </section>
        </div>
        <SheetFooter className="border-t px-6 py-5">
          <Button type="button" onClick={() => void handleCreate()} disabled={submitting} className="h-11 rounded-xl">
            {submitting ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
            创建预约会议
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
