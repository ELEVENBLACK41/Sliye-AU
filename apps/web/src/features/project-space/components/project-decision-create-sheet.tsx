/**
 * 本文件提供新版项目空间中便捷发起项目级或私有分区级决策的表单。
 */
'use client';

import { useState, type FormEvent } from 'react';
import { GitPullRequestCreate, Lightbulb, Loader2, Plus } from 'lucide-react';
import type { DecisionDetail } from '@workspace/contracts/decisions';
import type { DiscussionAreaSummary, ProjectDetail } from '@workspace/contracts/projects';

import { createProjectSpaceDecision } from '../services/project-space-client.service';
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

/** 新版决策创建表单属性。 */
type ProjectDecisionCreateSheetProps = {
  /** 当前项目。 */
  project: ProjectDetail;
  /** 当前讨论上下文，用于提供便捷默认范围。 */
  currentArea: DiscussionAreaSummary;
  /** 当前用户是否拥有创建决策权限。 */
  canCreate: boolean;
  /** 决策创建成功后的工作台回调。 */
  onCreated: (decision: DecisionDetail) => void;
  /** 触发按钮是否使用紧凑展示。 */
  compact?: boolean;
  /** 触发按钮是否嵌入聊天输入区。 */
  composer?: boolean;
};

/** 渲染自动继承协作成员的新版决策创建 Sheet。 */
export function ProjectDecisionCreateSheet({
  project,
  currentArea,
  canCreate,
  onCreated,
  compact = false,
  composer = false,
}: ProjectDecisionCreateSheetProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  /** 提交创建请求，并让工作台直接聚焦到新决策。 */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (pending || normalizedTitle.length < 2) return;

    setPending(true);
    setError('');
    try {
      const decision = await createProjectSpaceDecision(project.id, {
        title: normalizedTitle,
        description: description.trim() || undefined,
        departmentId: project.department.id,
        areaId: currentArea.type === 'PRIVATE' ? currentArea.id : undefined,
      });
      onCreated(decision);
      setOpen(false);
      setTitle('');
      setDescription('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '决策创建失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size={compact ? 'sm' : 'default'}
          disabled={!canCreate || project.status !== 'ACTIVE'}
          className={composer
            ? 'h-7 rounded-lg bg-project-accent px-2 text-[10px] text-project-ink hover:bg-project-accent/85'
            : 'bg-project-accent text-project-ink hover:bg-project-accent/85'}
        >
          {composer ? <Lightbulb className="size-3.5" aria-hidden /> : <Plus aria-hidden />}
          {compact || composer ? '发起决策' : '发起一项决策'}
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 border-black/10 bg-project-surface sm:max-w-lg">
        <SheetHeader className="border-b border-black/[0.07] px-5 py-5">
          <div className="mb-2 grid size-10 place-items-center rounded-2xl bg-project-accent text-project-ink">
            <GitPullRequestCreate className="size-5" aria-hidden />
          </div>
          <SheetTitle>发起一项决策</SheetTitle>
          <SheetDescription>
            参与人会从项目或小组中自动继承。创建后可以先整理提案，再开始讨论和投票。
          </SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col overflow-y-auto" onSubmit={handleSubmit}>
          <div className="grid gap-5 px-4 py-5">
            <div className="grid gap-2">
              <Label htmlFor="project-space-decision-title">要决定什么</Label>
              <Input
                id="project-space-decision-title"
                value={title}
                minLength={2}
                maxLength={120}
                required
                placeholder="例如：确定首个开源版本的发布范围"
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-space-decision-description">背景与目标</Label>
              <Textarea
                id="project-space-decision-description"
                value={description}
                maxLength={1000}
                className="min-h-28 resize-none"
                placeholder="补充需要解决的问题、约束和期望结果"
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </div>
            <section className="rounded-2xl border border-project-accent/45 bg-project-accent-soft/55 p-3" aria-labelledby="decision-scope-title">
              <p id="decision-scope-title" className="text-xs font-semibold text-project-ink">
                {currentArea.type === 'PRIVATE' ? currentArea.name : '项目公共群'}
              </p>
              <p className="mt-1 text-xs leading-5 text-project-ink/65">
                {currentArea.type === 'PRIVATE'
                  ? '创建当前小组级决策，仅继承该私有群组成员。'
                  : `创建项目级决策，自动继承“${project.title}”的项目成员。`}
              </p>
            </section>
            <p className="rounded-xl border border-black/[0.07] bg-white/45 px-3 py-2.5 text-xs leading-5 text-black/50">
              发起部门为 {project.department.name}，你将成为负责人。
            </p>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          </div>
          <SheetFooter className="mt-auto border-t bg-background">
            <Button type="submit" disabled={pending || title.trim().length < 2} className="bg-project-accent text-project-ink hover:bg-project-accent/85">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              创建并进入决策
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
