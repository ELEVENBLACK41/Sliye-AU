/**
 * 本文件提供项目会议房间中的决策协作闭环预览，按讨论、提案、投票和正式决议组织界面。
 */
'use client';

import { ChevronRight, Lightbulb, LockKeyhole, MessageSquare, Stamp, Vote } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Textarea } from '@workspace/ui/components/textarea';

/** 决策闭环的稳定阶段配置。 */
const decisionStages = [
  { key: 'discussion', label: '讨论', icon: MessageSquare },
  { key: 'proposals', label: '提案', icon: Lightbulb },
  { key: 'votes', label: '投票', icon: Vote },
  { key: 'resolution', label: '决议', icon: Stamp },
] as const;

/** 渲染会议房间右侧的完整决策协作流程预览。 */
export function MeetingDecisionCollaborationPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-meeting-line px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">决策协作</h2>
          <span className="rounded-full bg-meeting-accent-soft px-3 py-1 text-xs font-medium text-meeting-accent-foreground">
            流程预览
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          会议中形成的讨论、提案、投票与正式决议将统一记录。
        </p>
      </header>

      <Tabs defaultValue="discussion" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          className="grid h-auto w-full grid-cols-4 gap-0 border-b border-meeting-line px-3 py-2"
        >
          {decisionStages.map((stage) => {
            const Icon = stage.icon;

            return (
              <TabsTrigger key={stage.key} value={stage.key} className="min-w-0 flex-col gap-1 py-2 text-xs">
                <Icon aria-hidden className="size-4" />
                {stage.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <DecisionProcessOverview />

          <TabsContent value="discussion" className="mt-5">
            <section aria-labelledby="meeting-discussion-title">
              <h3 id="meeting-discussion-title" className="font-semibold">
                会议讨论
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                实时消息接入后，可从讨论内容继续整理为正式提案。
              </p>
              <div className="mt-4 rounded-2xl border border-dashed px-5 py-7 text-center">
                <MessageSquare aria-hidden className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">讨论记录待接入</p>
                <p className="mt-1 text-xs text-muted-foreground">当前不使用静态消息模拟真实讨论。</p>
              </div>
              <Textarea disabled placeholder="输入会议讨论内容" className="mt-4 min-h-24 resize-none rounded-2xl" />
              <Button disabled className="mt-3 w-full rounded-xl">
                发送讨论
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="proposals" className="mt-5">
            <CollaborationEmptyState
              icon={Lightbulb}
              title="提案将在这里形成"
              description="从讨论中整理备选方案，并明确提案发起人和适用范围。"
              actionLabel="创建提案"
            />
          </TabsContent>

          <TabsContent value="votes" className="mt-5">
            <CollaborationEmptyState
              icon={Vote}
              title="投票轮次待创建"
              description="选择开放提案后发起投票，真实票数与参与资格由后端裁剪。"
              actionLabel="发起投票"
            />
          </TabsContent>

          <TabsContent value="resolution" className="mt-5">
            <CollaborationEmptyState
              icon={Stamp}
              title="尚未形成正式决议"
              description="投票关闭后，由具备权限的参与者确认内容并固化正式决议。"
              actionLabel="形成正式决议"
            />
          </TabsContent>
        </div>
      </Tabs>

      <footer className="flex shrink-0 items-center gap-2 border-t border-meeting-line px-5 py-4 text-xs text-muted-foreground">
        <LockKeyhole aria-hidden className="size-4" />
        权限与阶段规则将在接入真实决策后生效
      </footer>
    </div>
  );
}

/** 渲染不代表真实业务状态的四阶段流程说明。 */
function DecisionProcessOverview() {
  return (
    <section className="rounded-2xl border bg-background/70 p-4" aria-labelledby="decision-process-title">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">关联决策</p>
          <h3 id="decision-process-title" className="mt-1 truncate font-semibold">
            决策数据待接入
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">未读取状态</span>
      </div>

      <ol className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1" aria-label="决策流程阶段">
        {decisionStages.map((stage, index) => {
          const Icon = stage.icon;

          return (
            <li key={stage.key} className="contents">
              <span className="flex min-w-0 flex-col items-center gap-2 text-center text-xs text-muted-foreground">
                <span className="flex size-8 items-center justify-center rounded-full border bg-background">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                {stage.label}
              </span>
              {index < decisionStages.length - 1 ? (
                <ChevronRight aria-hidden className="size-3.5 text-muted-foreground/50" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** 单个协作阶段空状态的属性。 */
type CollaborationEmptyStateProps = {
  /** 阶段图标。 */
  icon: typeof Lightbulb;
  /** 空状态标题。 */
  title: string;
  /** 当前阶段下一步说明。 */
  description: string;
  /** 待接入操作的按钮名称。 */
  actionLabel: string;
};

/** 渲染提案、投票或决议阶段的明确空状态。 */
function CollaborationEmptyState({ icon: Icon, title, description, actionLabel }: CollaborationEmptyStateProps) {
  return (
    <section className="rounded-2xl border border-dashed px-5 py-8 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-meeting-accent-soft text-meeting-accent-foreground">
        <Icon aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      <Button disabled variant="outline" className="mt-5 w-full rounded-xl">
        {actionLabel}
      </Button>
    </section>
  );
}
