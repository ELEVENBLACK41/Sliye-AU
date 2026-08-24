/**
 * 本文件定义 Decision Agent 的类型安全 UI 消息、运行元数据和工具部件。
 */

import type { InferUITools, UIMessage } from 'ai';
import type { AiRunScopeResolutionResponse, AiRunStreamMetadata } from '@workspace/contracts/ai';

import type { createDecisionAgentTools } from '../tools/registry';

/** AI UI 流允许发送的自定义数据部件。 */
export type AiUiDataParts = {
  /** 首个瞬时事件中的 Thread、Message 与 Run 定位信息。 */
  run: AiRunStreamMetadata;
  /** 模型执行前由 NestJS 权限过滤得到的 Run 范围快照。 */
  scope: AiRunScopeResolutionResponse;
};

/** 由中心工具注册表推导的 UI 工具输入输出类型。 */
export type AiUiTools = InferUITools<ReturnType<typeof createDecisionAgentTools>>;

/** Decision Agent 与 useChat 共享的完整 UI 消息类型。 */
export type AiDecisionUiMessage = UIMessage<unknown, AiUiDataParts, AiUiTools>;
