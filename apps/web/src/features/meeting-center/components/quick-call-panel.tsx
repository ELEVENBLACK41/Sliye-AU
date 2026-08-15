/**
 * 本文件实现联系人搜索、可选项目上下文和真实快速通话发起面板。
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, Mic, Phone, Search, Video, X } from 'lucide-react';
import type { MeetingMediaMode, MeetingParticipantCandidate } from '@workspace/contracts/meetings';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type { DiscussionAreaSummary } from '@workspace/contracts/projects';

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
  createQuickCall,
  getMeetingContextAreas,
  getMeetingContextDecisions,
  getMeetingParticipantCandidates,
} from '../services/meeting-center-client.service';

/** 快速通话面板属性。 */
type QuickCallPanelProps = {
  /** 当前用户可访问的项目选项。 */
  projects: MeetingCenterProjectOption[];
};

/** 渲染可立即发起语音或视频通话的右侧面板。 */
export function QuickCallPanel({ projects }: QuickCallPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<MeetingParticipantCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mediaMode, setMediaMode] = useState<MeetingMediaMode>('VIDEO');
  const [projectId, setProjectId] = useState('independent');
  const [areaId, setAreaId] = useState('none');
  const [decisionId, setDecisionId] = useState('none');
  const [areas, setAreas] = useState<DiscussionAreaSummary[]>([]);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setLoadingContacts(true);
      void getMeetingParticipantCandidates(search)
        .then((response) => setCandidates(response.items))
        .catch((error: Error) => toast.error(error.message))
        .finally(() => setLoadingContacts(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, search]);

  useEffect(() => {
    if (projectId === 'independent') return;
    const id = Number(projectId);
    void Promise.all([getMeetingContextAreas(id), getMeetingContextDecisions(id)])
      .then(([nextAreas, nextDecisions]) => {
        setAreas(nextAreas);
        setDecisions(nextDecisions);
      })
      .catch((error: Error) => toast.error(error.message));
  }, [projectId]);

  /** 切换项目上下文并同步清空旧分区和决策选择。 */
  function handleProjectChange(value: string): void {
    setProjectId(value);
    setAreaId('none');
    setDecisionId('none');
    if (value === 'independent') {
      setAreas([]);
      setDecisions([]);
    }
  }

  /** 选择或取消选择一位联系人。 */
  function toggleParticipant(userId: number): void {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  /** 创建快速通话并进入自研会议房间。 */
  async function handleStartCall(): Promise<void> {
    if (selectedIds.length === 0) {
      toast.error('请至少选择一位联系人');
      return;
    }
    if (projectId !== 'independent' && areaId === 'none') {
      toast.error('选择项目后还需要选择会议分区');
      return;
    }
    setSubmitting(true);
    try {
      const meeting = await createQuickCall({
        mediaMode,
        participantIds: selectedIds,
        areaId: areaId === 'none' ? undefined : Number(areaId),
        decisionIds: decisionId === 'none' ? [] : [Number(decisionId)],
      });
      setOpen(false);
      router.push(`/meetings/${meeting.id}/room`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '快速通话发起失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="h-11 rounded-xl bg-meeting-accent px-4 text-meeting-accent-foreground hover:bg-meeting-accent/85"
        >
          <Phone aria-hidden />
          快速通话
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden border-meeting-line bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-[27rem] lg:inset-y-4 lg:right-4 lg:h-auto lg:rounded-3xl lg:border"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-5 top-5 z-10 rounded-full"
          aria-label="关闭快速通话"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden />
        </Button>
        <SheetHeader className="border-b border-meeting-line bg-meeting-accent-soft/40 px-6 py-5 pr-16">
          <p className="text-xs font-medium text-meeting-accent-foreground">发起通话</p>
          <SheetTitle className="mt-1 text-xl font-semibold tracking-tight">快速通话</SheetTitle>
          <SheetDescription className="mt-1">选择联系人后立即振铃 30 秒，可独立发起或关联项目。</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索姓名、邮箱或部门"
              className="h-11 rounded-xl bg-background pl-10"
            />
          </div>

          <section className="mt-5" aria-labelledby="quick-call-members-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="quick-call-members-title" className="text-sm font-semibold">
                选择联系人
              </h2>
              <span className="text-xs text-muted-foreground">已选 {selectedIds.length} 人</span>
            </div>
            <div className="mt-3 grid gap-2">
              {loadingContacts ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border py-8 text-sm text-muted-foreground">
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  加载联系人
                </div>
              ) : candidates.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
                  没有找到可联系的成员
                </div>
              ) : (
                candidates.map((candidate) => {
                  const selected = selectedIds.includes(candidate.id);
                  return (
                    <Button
                      key={candidate.id}
                      type="button"
                      variant="ghost"
                      onClick={() => toggleParticipant(candidate.id)}
                      className="h-auto justify-between rounded-2xl border bg-background px-4 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{candidate.name ?? candidate.email}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {candidate.departmentName} · {candidate.email}
                        </span>
                      </span>
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-meeting-accent bg-meeting-accent text-meeting-accent-foreground' : ''
                        }`}
                      >
                        {selected ? <Check aria-hidden className="size-3.5" /> : null}
                      </span>
                    </Button>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-5 rounded-2xl border bg-background/70 p-4" aria-labelledby="call-context-title">
            <h2 id="call-context-title" className="text-sm font-semibold">
              关联上下文（可选）
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">不选择项目时，本次通话仅对受邀人可见。</p>
            <div className="mt-4 grid gap-3">
              <Select value={projectId} onValueChange={handleProjectChange}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">独立通话</SelectItem>
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
                    <SelectTrigger className="h-10 rounded-xl">
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
                    <SelectTrigger className="h-10 rounded-xl">
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
            </div>
          </section>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-3 border-t bg-background/80 px-6 py-5">
          <Button
            type="button"
            variant={mediaMode === 'AUDIO' ? 'default' : 'outline'}
            size="lg"
            onClick={() => setMediaMode('AUDIO')}
            className="h-12 rounded-xl"
          >
            <Mic aria-hidden />
            语音
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={submitting}
            onClick={() => {
              if (mediaMode !== 'VIDEO') setMediaMode('VIDEO');
              else void handleStartCall();
            }}
            className="h-12 rounded-xl bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85"
          >
            {submitting ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
            {mediaMode === 'VIDEO' ? '发起视频通话' : '切换视频'}
          </Button>
          {mediaMode === 'AUDIO' ? (
            <Button
              type="button"
              size="lg"
              disabled={submitting}
              onClick={() => void handleStartCall()}
              className="col-span-2 h-11 rounded-xl"
            >
              <Phone aria-hidden />
              发起语音通话
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
