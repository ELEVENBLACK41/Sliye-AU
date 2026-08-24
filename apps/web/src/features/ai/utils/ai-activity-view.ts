/**
 * 本文件把权威 Run 与安全工具摘要组合为首次流和历史恢复共用的紧凑活动组 ViewModel。
 */

import type {
  AiRunCancellationReason,
  AiRunFailureReason,
  AiRunPublicSummary,
  AiRunStatus,
} from '@workspace/contracts/ai';

import type { AiToolCallView, AiToolDisplayState } from './ai-tool-call-view';

/** 活动组能够明确反馈的全部用户状态。 */
export type AiActivityDisplayState = AiToolDisplayState;

/** 活动组中的单条真实运行或工具步骤。 */
export type AiActivityStepView = {
  /** 在所属 Run 内稳定去重的步骤标识。 */
  id: string;
  /** 区分 Run 生命周期与结构化工具调用。 */
  kind: 'run' | 'tool';
  /** 当前步骤的可访问反馈状态。 */
  state: AiActivityDisplayState;
  /** 根据状态变形后的面向用户动作名称。 */
  label: string;
  /** 不包含内部实现的简短状态说明。 */
  description: string;
  /** 工具步骤允许展开的安全详情；Run 步骤不携带。 */
  tool: AiToolCallView | null;
};

/** 一个 Assistant Run 对应的稳定活动组。 */
export type AiActivityGroupView = {
  /** 使用 Run 主键形成的稳定活动组标识。 */
  id: string;
  /** 所属 Run 主键。 */
  runId: string;
  /** 历史恢复时可用于重试的公开 Run 摘要；首次瞬时流可能为空。 */
  run: AiRunPublicSummary | null;
  /** 综合 Run 与真实工具步骤得到的展示状态。 */
  state: AiActivityDisplayState;
  /** 收敛为一行时显示的当前动作或结果。 */
  title: string;
  /** 步骤数和来源数构成的安全摘要。 */
  summary: string;
  /** 面向辅助技术的明确状态名称。 */
  statusLabel: string;
  /** 失败或取消时允许显示的稳定业务说明。 */
  stableDetail: string | null;
  /** 当前组中的真实步骤，顺序由调用方传入的审计顺序决定。 */
  steps: AiActivityStepView[];
  /** 全部可见工具步骤读取的去重来源数量。 */
  sourceCount: number;
  /** 当前状态下的初始展开策略。 */
  defaultOpen: boolean;
  /** 是否允许基于原用户消息创建重试 Run。 */
  retryable: boolean;
};

/** 首次流尚未恢复公开 Run 时可使用的真实浏览器传输状态。 */
export type AiActivityTransportState = 'submitted' | 'streaming';

/** 从权威历史 Run 和可见工具调用创建可恢复活动组。 */
export function createHistoricalAiActivityGroup(
  run: AiRunPublicSummary,
  tools: AiToolCallView[],
): AiActivityGroupView {
  const runState = mapRunStatus(run.status);
  const steps = [createRunStep(run, runState), ...tools.map(createToolStep)];
  const state = resolveGroupState(runState, tools);

  return createActivityGroup({
    runId: run.id,
    run,
    state,
    steps,
    stableDetail: formatRunStableDetail(run),
    retryable: run.status === 'FAILED' || run.status === 'CANCELLED',
  });
}

/** 从 AI SDK 首次流的真实传输状态和工具部件创建瞬时活动组。 */
export function createLiveAiActivityGroup({
  runId,
  status,
  tools,
}: {
  runId: string;
  status: AiActivityTransportState;
  tools: AiToolCallView[];
}): AiActivityGroupView {
  const runState: AiActivityDisplayState = status === 'submitted' ? 'waiting' : 'running';
  const steps = [createTransportStep(runId, runState), ...tools.map(createToolStep)];
  const state = resolveGroupState(runState, tools);

  return createActivityGroup({
    runId,
    run: null,
    state,
    steps,
    stableDetail: null,
    retryable: false,
  });
}

/** 根据状态为活动组生成统一摘要、来源统计和展开策略。 */
function createActivityGroup({
  runId,
  run,
  state,
  steps,
  stableDetail,
  retryable,
}: {
  runId: string;
  run: AiRunPublicSummary | null;
  state: AiActivityDisplayState;
  steps: AiActivityStepView[];
  stableDetail: string | null;
  retryable: boolean;
}): AiActivityGroupView {
  const sourceCount = new Set(
    steps.flatMap((step) => (step.tool ? step.tool.sourceIds : [])),
  ).size;

  return {
    id: `activity:${runId}`,
    runId,
    run,
    state,
    title: getActivityTitle(state),
    summary: formatActivitySummary(steps.length, sourceCount),
    statusLabel: getActivityStatusLabel(state),
    stableDetail,
    steps,
    sourceCount,
    defaultOpen: state !== 'success',
    retryable,
  };
}

/** 用权威 Run 状态创建覆盖整个执行生命周期的真实步骤。 */
function createRunStep(run: AiRunPublicSummary, state: AiActivityDisplayState): AiActivityStepView {
  return {
    id: `run:${run.id}`,
    kind: 'run',
    state,
    label: getRunStepLabel(run.status),
    description: getRunStepDescription(run.status),
    tool: null,
  };
}

/** 用 AI SDK 当前请求状态创建仅存在于首次流期间的传输步骤。 */
function createTransportStep(runId: string, state: AiActivityDisplayState): AiActivityStepView {
  return {
    id: `run:${runId}`,
    kind: 'run',
    state,
    label: state === 'waiting' ? '等待开始分析' : '正在生成决策过程回答',
    description:
      state === 'waiting'
        ? '请求正在提交，持久化状态到达后会继续更新。'
        : '正在接收本次运行的结构化进度和回答。',
    tool: null,
  };
}

/** 将工具安全展示模型转成紧凑活动步骤。 */
function createToolStep(tool: AiToolCallView): AiActivityStepView {
  return {
    id: `tool:${tool.id}`,
    kind: 'tool',
    state: tool.state,
    label: getToolStepLabel(tool.title, tool.state),
    description: getToolStepDescription(tool.state),
    tool,
  };
}

/** Run 状态保持权威语义，只转换为活动组的公共展示状态。 */
function mapRunStatus(status: AiRunStatus): AiActivityDisplayState {
  switch (status) {
    case 'QUEUED':
      return 'waiting';
    case 'RUNNING':
    case 'CANCELLATION_REQUESTED':
      return 'running';
    case 'WAITING_APPROVAL':
      return 'waiting_approval';
    case 'CANCELLED':
      return 'cancelled';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'failed';
  }
}

/** 让真实失败、取消和审批步骤保持可发现，而不被成功 Run 静默覆盖。 */
function resolveGroupState(
  runState: AiActivityDisplayState,
  tools: AiToolCallView[],
): AiActivityDisplayState {
  const toolStates = new Set(tools.map((tool) => tool.state));

  if (runState === 'waiting_approval' || toolStates.has('waiting_approval')) return 'waiting_approval';
  if (runState === 'failed' || toolStates.has('failed')) return 'failed';
  if (runState === 'cancelled' || toolStates.has('cancelled')) return 'cancelled';
  if (runState === 'running' || toolStates.has('running')) return 'running';
  if (runState === 'waiting' || toolStates.has('waiting')) return 'waiting';
  return 'success';
}

/** 返回活动组收敛后的当前动作标题。 */
function getActivityTitle(state: AiActivityDisplayState): string {
  const titles: Record<AiActivityDisplayState, string> = {
    waiting: '等待整理决策形成过程',
    running: '正在整理决策形成过程',
    success: '已整理决策形成过程',
    failed: '决策过程整理未全部完成',
    cancelled: '已停止整理决策形成过程',
    waiting_approval: '等待继续整理决策形成过程',
  };
  return titles[state];
}

/** 返回不会只依赖颜色表达的活动状态名称。 */
function getActivityStatusLabel(state: AiActivityDisplayState): string {
  const labels: Record<AiActivityDisplayState, string> = {
    waiting: '等待中',
    running: '运行中',
    success: '已完成',
    failed: '存在失败步骤',
    cancelled: '已取消',
    waiting_approval: '等待审批',
  };
  return labels[state];
}

/** 用步骤数与来源数生成移动端也能快速阅读的安全摘要。 */
function formatActivitySummary(stepCount: number, sourceCount: number): string {
  const stepSummary = `${stepCount} 个步骤`;
  return sourceCount > 0 ? `${stepSummary} · ${sourceCount} 项来源` : stepSummary;
}

/** 将 Run 状态变成面向用户的业务步骤名称。 */
function getRunStepLabel(status: AiRunStatus): string {
  const labels: Record<AiRunStatus, string> = {
    QUEUED: '等待开始分析',
    RUNNING: '正在生成决策过程回答',
    WAITING_APPROVAL: '等待审批后继续',
    CANCELLATION_REQUESTED: '正在安全停止运行',
    CANCELLED: '已停止生成回答',
    COMPLETED: '已生成决策过程回答',
    FAILED: '未能生成决策过程回答',
  };
  return labels[status];
}

/** 为 Run 步骤提供不泄露执行实现的简短说明。 */
function getRunStepDescription(status: AiRunStatus): string {
  const descriptions: Record<AiRunStatus, string> = {
    QUEUED: '消息已保存，正在等待本次运行开始。',
    RUNNING: '正在生成回答，离开后仍可从历史会话恢复。',
    WAITING_APPROVAL: '运行已暂停，等待明确审批后才能继续。',
    CANCELLATION_REQUESTED: '停止请求已提交，正在等待当前执行安全结束。',
    CANCELLED: '本次运行已经停止，不会继续处理。',
    COMPLETED: '回答、工具结果和引用已经保存。',
    FAILED: '本次运行未完整结束，可查看稳定错误后重试。',
  };
  return descriptions[status];
}

/** 根据工具状态给业务动作添加一致的时态，不展示内部工具名。 */
function getToolStepLabel(title: string, state: AiToolDisplayState): string {
  const action = title.replace(/^(等待|正在|已|未能|停止)/u, '');
  const prefixes: Record<AiToolDisplayState, string> = {
    waiting: '等待',
    running: '正在',
    success: '已',
    failed: '未能',
    cancelled: '已停止',
    waiting_approval: '等待审批后',
  };
  return `${prefixes[state]}${action}`;
}

/** 为工具步骤生成与状态一致的用户说明。 */
function getToolStepDescription(state: AiToolDisplayState): string {
  const descriptions: Record<AiToolDisplayState, string> = {
    waiting: '步骤已进入队列，尚未读取业务数据。',
    running: '正在校验权限并读取允许访问的业务数据。',
    success: '权限校验和业务数据读取已经完成。',
    failed: '步骤未能完成，只展示可安全识别的错误。',
    cancelled: '步骤已经取消，不会继续读取业务数据。',
    waiting_approval: '步骤已暂停，获得明确审批前不会执行。',
  };
  return descriptions[state];
}

/** 将公开失败或取消原因转换为可操作且稳定的说明。 */
function formatRunStableDetail(run: AiRunPublicSummary): string | null {
  if (run.status === 'FAILED') {
    const reason = formatFailureReason(run.failureReason);
    return run.failureCode ? `${reason}（${run.failureCode}）` : reason;
  }

  if (run.status === 'CANCELLED' || run.status === 'CANCELLATION_REQUESTED') {
    return formatCancellationReason(run.cancellationReason);
  }

  return null;
}

/** 映射 Run 的稳定失败原因，不呈现模型或服务内部异常。 */
function formatFailureReason(reason: AiRunFailureReason | null): string {
  switch (reason) {
    case 'MODEL_ERROR':
      return '模型服务未能完成本次回答';
    case 'TOOL_ERROR':
      return '读取决策业务上下文时失败';
    case 'EXECUTION_LEASE_EXPIRED':
      return '本次运行未在有效时间内完成';
    case 'INTERNAL_ERROR':
    case null:
      return '运行暂时不可用';
  }
}

/** 映射 Run 的稳定取消原因，并区分用户停止与业务范围变化。 */
function formatCancellationReason(reason: AiRunCancellationReason | null): string {
  switch (reason) {
    case 'USER_REQUESTED':
      return '已按你的请求停止本次运行。';
    case 'SCOPE_CHANGED':
      return '当前决策的访问范围已变化，本次运行已安全停止。';
    case null:
      return '停止请求正在同步，稍后会恢复最终状态。';
  }
}
