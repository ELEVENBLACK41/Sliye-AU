/**
 * 本文件使用 AI Elements Tool 展示经过脱敏的工具输入、执行状态与受控结果摘要。
 */
'use client';

import type { ReactNode } from 'react';

import { Badge } from '@workspace/ui/components/badge';

import {
  Tool,
  ToolContent,
  ToolHeader,
  type ToolPart,
} from '@/components/ai-elements/tool';

import type { AiToolCallView, AiToolDisplayState } from '../utils/ai-tool-call-view';

/** 工具调用卡仅消费统一的安全展示模型。 */
export type AiToolCallCardProps = {
  /** 首次流与历史恢复共用的工具展示数据。 */
  tool: AiToolCallView;
};

/** 工具状态在 AI Elements Tool 协议中的对应状态。 */
const TOOL_PART_STATE_BY_DISPLAY_STATE: Record<AiToolDisplayState, ToolPart['state']> = {
  waiting: 'input-streaming',
  running: 'input-available',
  success: 'output-available',
  failed: 'output-error',
  cancelled: 'output-denied',
  waiting_approval: 'approval-requested',
};

/** 工具状态面向用户的补充说明。 */
const TOOL_STATE_DESCRIPTION: Record<AiToolDisplayState, string> = {
  waiting: '工具已进入队列，等待开始读取当前决策。',
  running: '正在校验访问权限并读取当前决策的真实数据。',
  success: '已完成权限校验和决策基础上下文读取。',
  failed: '工具未能完成读取，可查看下方稳定错误信息。',
  cancelled: '本次工具读取已取消，不会继续处理。',
  waiting_approval: '工具正在等待明确审批，尚未读取业务数据。',
};

/** 渲染结构化工具调用卡，并确保展开内容只包含白名单字段。 */
export function AiToolCallCard({ tool }: AiToolCallCardProps) {
  const state = TOOL_PART_STATE_BY_DISPLAY_STATE[tool.state];
  const stableErrorCode = resolveStableToolErrorCode(tool.errorCode);

  return (
    <Tool
      className="mb-3 overflow-hidden bg-card"
      defaultOpen={tool.state === 'failed' || tool.state === 'waiting_approval'}
    >
      <ToolHeader
        className="motion-reduce:[&_svg]:animate-none"
        title={tool.title}
        type="tool-getDecisionContext"
        state={state}
      />
      <ToolContent className="border-t bg-muted/20 text-sm">
        <p className="text-muted-foreground">{TOOL_STATE_DESCRIPTION[tool.state]}</p>

        <dl className="grid gap-3 sm:grid-cols-2">
          <ToolSummaryItem label="输入范围">
            {tool.inputSummary ? `决策 #${tool.inputSummary.decisionId}` : '由当前会话范围确定'}
          </ToolSummaryItem>
          <ToolSummaryItem label="来源数量">{tool.sourceIds.length} 个</ToolSummaryItem>
          <ToolSummaryItem label="执行耗时">
            {formatToolDuration(tool.durationMs, tool.state)}
          </ToolSummaryItem>
          {stableErrorCode ? (
            <ToolSummaryItem label="稳定错误">
              <code className="break-all text-destructive">{stableErrorCode}</code>
            </ToolSummaryItem>
          ) : null}
        </dl>

        {tool.resultSummary ? (
          <section className="space-y-2 rounded-lg border bg-background p-3" aria-label="工具结果摘要">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{tool.resultSummary.decisionTitle}</p>
              <Badge variant="outline">{tool.resultSummary.decisionStatus}</Badge>
            </div>
            <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              <ToolSummaryItem label="所属项目">
                {tool.resultSummary.projectTitle}
              </ToolSummaryItem>
              <ToolSummaryItem label="讨论区域">
                {tool.resultSummary.areaName ?? '项目级决策'}
              </ToolSummaryItem>
              <ToolSummaryItem label="参与人数">
                {tool.resultSummary.participantCount} 人
              </ToolSummaryItem>
              <ToolSummaryItem label="读取决策">
                #{tool.resultSummary.decisionId}
              </ToolSummaryItem>
            </dl>
          </section>
        ) : null}
      </ToolContent>
    </Tool>
  );
}

/** 渲染工具卡中的单项安全摘要。 */
function ToolSummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  );
}

/** 只允许稳定业务错误码进入工具卡，避免渲染原始异常或内部地址。 */
function resolveStableToolErrorCode(errorCode: string | null): string | null {
  if (!errorCode) {
    return null;
  }

  const normalized = errorCode.trim();
  const isStableCode = /^[A-Z][A-Z0-9_]*(?:[._][A-Z0-9_]+)*$/.test(normalized);
  return isStableCode && normalized.length <= 80 ? normalized : 'AI.TOOL_EXECUTION_FAILED';
}

/** 将工具耗时转换为适合快速阅读且不会暴露时间戳的文本。 */
function formatToolDuration(durationMs: number | null, state: AiToolDisplayState): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return state === 'waiting' || state === 'running' || state === 'waiting_approval'
      ? '尚未完成'
      : '未记录';
  }

  if (durationMs < 1_000) {
    return `${Math.round(durationMs)} 毫秒`;
  }

  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
}
