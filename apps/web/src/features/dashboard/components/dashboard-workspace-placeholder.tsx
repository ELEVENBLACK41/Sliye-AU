/**
 * 本文件保留新版工作台 Bento 信息架构，并按业务面板流式接入真实数据。
 */
import { Suspense, type ReactNode } from 'react';
import type { AuthUser } from '@workspace/contracts/auth';
import type { DashboardInsightsResponse } from '@workspace/contracts/dashboard';
import type { MeetingCenterOverviewResponse } from '@workspace/contracts/meetings';

import { Card } from '@workspace/ui/components/card';
import { DashboardAiAssistantPlaceholder } from './dashboard-ai-assistant-placeholder';
import { DashboardDecisionCardStack } from './dashboard-decision-card-stack';
import { DashboardMeetingSchedulePlaceholder } from './dashboard-meeting-schedule-placeholder';
import { DashboardProjectStatusPlaceholder } from './dashboard-project-status-placeholder';
import { DashboardProfileCardPlaceholder } from './dashboard-profile-card-placeholder';
import { DashboardProposalAdoptionPlaceholder } from './dashboard-proposal-adoption-placeholder';
import { DashboardResolutionTrendPlaceholder } from './dashboard-resolution-trend-placeholder';
import { DashboardSectionError } from './dashboard-section-error';
import {
  DashboardDecisionStackSkeleton,
  DashboardMeetingSkeleton,
  DashboardPanelSkeleton,
} from './dashboard-skeletons';
import type { DashboardMeetingScheduleItem } from '../types/dashboard.types';

/** 工作台主体属性。 */
type DashboardWorkspacePlaceholderProps = {
  /** 当前登录用户，用于个人资料卡。 */
  user: AuthUser;
  /** 已在路由入口启动的工作台洞察请求。 */
  insights: Promise<DashboardInsightsResponse>;
  /** 已在路由入口启动的会议中心周概览请求。 */
  meetings: Promise<MeetingCenterOverviewResponse>;
  /** 当前中国标准时间日期键。 */
  date: string;
};

/** 通用业务面板属性。 */
type WorkspacePanelProps = {
  /** 面板内部内容。 */
  children: ReactNode;
  /** 面板附加布局样式。 */
  className?: string;
  /** 面板语义名称。 */
  label: string;
  /** 面板使用的基础视觉色调。 */
  tone?: 'light' | 'dark' | 'yellow' | 'glass';
};

/** 使用共享 Card 组件渲染工作台业务面板外壳。 */
function WorkspacePanel({ children, className = '', label, tone = 'light' }: WorkspacePanelProps) {
  const toneClassName = {
    light: 'border-border/50 bg-background/55 text-foreground',
    dark: 'border-primary-foreground/5 bg-decision-panel text-primary-foreground',
    yellow: 'border-decision-accent/30 bg-decision-accent text-decision-ink',
    glass: 'border-primary-foreground/70 bg-transparent text-foreground',
  }[tone];

  return (
    <Card
      aria-label={label}
      className={`gap-0 rounded-[1.75rem] py-0 shadow-none backdrop-blur-sm ${toneClassName} ${className}`}
    >
      {children}
    </Card>
  );
}

/** 渲染当前用户真实资料卡。 */
function ProfilePanelPlaceholder({ user }: { user: AuthUser }) {
  return (
    <WorkspacePanel
      label="个人资料"
      className="relative min-h-72 overflow-hidden border-border/35 bg-muted lg:min-h-[22rem]"
    >
      <DashboardProfileCardPlaceholder user={user} />
    </WorkspacePanel>
  );
}

/** 等待工作台洞察并渲染年度正式决策趋势。 */
async function ResolutionTrendStream({ data }: { data: Promise<DashboardInsightsResponse> }) {
  let insights: DashboardInsightsResponse;
  try {
    insights = await data;
  } catch {
    return <DashboardSectionError title="决策趋势" />;
  }
  return (
    <DashboardResolutionTrendPlaceholder
      year={insights.year}
      throughMonth={insights.throughMonth}
      trend={insights.resolutionTrend}
    />
  );
}

/** 等待工作台洞察并渲染提案采纳率。 */
async function ProposalAdoptionStream({ data }: { data: Promise<DashboardInsightsResponse> }) {
  let insights: DashboardInsightsResponse;
  try {
    insights = await data;
  } catch {
    return <DashboardSectionError title="提案采纳率" />;
  }
  return <DashboardProposalAdoptionPlaceholder adoption={insights.proposalAdoption} />;
}

/** 等待工作台洞察并渲染项目生命周期分布。 */
async function ProjectStatusStream({ data }: { data: Promise<DashboardInsightsResponse> }) {
  let insights: DashboardInsightsResponse;
  try {
    insights = await data;
  } catch {
    return <DashboardSectionError title="项目状态" compact />;
  }
  return <DashboardProjectStatusPlaceholder statuses={insights.projectStatuses} />;
}

/** 等待工作台洞察并渲染最近推进中的决策卡片。 */
async function DecisionStackStream({ data }: { data: Promise<DashboardInsightsResponse> }) {
  let insights: DashboardInsightsResponse;
  try {
    insights = await data;
  } catch {
    return <DashboardSectionError title="进行中决策" />;
  }
  return <DashboardDecisionCardStack items={insights.decisionStack} />;
}

/** 等待会议中心周概览并渲染同源时间线。 */
async function MeetingScheduleStream({
  data,
  date,
}: {
  /** 会议中心周概览请求。 */
  data: Promise<MeetingCenterOverviewResponse>;
  /** 当前中国标准时间日期键。 */
  date: string;
}) {
  let overview: MeetingCenterOverviewResponse;
  try {
    overview = await data;
  } catch {
    return <DashboardSectionError title="会议时间线" />;
  }
  const meetings: DashboardMeetingScheduleItem[] = overview.calendarItems.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    participantCount: meeting.participantCount,
    projectTitle: meeting.projectTitle,
    areaName: meeting.areaName,
    scheduledAt: meeting.scheduledAt,
    scheduledDurationMinutes: meeting.scheduledDurationMinutes,
    startedAt: meeting.startedAt,
    createdAt: meeting.createdAt,
  }));
  return <DashboardMeetingSchedulePlaceholder date={date} meetings={meetings} />;
}

/** 渲染与既有新版 UI 一致的四栏工作台主体结构。 */
export function DashboardWorkspacePlaceholder({ user, insights, meetings, date }: DashboardWorkspacePlaceholderProps) {
  return (
    <section
      className="grid flex-1 gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(13rem,0.75fr)_minmax(14rem,0.775fr)_minmax(14rem,0.775fr)_minmax(15rem,0.8fr)] xl:grid-rows-[minmax(22rem,1fr)_minmax(20rem,1fr)]"
      aria-label="工作台主体"
    >
      <div className="min-w-0 xl:col-start-1 xl:row-start-1 [&>*]:h-full">
        <ProfilePanelPlaceholder user={user} />
      </div>

      <div className="min-w-0 xl:z-10 xl:col-start-1 xl:row-start-2 xl:-mt-12 xl:h-[calc(100%+3rem)] [&>*]:h-full">
        <DashboardAiAssistantPlaceholder />
      </div>

      <div className="min-w-0 xl:col-start-2 xl:row-start-1">
        <WorkspacePanel label="本年度正式决策趋势" className="h-full min-h-72 overflow-hidden p-5">
          <Suspense fallback={<DashboardPanelSkeleton label="决策趋势" />}>
            <ResolutionTrendStream data={insights} />
          </Suspense>
        </WorkspacePanel>
      </div>

      <div className="min-w-0 xl:col-start-3 xl:row-start-1">
        <WorkspacePanel label="全部已结束提案采纳率" className="h-full min-h-72 overflow-hidden p-5">
          <Suspense fallback={<DashboardPanelSkeleton label="提案采纳率" />}>
            <ProposalAdoptionStream data={insights} />
          </Suspense>
        </WorkspacePanel>
      </div>

      <div className="min-w-0 md:col-span-2 xl:col-start-2 xl:col-end-4 xl:row-start-2 [&>*]:h-full">
        <WorkspacePanel label="我的会议日程" className="min-h-[20rem] overflow-hidden p-5">
          <Suspense fallback={<DashboardMeetingSkeleton />}>
            <MeetingScheduleStream data={meetings} date={date} />
          </Suspense>
        </WorkspacePanel>
      </div>

      <div className="grid min-w-0 gap-2.5 md:col-span-2 md:grid-cols-2 xl:col-start-4 xl:row-start-1 xl:row-end-3 xl:flex xl:h-full xl:flex-col">
        <WorkspacePanel label="项目空间状态分布" className="p-5 xl:h-48 xl:shrink-0">
          <Suspense fallback={<DashboardPanelSkeleton label="项目状态" />}>
            <ProjectStatusStream data={insights} />
          </Suspense>
        </WorkspacePanel>
        <WorkspacePanel label="可拖拽决策卡片堆" tone="dark" className="min-h-[26rem] flex-1 overflow-hidden">
          <Suspense fallback={<DashboardDecisionStackSkeleton />}>
            <DecisionStackStream data={insights} />
          </Suspense>
        </WorkspacePanel>
      </div>
    </section>
  );
}
