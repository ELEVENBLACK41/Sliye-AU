/**
 * 本文件负责渲染 AI 对话中同一轮工具调用的风格折叠轨迹。
 */
import { ChevronRight, Wrench } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@workspace/ui/components/collapsible';

/** 当前 AI 测试机器人工具名对应的界面中文名称。 */
const AI_TOOL_LABELS: Record<string, string> = {
  findDecisionCandidates: '查找决策候选',
  getDecisionContext: '读取决策上下文',
  getMyDecisionParticipationStats: '统计参与决策',
  parallel_search: '网页检索',
};

/** AI SDK 工具消息在自定义 UI 中渲染所需的最小结构。 */
export type AiToolMessagePart = {
  /** 工具类型，格式固定为 `tool-<toolName>`。 */
  type: string;
  /** 当前工具调用的稳定标识，用于渲染同一轮内的多条调用。 */
  toolCallId: string;
  /** 当前工具调用的流式生命周期状态。 */
  state: string;
  /** 模型提交给工具的输入参数。 */
  input?: unknown;
  /** 工具执行完成后的结果。 */
  output?: unknown;
  /** 工具执行失败时可展示的安全错误摘要。 */
  errorText?: string;
};

/** 渲染工具调用前后共用的一行运行状态标签。 */
export function AiRunActivityLabel({
  label,
  isRunning,
  showChevron = false,
}: {
  label: string;
  isRunning: boolean;
  showChevron?: boolean;
}) {
  return (
    <span className="relative flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
      <Wrench className="size-3.5" aria-hidden />
      <span
        className={isRunning ? 'ai-tool-execution-text-wave' : undefined}
        data-wave-text={isRunning ? label : undefined}
      >
        {label}
      </span>
      {showChevron ? (
        <ChevronRight
          className="ai-tool-trigger-chevron size-3.5 text-muted-foreground transition-transform"
          aria-hidden
        />
      ) : null}
    </span>
  );
}

/** 将同一轮调用的多个工具收拢为一条可折叠的 Codex 式执行轨迹。 */
export function AiToolCallGroup({ parts }: { parts: AiToolMessagePart[] }) {
  const isRunning = parts.some((part) => part.state !== 'output-available' && part.state !== 'output-error');

  return (
    <Collapsible defaultOpen={false} className="my-1 overflow-hidden bg-transparent">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="relative h-auto w-fit gap-1.5 rounded-none px-0 py-1 text-left font-mono text-xs font-normal hover:bg-transparent focus-visible:ring-0 [&[data-state=open]_.ai-tool-trigger-chevron]:rotate-90"
        >
          <AiRunActivityLabel label="运行了工具" isRunning={isRunning} showChevron />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 py-1">
        {parts.map((part) => (
          <AiToolCallRow key={part.toolCallId} part={part} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 渲染分组中不支持再次展开的单条工具执行记录。 */
function AiToolCallRow({ part }: { part: AiToolMessagePart }) {
  const toolName = part.type.slice('tool-'.length);
  const isCompleted = part.state === 'output-available';
  const isFailed = part.state === 'output-error';
  const toolLabel = AI_TOOL_LABELS[toolName] ?? '只读信息查询';

  return (
    <div className="flex h-8 items-center gap-2 px-1 font-mono text-xs">
      <Wrench className="size-3.5 text-muted-foreground" aria-hidden />
      <span className={isFailed ? 'text-destructive' : 'text-muted-foreground'}>
        {isFailed ? '调用失败' : isCompleted ? '已运行' : '正在运行'}
      </span>
      <code className="truncate text-foreground">{toolLabel}</code>
    </div>
  );
}
