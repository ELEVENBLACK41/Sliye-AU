/**
 * 本文件定义 AI 会话消息历史只读接口的共享契约。
 *
 * 数据范围与 Thread 历史一致：只能读取当前登录用户拥有的会话，
 * 越权统一表现为“会话不存在”，不区分无权与不存在。
 *
 * 这里只返回渲染聊天记录所需的展示数据：消息正文、所属 Run 的状态，
 * 以及该 Run 的工具调用摘要（工具名、执行状态与公开网页来源）。
 * **刻意不返回工具的输入与业务输出摘要**：业务工具输出承载真实业务事实
 * （例如决策上下文），一旦来源失权，历史接口就会成为泄漏面。
 * 这类内容属于来源失权投影的范围，在投影能力落地前不通过本接口暴露。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiMessage } from './ai-message.types.ts';
import type {
  AiRunCancellationReason,
  AiRunFailureReason,
  AiRunStatus,
} from './ai-run.types.ts';
import type { AiToolCallStatus } from './ai-tool.types.ts';

/** 联网检索结果允许在消息历史中公开展示的最小来源信息。 */
export type AiMessageWebSource = {
  /** 可在新标签页打开的网页地址。 */
  url: string;
  /** 检索服务返回的网页标题。 */
  title: string;
};

/** 消息列表单页默认返回条数。 */
export const AI_MESSAGE_PAGE_DEFAULT_LIMIT = 30;

/** 消息列表单页允许请求的最大条数。 */
export const AI_MESSAGE_PAGE_MAX_LIMIT = 100;

/**
 * 消息历史中的一次工具调用摘要。
 * 只包含工具卡渲染所需的状态和公开网页来源，不含模型输入和业务输出。
 */
export type AiMessageToolCall = {
  /** 工具调用记录标识。 */
  id: string;
  /** 已注册的稳定工具名称，由客户端映射为界面文案。 */
  toolName: string;
  /** 工具调用当前状态，用于区分运行中、已完成与失败。 */
  status: AiToolCallStatus;
  /** 工具执行耗时；未结束时为 `null`。 */
  durationMs: number | null;
  /** 失败时的稳定错误码；成功或运行中为 `null`。 */
  failureCode: ApiErrorCode | null;
  /** 失败时可安全展示的说明；成功或运行中为 `null`。 */
  failureReason: string | null;
  /** 联网检索返回的公开网页来源；其他工具固定为空数组。 */
  webSources: AiMessageWebSource[];
};

/**
 * 助手消息所属 Run 的展示快照。
 *
 * 用户消息没有对应 Run。助手消息必须能区分“已完成”“已取消”“失败”，
 * 否则失败与取消会被渲染成正常回答。
 */
export type AiMessageRun = {
  /** 生成该助手消息的 Run 标识。 */
  runId: string;
  /** Run 当前状态；终态之外表示这条回答仍在生成。 */
  status: AiRunStatus;
  /** 失败原因；非失败路径为 `null`。 */
  failureReason: AiRunFailureReason | null;
  /** 失败业务错误码；非失败路径为 `null`。 */
  failureCode: ApiErrorCode | null;
  /** 取消原因；非取消路径为 `null`。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 该 Run 内的工具调用摘要，按发起时间正序。 */
  toolCalls: AiMessageToolCall[];
};

/** 一条消息正文当前的可见性判定结果。 */
export const AI_MESSAGE_CONTENT_VISIBILITIES = [
  'VISIBLE',
  'SOURCE_REVOKED',
] as const;

/**
 * 消息正文可见性。
 *
 * `SOURCE_REVOKED` 表示这条回答依赖的业务来源已经不在当前用户的权限范围内。
 * 判定是**实时**的：来源权限恢复后会自动回到 `VISIBLE`，不需要任何显式重评。
 * 只会影响助手消息；用户自己写的消息不依赖他人授权，始终为 `VISIBLE`。
 */
export type AiMessageContentVisibility =
  (typeof AI_MESSAGE_CONTENT_VISIBILITIES)[number];

/**
 * 消息历史中的一条消息。
 *
 * 业务引用数据暂不提供：真实引用映射表尚未建立，本接口不返回占位或伪造的业务引用。
 * 联网检索使用 `run.toolCalls.webSources` 返回实际网页来源。
 *
 * **来源失权时的呈现约定**：`contentVisibility` 为 `SOURCE_REVOKED` 时，
 * 服务端已经把 `content` 清空、`run.toolCalls` 清空，不返回任何可推断信息。
 * 客户端必须渲染中性占位，且占位文案**不得**包含来源标题、摘要、名称或数量——
 * 从“有几处被隐藏”同样能反推出用户无权知道的信息。
 * 同时不要把它渲染成“AI 没有回答”：内容存在，只是当前不可见。
 */
export type AiMessageHistoryItem = AiMessage & {
  /** 助手消息所属 Run 的展示快照；用户消息为 `null`。 */
  run: AiMessageRun | null;
  /** 本条消息正文当前是否可见；不可见时正文与工具调用均已被清空。 */
  contentVisibility: AiMessageContentVisibility;
};

/**
 * 消息列表接口的游标查询参数。
 *
 * 游标规则：
 * - 聊天记录从最新一条开始向更早方向加载；
 * - `cursor` 是服务端生成的不透明字符串，绑定所属会话，不能跨会话或跨列表复用，
 *   非法或不匹配时返回 `AI.CURSOR_INVALID`；
 * - 首次请求省略 `cursor` 取得最新一页，之后传上一页返回的 `nextCursor` 继续向更早加载。
 */
export type AiMessageListQuery = {
  /** 上一页返回的不透明游标；首次请求省略。 */
  cursor?: string;
  /** 单页条数，缺省为 `AI_MESSAGE_PAGE_DEFAULT_LIMIT`，上限为 `AI_MESSAGE_PAGE_MAX_LIMIT`。 */
  limit?: number;
};

/**
 * 消息列表的游标分页结果。
 *
 * `items` **按时间正序返回**，可以直接渲染，客户端不需要再反转；
 * 而游标向更早方向推进，因此 `nextCursor` 指向本页**最早**一条消息。
 * 顺序在契约层固定下来，避免各客户端各自实现反转而出现不一致。
 */
export type AiMessagePage = {
  /** 当前页消息，按创建时间正序。 */
  items: AiMessageHistoryItem[];
  /** 继续向更早方向加载使用的不透明游标；没有更早消息时为 `null`。 */
  nextCursor: string | null;
  /** 是否仍有更早的消息可以继续加载。 */
  hasMore: boolean;
};
